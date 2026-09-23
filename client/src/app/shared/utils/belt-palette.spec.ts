import { beltCanvasFill, beltPaint, resolveBeltColour } from './belt-palette';

/**
 * The canvas half of the palette (#1801): the stats doughnut and the share card
 * cannot read a custom property, so they resolve the token and — for a
 * two-colour belt — tile it. jsdom loads no stylesheet and has no canvas, so
 * both are stubbed here; without the stubs every test would exit on the empty
 * colour and prove nothing.
 */
describe('belt palette — canvas fills', () => {
  const PALETTE: Record<string, string> = {
    '--budojo-belt-red': '#b91c1c',
    '--budojo-belt-black': '#111827',
    '--budojo-belt-blue': '#1d4ed8',
  };

  beforeEach(() => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => PALETTE[name] ?? '',
    } as unknown as CSSStyleDeclaration);
  });

  afterEach(() => vi.restoreAllMocks());

  it('splits a belt into its main colour and the second one', () => {
    expect(beltPaint('red-and-black')).toEqual({ main: 'red', tip: 'black' });
    expect(beltPaint('blue')).toEqual({ main: 'blue', tip: null });
  });

  it('resolves a colour from the theme token', () => {
    expect(resolveBeltColour('blue')).toBe('#1d4ed8');
  });

  it('fills a one-colour belt with its colour', () => {
    expect(beltCanvasFill('blue')).toBe('#1d4ed8');
  });

  it('tiles a two-colour belt: the main colour, then a band of the second', () => {
    const painted: [string, number, number, number, number][] = [];
    let fill = '';
    const pattern = { tag: 'pattern' } as unknown as CanvasPattern;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      set fillStyle(v: string) {
        fill = v;
      },
      fillRect: (x: number, y: number, w: number, h: number) => painted.push([fill, x, y, w, h]),
      createPattern: () => pattern,
    } as never);

    expect(beltCanvasFill('red-and-black')).toBe(pattern);
    expect(painted).toEqual([
      ['#b91c1c', 0, 0, 16, 16],
      ['#111827', 10, 0, 6, 16],
    ]);
  });

  it('falls back to the main colour where there is no canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(beltCanvasFill('red-and-black')).toBe('#b91c1c');
  });
});
