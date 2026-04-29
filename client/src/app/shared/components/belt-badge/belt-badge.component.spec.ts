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

    it('clamps stripes outside 0-4 to the IBJJF range (defensive against bad data)', () => {
      TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });
      const fixture = TestBed.createComponent(HostComponent);
      // 99 is bogus — must not render 99 tiles.
      fixture.componentInstance.stripes = 99;
      fixture.detectChanges();
      const tiles = fixture.nativeElement.querySelectorAll(
        '[data-cy="belt-stripe-tile"]',
      ) as NodeListOf<Element>;
      expect(tiles.length).toBe(4);
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
