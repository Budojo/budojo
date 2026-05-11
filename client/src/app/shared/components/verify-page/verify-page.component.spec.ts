import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VerifyPageComponent } from './verify-page.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

@Component({
  standalone: true,
  imports: [VerifyPageComponent],
  template: `<app-verify-page
    [state]="state"
    [iconClass]="iconClass"
    [titleKey]="titleKey"
    [titleDataCy]="titleDataCy"
    [messageKey]="messageKey"
    [hintKey]="hintKey"
    [hintDataCy]="hintDataCy"
  >
    <button type="button" data-cy="host-cta">cta</button>
  </app-verify-page>`,
})
class HostComponent {
  state: 'loading' | 'success' | 'error' | 'neutral' = 'success';
  iconClass: string | null = 'pi pi-check-circle';
  titleKey = 'shared.verifyPage.title';
  titleDataCy: string | null = null;
  messageKey: string | null = null;
  hintKey: string | null = null;
  hintDataCy: string | null = null;
}

function setup(overrides: Partial<HostComponent> = {}) {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [...provideI18nTesting()],
  });

  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('VerifyPageComponent (shared chrome for auth verify flows, #580)', () => {
  it('renders a spinner icon when state is loading and ignores iconClass', () => {
    const { el } = setup({ state: 'loading', iconClass: 'pi pi-check-circle' });
    expect(el.querySelector('p-progress-spinner')).not.toBeNull();
    expect(el.querySelector('.verify-page__icon i')).toBeNull();
  });

  it('renders a pi icon with the success modifier when state is success', () => {
    const { el } = setup({ state: 'success', iconClass: 'pi pi-check-circle' });
    const icon = el.querySelector('.verify-page__icon');
    expect(icon).not.toBeNull();
    expect(icon?.classList.contains('verify-page__icon--success')).toBe(true);
    expect(el.querySelector('.verify-page__icon i')?.className).toContain('pi-check-circle');
  });

  it('renders a pi icon with the error modifier when state is error', () => {
    const { el } = setup({ state: 'error', iconClass: 'pi pi-times-circle' });
    const icon = el.querySelector('.verify-page__icon');
    expect(icon?.classList.contains('verify-page__icon--error')).toBe(true);
    expect(el.querySelector('.verify-page__icon i')?.className).toContain('pi-times-circle');
  });

  it('omits the icon block entirely when state is neutral and iconClass is null', () => {
    const { el } = setup({ state: 'neutral', iconClass: null });
    expect(el.querySelector('.verify-page__icon')).toBeNull();
  });

  it('renders the translated title and projects the CTA via ng-content', () => {
    const { el } = setup({ titleKey: 'shared.verifyPage.title' });
    const title = el.querySelector('.verify-page__title');
    expect(title?.textContent?.trim()).toBe('shared.verifyPage.title');
    expect(el.querySelector('[data-cy="host-cta"]')).not.toBeNull();
  });

  it('skips message and hint paragraphs when their keys are null', () => {
    const { el } = setup({ messageKey: null, hintKey: null });
    expect(el.querySelector('.verify-page__message')).toBeNull();
    expect(el.querySelector('.verify-page__hint')).toBeNull();
  });

  it('renders message and hint when keys are provided', () => {
    const { el } = setup({
      messageKey: 'shared.verifyPage.msg',
      hintKey: 'shared.verifyPage.hint',
    });
    expect(el.querySelector('.verify-page__message')?.textContent?.trim()).toBe(
      'shared.verifyPage.msg',
    );
    expect(el.querySelector('.verify-page__hint')?.textContent?.trim()).toBe(
      'shared.verifyPage.hint',
    );
  });

  it('applies titleDataCy and hintDataCy when provided so existing Cypress selectors keep working', () => {
    const { el } = setup({
      hintKey: 'shared.verifyPage.hint',
      titleDataCy: 'verify-email-change-success',
      hintDataCy: 'verify-email-change-redirect-hint',
    });
    expect(el.querySelector('[data-cy="verify-email-change-success"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="verify-email-change-redirect-hint"]')).not.toBeNull();
  });
});
