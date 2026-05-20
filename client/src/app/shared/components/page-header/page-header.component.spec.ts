import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { PageHeaderComponent } from './page-header.component';

@Component({
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <app-page-header
      [title]="title"
      [countLabel]="countLabel"
      [eyebrow]="eyebrow"
      [subtitle]="subtitle"
    >
      @if (showCta) {
        <button pageHeaderCta type="button" data-cy="host-cta">Add</button>
      }
    </app-page-header>
  `,
})
class HostComponent {
  title = 'Atleti';
  countLabel: string | null = null;
  eyebrow: string | null = null;
  subtitle: string | null = null;
  showCta = false;
}

describe('PageHeaderComponent (#883)', () => {
  it('renders the title as H1', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.title = 'Feed';
    fixture.detectChanges();

    const h1 = fixture.nativeElement.querySelector('[data-cy="page-header-title"]');
    expect(h1.tagName).toBe('H1');
    expect(h1.textContent.trim()).toBe('Feed');
  });

  it('hides the count chip when countLabel is null', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.title = 'Settings';
    fixture.componentInstance.countLabel = null;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="page-header-count"]')).toBeNull();
  });

  it('renders the count chip when countLabel is provided', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.title = 'Atleti';
    fixture.componentInstance.countLabel = '12 totali';
    fixture.detectChanges();

    const count = fixture.nativeElement.querySelector('[data-cy="page-header-count"]');
    expect(count).not.toBeNull();
    expect(count.textContent.trim()).toBe('12 totali');
  });

  it('projects the CTA via the pageHeaderCta slot', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.title = 'Atleti';
    fixture.componentInstance.showCta = true;
    fixture.detectChanges();

    const cta = fixture.nativeElement.querySelector('[data-cy="host-cta"]');
    expect(cta).not.toBeNull();
    expect(cta.textContent.trim()).toBe('Add');
  });

  it('renders the eyebrow when provided', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.title = 'Daily attendance';
    fixture.componentInstance.eyebrow = 'PRESENZE';
    fixture.detectChanges();

    const eyebrow = fixture.nativeElement.querySelector('[data-cy="page-header-eyebrow"]');
    expect(eyebrow).not.toBeNull();
    expect(eyebrow.textContent.trim()).toBe('PRESENZE');
  });

  it('hides the eyebrow when null', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.title = 'Settings';
    fixture.componentInstance.eyebrow = null;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="page-header-eyebrow"]')).toBeNull();
  });

  it('renders the subtitle when provided', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.title = 'Impostazioni';
    fixture.componentInstance.subtitle = 'Account, sicurezza, notifiche.';
    fixture.detectChanges();

    const sub = fixture.nativeElement.querySelector('[data-cy="page-header-subtitle"]');
    expect(sub).not.toBeNull();
    expect(sub.textContent.trim()).toBe('Account, sicurezza, notifiche.');
  });

  it('hides the subtitle when null', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.title = 'Atleti';
    fixture.componentInstance.subtitle = null;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="page-header-subtitle"]')).toBeNull();
  });

  it('omits the CTA wrapper visually when no content is projected (no orphan empty div)', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.title = 'Settings';
    fixture.componentInstance.showCta = false;
    fixture.detectChanges();

    // The wrapper exists in the DOM (it's a ng-content slot host) but
    // CSS hides it when empty so the header collapses cleanly.
    const wrapper = fixture.nativeElement.querySelector('.page-header__cta');
    expect(wrapper).not.toBeNull();
    expect(wrapper.children).toHaveLength(0);
  });
});
