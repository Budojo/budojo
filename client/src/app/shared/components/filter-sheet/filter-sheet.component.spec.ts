import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { FilterSheetComponent } from './filter-sheet.component';

/**
 * Tiny host that exercises the public API surface: `activeCount`
 * input, `apply` + `resetClick` outputs, plus the `<ng-content>`
 * slot. `active` is a signal so we can flip it between cases without
 * tripping ExpressionChangedAfterItHasBeenCheckedError.
 */
@Component({
  imports: [FilterSheetComponent],
  template: `
    <app-filter-sheet [activeCount]="active()" (apply)="onApply()" (resetClick)="onReset()">
      <span data-cy="projected-body">projected</span>
    </app-filter-sheet>
  `,
})
class HostComponent {
  readonly active = signal(0);
  applied = 0;
  reset = 0;
  onApply() {
    this.applied += 1;
  }
  onReset() {
    this.reset += 1;
  }
}

describe('FilterSheetComponent (#704)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [...provideI18nTesting()],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the chip with no badge when activeCount is 0', () => {
    const fixture = setup();
    expect(fixture.nativeElement.querySelector('[data-cy="filter-sheet-chip"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-cy="filter-sheet-badge"]')).toBeNull();
  });

  it('renders the badge with the active count when > 0', () => {
    const fixture = setup();
    fixture.componentInstance.active.set(3);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('[data-cy="filter-sheet-badge"]');
    expect(badge?.textContent?.trim()).toBe('3');
  });

  it('opens the sheet on chip click and projects the body content', () => {
    const fixture = setup();
    const chip = fixture.nativeElement.querySelector(
      '[data-cy="filter-sheet-chip"]',
    ) as HTMLButtonElement;
    chip.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="filter-sheet-panel"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-cy="projected-body"]')).toBeTruthy();
  });

  it('emits apply on apply CTA and closes the sheet', () => {
    const fixture = setup();
    (
      fixture.nativeElement.querySelector('[data-cy="filter-sheet-chip"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('[data-cy="filter-sheet-apply"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.applied).toBe(1);
    expect(fixture.nativeElement.querySelector('[data-cy="filter-sheet-panel"]')).toBeNull();
  });

  it('emits reset on reset CTA without closing the sheet', () => {
    const fixture = setup();
    (
      fixture.nativeElement.querySelector('[data-cy="filter-sheet-chip"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('[data-cy="filter-sheet-reset"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.reset).toBe(1);
    expect(fixture.nativeElement.querySelector('[data-cy="filter-sheet-panel"]')).toBeTruthy();
  });

  it('closes the sheet when Escape is pressed', () => {
    const fixture = setup();
    (
      fixture.nativeElement.querySelector('[data-cy="filter-sheet-chip"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="filter-sheet-panel"]')).toBeNull();
  });
});
