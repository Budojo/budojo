import type { DocumentType } from '../../core/services/document.service';
import type { SupportedLanguage } from '../../core/services/language.service';
import { formatIsoDate, formatIsoMonth } from './locale';
import { formatCents } from './money';

/**
 * The reminders the owner sends on WhatsApp (#1931).
 *
 * On the desktop build WhatsApp is the only way to reach an athlete (#1727),
 * and the two lists chased every month — unpaid fees, papers running out —
 * used to leave all the writing to the owner, with the amount looked up by
 * hand each time. These write the message: short, first person, in the app's
 * language, signed with the academy's name. They are pure — `t` is the
 * translator, handed in — so the wording is tested without a component.
 *
 * Nothing records that a reminder went out: the app cannot know whether the
 * `wa.me` message was sent (#1931).
 */
export type Translator = (key: string, params: object) => string;

/** Every fee is in euro, as everywhere else in the app. */
const CURRENCY = 'EUR';

export interface UnpaidReminderFacts {
  readonly firstName: string;
  /** The month owed, `YYYY-MM`. */
  readonly month: string;
  readonly monthlyFeeCents: number;
  /** 1 monthly, 3 quarterly, 6, 12 — what one payment covers. */
  readonly billingPeriodMonths: number;
  readonly academy: string;
}

/**
 * "Ciao Andrea, ti ricordo la quota di settembre 2026 (210,00 €)…". The
 * amount is what one payment of this athlete's period costs: a quarterly
 * payer is asked for the quarter, which is what the owner used to work out.
 */
export function unpaidReminder(
  t: Translator,
  lang: SupportedLanguage,
  facts: UnpaidReminderFacts,
): string {
  const cents = facts.monthlyFeeCents * Math.max(1, facts.billingPeriodMonths);
  return t('shared.reminder.unpaid', {
    name: facts.firstName,
    month: formatIsoMonth(facts.month, lang),
    amount: formatCents(cents, CURRENCY, lang),
    academy: facts.academy,
  });
}

export interface DocumentReminderFacts {
  readonly firstName: string;
  readonly type: DocumentType;
  /** The type as the app names it — "Carta d'identità". */
  readonly typeLabel: string;
  /** `YYYY-MM-DD`. */
  readonly expiresAt: string;
  /** The owner's today, `YYYY-MM-DD`: before it, the paper has run out. */
  readonly today: string;
  readonly academy: string;
}

/**
 * A paper running out, or already run out. A medical certificate is named as
 * one; any other paper by its type, so an ID card is never called a
 * certificate. The expiry day itself still counts as running.
 */
export function documentReminder(
  t: Translator,
  lang: SupportedLanguage,
  facts: DocumentReminderFacts,
): string {
  const expired = facts.expiresAt < facts.today;
  const key =
    facts.type === 'medical_certificate'
      ? expired
        ? 'shared.reminder.certificateExpired'
        : 'shared.reminder.certificateExpires'
      : expired
        ? 'shared.reminder.documentExpired'
        : 'shared.reminder.documentExpires';

  return t(key, {
    name: facts.firstName,
    document: facts.typeLabel,
    date: formatIsoDate(facts.expiresAt, lang),
    academy: facts.academy,
  });
}

/** For an athlete the academy has no medical certificate for at all. */
export function missingCertificateReminder(
  t: Translator,
  facts: { readonly firstName: string; readonly academy: string },
): string {
  return t('shared.reminder.certificateMissing', {
    name: facts.firstName,
    academy: facts.academy,
  });
}
