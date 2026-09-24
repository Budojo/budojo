import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Tooltip } from 'primeng/tooltip';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ContactActionsComponent } from './contact-actions.component';

function render(
  countryCode: string | null,
  nationalNumber: string | null,
  name = 'Giulia Ferraro',
) {
  TestBed.configureTestingModule({
    imports: [ContactActionsComponent],
    providers: [...provideI18nTesting()],
  });
  const fixture = TestBed.createComponent(ContactActionsComponent);
  fixture.componentRef.setInput('countryCode', countryCode);
  fixture.componentRef.setInput('nationalNumber', nationalNumber);
  fixture.componentRef.setInput('name', name);
  fixture.componentRef.setInput('dataCy', 'athlete-contact-7');
  fixture.detectChanges();

  return fixture;
}

describe('ContactActionsComponent (#1727)', () => {
  it('offers WhatsApp and a call, each named for the person', () => {
    const root = render('+39', '3331234567').nativeElement as HTMLElement;

    const whatsapp = root.querySelector('[data-cy="athlete-contact-7-whatsapp"]');
    const call = root.querySelector('[data-cy="athlete-contact-7-call"]');

    expect(whatsapp?.getAttribute('href')).toBe('https://wa.me/393331234567');
    expect(whatsapp?.getAttribute('aria-label')).toBe('Message Giulia Ferraro on WhatsApp');
    expect(call?.getAttribute('href')).toBe('tel:+393331234567');
    expect(call?.getAttribute('aria-label')).toBe('Call Giulia Ferraro');
  });

  it('opens WhatsApp in the browser and leaves tel: to the operating system', () => {
    // A blank tab for a tel: leaves an empty window behind on the desktop;
    // wa.me is a web page, and must not replace the app in its own tab.
    const root = render('+39', '3331234567').nativeElement as HTMLElement;

    const whatsapp = root.querySelector('[data-cy="athlete-contact-7-whatsapp"]');
    const call = root.querySelector('[data-cy="athlete-contact-7-call"]');

    expect(whatsapp?.getAttribute('target')).toBe('_blank');
    expect(whatsapp?.getAttribute('rel')).toContain('noopener');
    expect(call?.getAttribute('target')).toBeNull();
  });

  it('never shows the number itself', () => {
    // PII on a screen that gets shown to people; the action does not need it.
    const root = render('+39', '3331234567').nativeElement as HTMLElement;

    expect(root.textContent).not.toContain('3331234567');
  });

  it('renders a disabled control that says why, rather than nothing, when there is no number', () => {
    const fixture = render('+39', null);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('a')).toBeNull();
    const none = root.querySelector('[data-cy="athlete-contact-7-none"]');
    expect(none?.getAttribute('aria-disabled')).toBe('true');
    expect(none?.getAttribute('aria-label')).toBe('No phone number on file');

    const tooltip = fixture.debugElement
      .query(By.css('[data-cy="athlete-contact-7-none"]'))
      .injector.get(Tooltip);
    expect(tooltip.content).toBe('No phone number on file');
  });
});
