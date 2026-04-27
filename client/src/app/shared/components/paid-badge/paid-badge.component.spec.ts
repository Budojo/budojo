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
});
