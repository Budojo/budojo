import { loadNamed, saveNamed } from './named-store';

/** What each kept version names, kept on the device between runs (#2118). */
describe('the named-versions store', () => {
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);
  const owner = { device: 'phone9c1e', folder: 'f'.repeat(32) };
  const named = new Map([
    ['versions/000001-pc4f2a.root.bjs@1000', [A, B]],
    ['versions/000002-pc4f2a.000001-pc4f2a.bjs@2000', [A]],
    ['versions/000003-pc4f2a.000002-pc4f2a.bjs@3000', []],
  ]);

  beforeEach(() => localStorage.clear());

  it('keeps what each version names across launches, each content written once', () => {
    saveNamed(owner, named);

    expect(loadNamed(owner)).toEqual(named);
    const saved = JSON.parse(localStorage.getItem('budojoSyncNamed') as string) as {
      contents: string[];
    };
    expect(saved.contents).toEqual([A, B]);
  });

  it('starts empty with nothing saved, and for another device or folder', () => {
    expect(loadNamed(owner).size).toBe(0);
    saveNamed(owner, named);
    expect(loadNamed({ ...owner, device: 'phone7k2m' }).size).toBe(0);
    expect(loadNamed({ ...owner, folder: 'e'.repeat(32) }).size).toBe(0);
  });

  it('forgets everything it cannot read for certain: the versions are then read again', () => {
    const store = (value: unknown) =>
      localStorage.setItem('budojoSyncNamed', JSON.stringify(value));
    const base = { device: owner.device, folder: owner.folder };

    store({ ...base, contents: [A], versions: { v: [0, 1] } });
    expect(loadNamed(owner).size).toBe(0);
    store({ ...base, contents: ['not a hash'], versions: { v: [0] } });
    expect(loadNamed(owner).size).toBe(0);
    store({ ...base, contents: [A], versions: { v: '0' } });
    expect(loadNamed(owner).size).toBe(0);
    localStorage.setItem('budojoSyncNamed', 'not json');
    expect(loadNamed(owner).size).toBe(0);
  });

  it('never throws when the storage does: full, or blocked', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    } as unknown as Storage;

    expect(() => saveNamed(owner, named, broken)).not.toThrow();
    expect(loadNamed(owner, broken).size).toBe(0);
  });
});
