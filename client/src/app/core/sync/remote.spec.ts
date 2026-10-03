import { followingFolder, MemoryRemote, SyncRemote } from './remote';

/** The sync's remote, started afresh when the folder changes (#2106). */
describe('followingFolder', () => {
  it('keeps one remote while the folder stays, and makes a new one when another account’s folder comes', async () => {
    const made: MemoryRemote[] = [];
    const { remote, follow } = followingFolder((): SyncRemote => {
      const fresh = new MemoryRemote();
      made.push(fresh);
      return fresh;
    });

    follow('folder-a');
    await remote.write('versions/000001-pc4f2a.root.bjs', new Uint8Array([1]));
    follow('folder-a');
    expect(made).toHaveLength(1);
    expect((await remote.list('versions')).files).toHaveLength(1);

    follow('folder-b');
    expect(made).toHaveLength(2);
    expect((await remote.list('versions')).files).toEqual([]);

    follow(null);
    expect(made).toHaveLength(3);
  });
});
