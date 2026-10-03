import { utf8 } from './bytes';
import { importSyncKey, newSyncKey, openJson, seal } from './envelope';
import { checkFolder, hasRoomFor, sealFolder } from './folder';
import { devicePath, FOLDER_PATH } from './layout';
import { MemoryRemote } from './remote';

/** `sync/folder.bjs`, checked before every round (protocol § The keys, #2046). */
describe('checkFolder', () => {
  const FOLDER = 'a'.repeat(32);

  it('writes the id into a new, empty folder, and finds it its own after', async () => {
    const remote = new MemoryRemote();
    const key = await importSyncKey(newSyncKey());

    expect(await checkFolder(remote, key, FOLDER)).toBe('ours');
    expect(await openJson(key, FOLDER_PATH, (await remote.read(FOLDER_PATH))!)).toEqual({
      v: 1,
      folder: FOLDER,
    });
    expect(await checkFolder(remote, key, FOLDER)).toBe('ours');
  });

  it('asks when the id is missing from a folder that holds devices or versions: never writes over it', async () => {
    const remote = new MemoryRemote();
    const key = await importSyncKey(newSyncKey());
    await remote.write(devicePath('pc4f2a'), utf8('a report'));

    expect(await checkFolder(remote, key, FOLDER)).toBe('another');
    expect(await remote.read(FOLDER_PATH)).toBeNull();
  });

  it('asks when the folder names another id: another academy’s folder', async () => {
    const remote = new MemoryRemote();
    const key = await importSyncKey(newSyncKey());
    await remote.write(FOLDER_PATH, await sealFolder(key, 'b'.repeat(32)));

    expect(await checkFolder(remote, key, FOLDER)).toBe('another');
  });

  it('stops when the id does not open under its key: the device was unpaired', async () => {
    const remote = new MemoryRemote();
    const rotated = await importSyncKey(newSyncKey());
    await remote.write(FOLDER_PATH, await sealFolder(rotated, FOLDER));

    expect(await checkFolder(remote, await importSyncKey(newSyncKey()), FOLDER)).toBe('unpaired');
  });

  it('asks when the file opens but holds no folder id', async () => {
    const remote = new MemoryRemote();
    const key = await importSyncKey(newSyncKey());
    await remote.write(FOLDER_PATH, await seal(key, FOLDER_PATH, utf8('not json')));

    expect(await checkFolder(remote, key, FOLDER)).toBe('another');
  });
});

/** Two devices at most, the PC and the phone (protocol § Scope). */
describe('hasRoomFor', () => {
  it('lets a device in beside one other, and one already there whatever the count', async () => {
    const remote = new MemoryRemote();
    await remote.write(devicePath('pc4f2a'), utf8('a report'));
    expect(await hasRoomFor(remote, 'phone9c1e')).toBe(true);

    await remote.write(devicePath('phone9c1e'), utf8('a report'));
    expect(await hasRoomFor(remote, 'phone9c1e')).toBe(true);
    expect(await hasRoomFor(remote, 'pc4f2a')).toBe(true);
  });

  it('refuses a third device', async () => {
    const remote = new MemoryRemote();
    await remote.write(devicePath('pc4f2a'), utf8('a report'));
    await remote.write(devicePath('phone9c1e'), utf8('a report that does not open'));

    expect(await hasRoomFor(remote, 'phone7k2m')).toBe(false);
  });

  it('refuses the later of two devices that joined at once, though its report is there (#2106)', async () => {
    const remote = new MemoryRemote();
    await remote.write(devicePath('pc4f2a'), utf8('a report'));
    // Both found room beside the PC alone, and both wrote a report.
    await remote.write(devicePath('phone9c1e'), utf8('a report'));
    await remote.write(devicePath('phone7k2m'), utf8('a report'));
    // A report written again keeps the time it reached Drive first.
    await remote.write(devicePath('phone7k2m'), utf8('a later report'));

    expect(await hasRoomFor(remote, 'pc4f2a')).toBe(true);
    expect(await hasRoomFor(remote, 'phone9c1e')).toBe(true);
    expect(await hasRoomFor(remote, 'phone7k2m')).toBe(false);
  });
});
