import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BeltBadgeComponent } from './belt-badge.component';
import { Belt } from '../../../core/services/athlete.service';

@Component({
  imports: [BeltBadgeComponent],
  template: `<app-belt-badge [belt]="belt" [stripes]="stripes" />`,
})
class HostComponent {
  belt: Belt = 'white';
  stripes = 0;
}

describe('BeltBadgeComponent', () => {
  it('capitalizes the belt name for the label', () => {
    TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.belt = 'blue';
    fixture.detectChanges();

    const badge = fixture.debugElement.query((el) => el.name === 'app-belt-badge');
    expect(badge.componentInstance.label()).toBe('Blue');
  });

  it.each<Belt>([
    // IBJJF Youth belts (#230).
    'grey',
    'yellow',
    'orange',
    'green',
    // IBJJF Adult belts.
    'white',
    'blue',
    'purple',
    'brown',
    'black',
    // IBJJF senior ranks beyond black (#229).
    'red-and-black',
    'red-and-white',
    'red',
  ])('resolves the style via --budojo-belt-%s-* custom properties', (belt) => {
    TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.belt = belt;
    fixture.detectChanges();

    const badge = fixture.debugElement.query((el) => el.name === 'app-belt-badge');
    const style = badge.componentInstance.style();
    expect(style['background']).toBe(`var(--budojo-belt-${belt}-bg)`);
    expect(style['color']).toBe(`var(--budojo-belt-${belt}-fg)`);
  });

  describe('stripes (#165)', () => {
    it('renders no stripe tiles when stripes input is 0 (default)', () => {
      TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const tiles = fixture.nativeElement.querySelectorAll(
        '[data-cy="belt-stripe-tile"]',
      ) as NodeListOf<Element>;
      expect(tiles.length).toBe(0);
    });

    it.each([1, 2, 3, 4])('renders %d stripe tiles inside the pill', (n) => {
      TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.stripes = n;
      fixture.detectChanges();
      const tiles = fixture.nativeElement.querySelectorAll(
        '[data-cy="belt-stripe-tile"]',
      ) as NodeListOf<Element>;
      expect(tiles.length).toBe(n);
    });

    it('clamps stripes per belt — non-black caps at 4, black caps at 6 (#229 review)', () => {
      TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });

      // White belt: bogus 99 must clamp to the white cap of 4 — NOT 6.
      // Without per-belt clamping, the badge would visually misrepresent
      // a stale row from a previous schema as a 5- or 6-stripe white.
      const whiteFixture = TestBed.createComponent(HostComponent);
      whiteFixture.componentInstance.belt = 'white';
      whiteFixture.componentInstance.stripes = 99;
      whiteFixture.detectChanges();
      const whiteTiles = whiteFixture.nativeElement.querySelectorAll(
        '[data-cy="belt-stripe-tile"]',
      ) as NodeListOf<Element>;
      expect(whiteTiles.length).toBe(4);

      // Black belt: bogus 99 clamps to 6, the genuine black-belt cap.
      const blackFixture = TestBed.createComponent(HostComponent);
      blackFixture.componentInstance.belt = 'black';
      blackFixture.componentInstance.stripes = 99;
      blackFixture.detectChanges();
      const blackTiles = blackFixture.nativeElement.querySelectorAll(
        '[data-cy="belt-stripe-tile"]',
      ) as NodeListOf<Element>;
      expect(blackTiles.length).toBe(6);
    });

    it('renders 5-6 tiles on a black belt (graus 5° / 6°, #229)', () => {
      TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.belt = 'black';
      fixture.componentInstance.stripes = 6;
      fixture.detectChanges();
      const tiles = fixture.nativeElement.querySelectorAll(
        '[data-cy="belt-stripe-tile"]',
      ) as NodeListOf<Element>;
      expect(tiles.length).toBe(6);
    });

    it('exposes an aria-label on the stripe group for screen readers', () => {
      TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.stripes = 2;
      fixture.detectChanges();
      const group = fixture.nativeElement.querySelector('.belt-badge__stripes');
      expect(group?.getAttribute('aria-label')).toBe('2 stripes');
    });

    it('uses singular "stripe" in aria-label when count is 1', () => {
      TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.stripes = 1;
      fixture.detectChanges();
      const group = fixture.nativeElement.querySelector('.belt-badge__stripes');
      expect(group?.getAttribute('aria-label')).toBe('1 stripe');
    });
  });
});
