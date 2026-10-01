import {
  driveAuthPlugin,
  isZip,
  PHONE_PROBE_NAME,
  PHONE_PROBE_TEXT,
  runDriveProbe,
} from './drive-spike';

interface Call {
  url: string;
  init?: RequestInit;
}

/**
 * A Drive that answers like the real one for the five calls the probe makes.
 * `files` is the Budojo folder's content; uploads land in it.
 */
function fakeDrive(options: {
  folder: boolean;
  files?: { id: string; name: string; size: string }[];
}) {
  const calls: Call[] = [];
  const files = [...(options.files ?? [])];
  const contents = new Map<string, Uint8Array>();
  contents.set('pc-new', new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
  contents.set('pc-old', new Uint8Array([0x50, 0x4b, 0x03, 0x04]));

  const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (url.includes('/about?')) {
      return Response.json({ user: { emailAddress: 'owner@example.it' } });
    }
    if (url.includes('/upload/drive/v3/files')) {
      const id = `phone-${files.length}`;
      files.push({ id, name: PHONE_PROBE_NAME, size: String(PHONE_PROBE_TEXT.length) });
      contents.set(id, new TextEncoder().encode(PHONE_PROBE_TEXT));
      return Response.json({ id });
    }
    const media = /files\/([^?]+)\?alt=media/.exec(url);
    if (media) {
      const bytes = contents.get(media[1]) ?? new Uint8Array();
      return new Response(bytes.slice(), { status: 206 });
    }
    const query = new URL(url).searchParams.get('q') ?? '';
    if (query.includes("mimeType='application/vnd.google-apps.folder'")) {
      return Response.json({ files: options.folder ? [{ id: 'folder-1' }] : [] });
    }
    return Response.json({ files });
  };

  return { fetcher, calls, files };
}

describe('the Drive probe (#2028)', () => {
  it('stops at a missing folder and writes nothing: the PC has to create it first', async () => {
    const drive = fakeDrive({ folder: false });

    const probe = await runDriveProbe('token', { previouslyWritten: false }, drive.fetcher);

    expect(probe.account).toBe('owner@example.it');
    expect(probe.folder).toBe('missing');
    expect(drive.calls.some((call) => call.init?.method === 'POST')).toBe(false);
  });

  it("reads the PC's newest archive, and writes the phone's file into the PC's folder", async () => {
    const drive = fakeDrive({
      folder: true,
      files: [
        { id: 'pc-old', name: 'budojo-backup-20260929-090000.zip', size: '1000' },
        { id: 'pc-new', name: 'budojo-backup-20261001-090000.zip', size: '2000' },
        { id: 'other', name: 'notes.txt', size: '3' },
      ],
    });

    const probe = await runDriveProbe('token', { previouslyWritten: false }, drive.fetcher);

    expect(probe.folder).toBe('found');
    expect(probe.pcArchives.map((file) => file.name)).toEqual([
      'budojo-backup-20261001-090000.zip',
      'budojo-backup-20260929-090000.zip',
    ]);
    expect(probe.newestRead).toBe('zip');
    const read = drive.calls.find((call) => call.url.includes('pc-new?alt=media'));
    expect(new Headers(read?.init?.headers).get('Range')).toBe('bytes=0-3');
    expect(probe.phoneFile).toBe('written');
    expect(probe.readBack).toBe(true);

    const upload = drive.calls.find((call) => call.url.includes('/upload/'));
    expect(upload?.url).toContain('uploadType=multipart');
    expect(String(upload?.init?.body)).toContain('"parents":["folder-1"]');
    expect(new Headers(upload?.init?.headers).get('Authorization')).toBe('Bearer token');
  });

  it("does not write the phone's file twice", async () => {
    const drive = fakeDrive({
      folder: true,
      files: [{ id: 'phone-0', name: PHONE_PROBE_NAME, size: '10' }],
    });

    const probe = await runDriveProbe('token', { previouslyWritten: true }, drive.fetcher);

    expect(probe.phoneFile).toBe('still-there');
    expect(probe.pcArchives).toEqual([]);
    expect(probe.newestRead).toBeNull();
    expect(drive.calls.some((call) => call.url.includes('/upload/'))).toBe(false);
  });

  it('says when a file it wrote before has gone, which only the PC or the owner can do, and writes it again', async () => {
    const drive = fakeDrive({ folder: true });

    const probe = await runDriveProbe('token', { previouslyWritten: true }, drive.fetcher);

    expect(probe.phoneFile).toBe('gone-and-rewritten');
    expect(drive.files.map((file) => file.name)).toEqual([PHONE_PROBE_NAME]);
  });

  it('carries the status of a failed Drive call, so a 401 can be told apart', async () => {
    const fetcher = async () => new Response('{}', { status: 401 });

    await expect(
      runDriveProbe('token', { previouslyWritten: false }, fetcher),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('names the phone file like an archive the PC would prune first', () => {
    // The PC lists only names of this shape (desktop/src/backup.ts), and the
    // oldest date means its retention can only ever drop this file, never a real one.
    expect(PHONE_PROBE_NAME).toMatch(/^budojo-backup-\d{8}-\d{6}\.zip$/);
    expect(PHONE_PROBE_NAME).toContain('20000101');
  });

  it('knows a zip by its first four bytes', () => {
    expect(isZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(isZip(new TextEncoder().encode('PK'))).toBe(false);
  });

  it('finds no plugin in a browser', () => {
    expect(driveAuthPlugin()).toBeNull();
  });
});
