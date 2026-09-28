import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { documentReminder, missingCertificateReminder, unpaidReminder } from './reminder-message';

/**
 * The reminders Marco sends on WhatsApp (#1931): written for him, in the
 * app's language, with the facts he used to look up by hand — the month,
 * the amount a quarterly payer really owes, the date a paper runs out.
 */
function translatorIn(lang: 'en' | 'it'): (key: string, params: object) => string {
  TestBed.configureTestingModule({ providers: [...provideI18nTesting()] });
  const translate = TestBed.inject(TranslateService);
  translate.use(lang);
  return (key, params) => translate.instant(key, params) as string;
}

describe('unpaidReminder', () => {
  it('names the month and what this athlete owes, signed by the academy', () => {
    const text = unpaidReminder(translatorIn('it'), 'it', {
      firstName: 'Andrea',
      month: '2026-09',
      monthlyFeeCents: 7000,
      billingPeriodMonths: 1,
      academy: 'Budojo BJJ Torino',
    });

    expect(text).toContain('Andrea');
    expect(text).toContain('settembre 2026');
    expect(text).toContain('70,00');
    expect(text).toContain('Budojo BJJ Torino');
  });

  it("asks a quarterly payer for the quarter's money, not one month's", () => {
    const text = unpaidReminder(translatorIn('it'), 'it', {
      firstName: 'Andrea',
      month: '2026-09',
      monthlyFeeCents: 7000,
      billingPeriodMonths: 3,
      academy: 'Budojo BJJ Torino',
    });

    expect(text).toContain('210,00');
    expect(text).not.toContain('70,00');
  });

  it("is written in the app's language", () => {
    const text = unpaidReminder(translatorIn('en'), 'en', {
      firstName: 'Andrea',
      month: '2026-09',
      monthlyFeeCents: 7000,
      billingPeriodMonths: 1,
      academy: 'Budojo',
    });

    expect(text).toContain('September 2026');
    expect(text).toContain('€70.00');
  });
});

describe('documentReminder', () => {
  const base = { firstName: 'Giulia', academy: 'Budojo', today: '2026-09-27' };

  it('says when a medical certificate runs out, in words', () => {
    const text = documentReminder(translatorIn('it'), 'it', {
      ...base,
      type: 'medical_certificate',
      typeLabel: 'Certificato medico',
      expiresAt: '2026-10-13',
    });

    expect(text).toContain('certificato medico');
    expect(text).toContain('13 ottobre 2026');
    expect(text).toContain('scade');
  });

  it('says it has run out when the date is past', () => {
    const text = documentReminder(translatorIn('it'), 'it', {
      ...base,
      type: 'medical_certificate',
      typeLabel: 'Certificato medico',
      expiresAt: '2026-09-23',
    });

    expect(text).toContain('è scaduto');
    expect(text).toContain('23 settembre 2026');
  });

  it('names any other paper by its type, never calling it a certificate', () => {
    const text = documentReminder(translatorIn('it'), 'it', {
      ...base,
      type: 'id_card',
      typeLabel: "Carta d'identità",
      expiresAt: '2026-10-13',
    });

    expect(text).toContain("Carta d'identità");
    expect(text).not.toContain('certificato medico');
  });

  it('counts the expiry day itself as still running', () => {
    const text = documentReminder(translatorIn('it'), 'it', {
      ...base,
      type: 'medical_certificate',
      typeLabel: 'Certificato medico',
      expiresAt: '2026-09-27',
    });

    expect(text).not.toContain('è scaduto');
  });
});

describe('missingCertificateReminder', () => {
  it('asks for a certificate the academy does not have yet', () => {
    const text = missingCertificateReminder(translatorIn('it'), {
      firstName: 'Sara',
      academy: 'Budojo',
    });

    expect(text).toContain('Sara');
    expect(text).toContain('certificato medico');
    expect(text).toContain('Budojo');
  });
});
