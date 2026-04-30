import { TestBed } from '@angular/core/testing';
import { PaidBadgeComponent } from './paid-badge.component';

describe('PaidBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PaidBadgeComponent] });
  });

  it('renders a "Paid" tag when paid=true', () => {
    const fixture = TestBed.createComponent(PaidBadgeComponent);
    fixture.componentRef.setInput('paid', true);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('[data-cy="paid-badge"]') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Paid');
  });

  it('renders an "Unpaid" tag when paid=false', () => {
    const fixture = TestBed.createComponent(PaidBadgeComponent);
    fixture.componentRef.setInput('paid', false);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('[data-cy="paid-badge"]') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Unpaid');
  });

  it('renders nothing when paid is undefined (field absent / not loaded)', () => {
    const fixture = TestBed.createComponent(PaidBadgeComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="paid-badge"]')).toBeNull();
  });

  describe('interactive mode (#182)', () => {
    it('renders a passive tag when clickable=false (default — legacy callsites)', () => {
      const fixture = TestBed.createComponent(PaidBadgeComponent);
      fixture.componentRef.setInput('paid', true);
      fixture.detectChanges();

      // No wrapping button — the badge stays read-only.
      expect(fixture.nativeElement.querySelector('[data-cy="paid-badge-button"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="paid-badge"]')).not.toBeNull();
    });

    it('wraps the tag in a button when clickable=true', () => {
      const fixture = TestBed.createComponent(PaidBadgeComponent);
      fixture.componentRef.setInput('paid', true);
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector(
        '[data-cy="paid-badge-button"]',
      ) as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.tagName).toBe('BUTTON');
      // a11y: the wrapping button labels the action ("Mark unpaid" when
      // currently paid). Otherwise screen readers would just read the
      // inner tag's "Paid" text — useless for someone who can't see the
      // badge.
      expect(button!.getAttribute('aria-label')).toBe('Mark unpaid');
    });

    it('button label flips to "Mark paid" when paid=false', () => {
      const fixture = TestBed.createComponent(PaidBadgeComponent);
      fixture.componentRef.setInput('paid', false);
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector(
        '[data-cy="paid-badge-button"]',
      ) as HTMLButtonElement;
      expect(button.getAttribute('aria-label')).toBe('Mark paid');
    });

    it('emits `paidToggle` with the MouseEvent when the wrapping button is clicked', () => {
      const fixture = TestBed.createComponent(PaidBadgeComponent);
      fixture.componentRef.setInput('paid', true);
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      const spy = vi.fn();
      fixture.componentInstance.paidToggle.subscribe(spy);

      const button = fixture.nativeElement.querySelector(
        '[data-cy="paid-badge-button"]',
      ) as HTMLButtonElement;
      button.click();

      // Emits the MouseEvent so the parent can anchor a p-confirmpopup
      // on `event.currentTarget`. Without the event the popup floats.
      expect(spy).toHaveBeenCalledTimes(1);
      const evt = spy.mock.calls[0][0];
      expect(evt).toBeInstanceOf(MouseEvent);
    });

    it('renders nothing when paid=undefined even with clickable=true', () => {
      // Defensive — a clickable button with no underlying state would
      // be confusing UX. Same null-render rule as the read-only path.
      const fixture = TestBed.createComponent(PaidBadgeComponent);
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-cy="paid-badge-button"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="paid-badge"]')).toBeNull();
    });
  });
});
