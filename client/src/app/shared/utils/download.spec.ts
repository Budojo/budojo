import { triggerBrowserDownload } from './download';

describe('triggerBrowserDownload', () => {
  let createSpy: ReturnType<typeof vi.spyOn>;
  let revokeSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let appendSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;
  let createdAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    createdAnchor = null;
    // jsdom's URL doesn't ship createObjectURL — stub it.
    createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:fake-url');
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {
      /* no-op */
    });

    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        createdAnchor = el as HTMLAnchorElement;
        clickSpy = vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          /* no-op */
        });
      }
      return el;
    });
    appendSpy = vi.spyOn(document.body, 'appendChild');
    removeSpy = vi.spyOn(document.body, 'removeChild');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an object URL, pins it on a hidden anchor, clicks, then cleans up', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    triggerBrowserDownload(blob, 'hello.txt');

    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(createdAnchor).not.toBeNull();
    expect(createdAnchor!.href).toContain('blob:fake-url');
    expect(createdAnchor!.download).toBe('hello.txt');
    expect(createdAnchor!.style.display).toBe('none');
    expect(appendSpy).toHaveBeenCalledWith(createdAnchor);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith(createdAnchor);
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-url');
  });

  it('uses the supplied filename verbatim (no sanitisation today)', () => {
    triggerBrowserDownload(new Blob([]), 'with spaces & special-chars (1).pdf');
    expect(createdAnchor).not.toBeNull();
    expect(createdAnchor!.download).toBe('with spaces & special-chars (1).pdf');
  });
});
