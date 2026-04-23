import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BeltBadgeComponent } from './belt-badge.component';
import { Belt } from '../../../core/services/athlete.service';

@Component({
  imports: [BeltBadgeComponent],
  template: `<app-belt-badge [belt]="belt" />`,
})
class HostComponent {
  belt: Belt = 'white';
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

  it.each<Belt>(['white', 'blue', 'purple', 'brown', 'black'])(
    'resolves the style via --budojo-belt-%s-* custom properties',
    (belt) => {
      TestBed.configureTestingModule({ imports: [BeltBadgeComponent, HostComponent] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.belt = belt;
      fixture.detectChanges();

      const badge = fixture.debugElement.query((el) => el.name === 'app-belt-badge');
      const style = badge.componentInstance.style();
      expect(style['background']).toBe(`var(--budojo-belt-${belt}-bg)`);
      expect(style['color']).toBe(`var(--budojo-belt-${belt}-fg)`);
    },
  );
});
