import { TestBed } from '@angular/core/testing';
import { BrandGlyphComponent } from './brand-glyph.component';

describe('BrandGlyphComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BrandGlyphComponent] });
  });

  it('renders an inline <svg> with the four Budojo strokes using currentColor', () => {
    const fixture = TestBed.createComponent(BrandGlyphComponent);
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(svg!.getAttribute('aria-hidden')).toBe('true');

    const group = svg!.querySelector('g');
    expect(group).not.toBeNull();
    expect(group!.getAttribute('stroke')).toBe('currentColor');

    // The four strokes that make up the glyph — guard against a path
    // being accidentally dropped during a future refactor.
    expect(svg!.querySelectorAll('path').length).toBe(4);
  });
});
