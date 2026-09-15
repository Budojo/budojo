import { ButtonProps } from 'primeng/button';

/**
 * The two button shapes every confirm in the app shares (#1644).
 *
 * The audit found the same question answered in three vocabularies and two
 * visual weights: the safe action was a filled button on some screens and a
 * text button on others, and where no props were passed at all PrimeNG drew
 * its own "Yes"/"No" in one colour — so the answer that wipes a payment
 * looked exactly like the one that walks away.
 *
 * The rule, in one place so the next confirm inherits it rather than
 * re-deciding it:
 *
 *   - the safe action is a **text** button. It is the default outcome of
 *     pressing Escape or clicking away, so it does not need to compete;
 *     giving it a filled surface makes two equal-looking buttons out of a
 *     question with one dangerous answer (MD3 § dialog actions, Norman).
 *   - the destructive action is **filled danger**. It is the one that
 *     cannot be undone, and it should look like it.
 *
 * A confirm whose accept is NOT destructive (marking a payment paid, hiding
 * the onboarding checklist) simply omits `CONFIRM_ACCEPT_DESTRUCTIVE` and
 * takes PrimeNG's default filled primary.
 *
 * Pair these with `'common.cancel'` for the reject label — the single key
 * every confirm uses, which the shared destructive button has documented in
 * its own example since #1034.
 */
export const CONFIRM_REJECT_BUTTON: ButtonProps = { severity: 'secondary', text: true };

export const CONFIRM_ACCEPT_DESTRUCTIVE: ButtonProps = { severity: 'danger' };
