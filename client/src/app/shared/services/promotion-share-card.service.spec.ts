import { TestBed } from '@angular/core/testing';
import { PromotionShareCardService } from './promotion-share-card.service';

/**
 * Pure-canvas share-card generator (#959). jsdom doesn't ship a real
 * canvas 2D implementation, so the spec asserts the API contract
 * (resolves to a Blob, threads dimensions, rejects gracefully) via a
 * no-op stubbed context — the actual painting is exercised by the
 * Cypress E2E smoke (real browser).
 */
function stubCanvas2D(): void {
  const noop = (): void => {
    /* */
  };
  // Minimal subset of CanvasRenderingContext2D the service touches.
  const fakeCtx = {
    createLinearGradient: () => ({ addColorStop: noop }),
    fillRect: noop,
    fillText: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    closePath: noop,
    fill: noop,
    set fillStyle(_v: unknown) {
      /* */
    },
    get fillStyle() {
      return '';
    },
    set font(_v: unknown) {
      /* */
    },
    get font() {
      return '';
    },
    set textAlign(_v: unknown) {
      /* */
    },
    get textAlign() {
      return '';
    },
  } as unknown as CanvasRenderingContext2D;

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as never);
  HTMLCanvasElement.prototype.toBlob = function (callback) {
    callback(new Blob(['fake-png-bytes'], { type: 'image/png' }));
  };
}

describe('PromotionShareCardService (#959)', () => {
  let service: PromotionShareCardService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PromotionShareCardService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('resolves to a non-empty PNG blob for a typical belt promotion', async () => {
    stubCanvas2D();
    const blob = await service.toBlob({
      athleteName: 'Mario Rossi',
      fromBelt: 'white',
      toBelt: 'blue',
      academyName: 'BJJ Roma',
      date: '2026-05-23',
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('image/png');
  });

  it('handles a first-time promotion with no fromBelt (skips the transition line)', async () => {
    stubCanvas2D();
    const blob = await service.toBlob({
      athleteName: 'Alice',
      fromBelt: null,
      toBelt: 'white',
      academyName: 'BJJ Roma',
      date: '2026-05-23',
    });
    expect(blob).toBeInstanceOf(Blob);
  });

  it('sets canvas dims to 1080x1920 on story variant', async () => {
    stubCanvas2D();
    // Capture the canvas instance via createElement spy so we read
    // width/height AFTER the service set them.
    let capturedCanvas: HTMLCanvasElement | null = null;
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'canvas') capturedCanvas = el as HTMLCanvasElement;
      return el;
    });
    await service.toBlob(
      {
        athleteName: 'M',
        fromBelt: 'white',
        toBelt: 'blue',
        academyName: 'A',
        date: '2026-05-23',
      },
      'story',
    );
    expect(capturedCanvas!.width).toBe(1080);
    expect(capturedCanvas!.height).toBe(1920);
  });

  it('sets canvas dims to 1080x1080 on square variant', async () => {
    stubCanvas2D();
    let capturedCanvas: HTMLCanvasElement | null = null;
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'canvas') capturedCanvas = el as HTMLCanvasElement;
      return el;
    });
    await service.toBlob(
      {
        athleteName: 'M',
        fromBelt: 'blue',
        toBelt: 'purple',
        academyName: 'A',
        date: '2026-05-23',
      },
      'square',
    );
    expect(capturedCanvas!.width).toBe(1080);
    expect(capturedCanvas!.height).toBe(1080);
  });

  it('rejects when canvas 2D context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(
      service.toBlob({
        athleteName: 'M',
        fromBelt: 'white',
        toBelt: 'blue',
        academyName: 'A',
        date: '2026-05-23',
      }),
    ).rejects.toThrow('Canvas 2D context unavailable');
  });
});
