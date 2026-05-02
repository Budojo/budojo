import { AthleteStatus, Belt } from '../../core/services/athlete.service';

/**
 * Single source of truth for the `belts.*` translation key bindings
 * (#357 Copilot review). The compiler enforces every `Belt` enum case
 * is mapped, and the keys are statically greppable for the
 * `i18n-keys.spec.ts` parity check.
 *
 * Consumers: `belt-badge.component`, `athlete-form.component`.
 * Anywhere that needs to render or pick a belt by its localised label
 * resolves the key here, then runs it through the `translate` pipe or
 * `TranslateService.instant()`.
 */
export const BELT_KEYS: Readonly<Record<Belt, string>> = {
  grey: 'belts.grey',
  yellow: 'belts.yellow',
  orange: 'belts.orange',
  green: 'belts.green',
  white: 'belts.white',
  blue: 'belts.blue',
  purple: 'belts.purple',
  brown: 'belts.brown',
  black: 'belts.black',
  'red-and-black': 'belts.redAndBlack',
  'red-and-white': 'belts.redAndWhite',
  red: 'belts.red',
};

/**
 * IBJJF belt order — kids ranks → adults → senior coral/red. Used by
 * the form picker so the dropdown reads bottom-up like a progression
 * chart. Exported alongside `BELT_KEYS` so callers don't re-declare
 * the order separately.
 */
export const BELT_ORDER: readonly Belt[] = [
  'grey',
  'yellow',
  'orange',
  'green',
  'white',
  'blue',
  'purple',
  'brown',
  'black',
  'red-and-black',
  'red-and-white',
  'red',
] as const;

/**
 * Single source of truth for the `statuses.*` translation key bindings
 * (#357 Copilot review). Consumers: `athlete-detail.component`,
 * `athlete-form.component`. The compiler enforces every `AthleteStatus`
 * enum case is mapped.
 */
export const STATUS_KEYS: Readonly<Record<AthleteStatus, string>> = {
  active: 'statuses.active',
  suspended: 'statuses.suspended',
  inactive: 'statuses.inactive',
};

/**
 * Statuses surfaced in the form picker, in the order the dropdown
 * lists them. Exported alongside `STATUS_KEYS` so callers don't
 * re-declare the order separately.
 */
export const STATUS_ORDER: readonly AthleteStatus[] = ['active', 'suspended', 'inactive'] as const;
