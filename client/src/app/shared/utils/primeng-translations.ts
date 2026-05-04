import { Translation } from 'primeng/api';
// `import type` keeps this a type-only import — erased at runtime, so
// the language.service ↔ shared/utils dependency stays a one-way value
// edge (language.service imports primeng-translations) without a cycle
// back through this module. If `SupportedLanguage` ever grows into a
// value (e.g. a runtime guard or const tuple promoted to a value
// import), promote it to a sibling `language.types.ts` module first
// rather than dropping the `type` keyword here.
import type { SupportedLanguage } from '../../core/services/language.service';

/**
 * PrimeNG component-level i18n strings indexed by `SupportedLanguage`.
 *
 * Wired from `LanguageService.applyLanguage()` (#280): when the SPA
 * locale flips, we call `primeNG.setTranslation(primeNgTranslationFor(lang))`
 * so the PrimeNG components we actually use today (today: just the
 * `<p-datepicker>` calendar popover — month / day names, Today /
 * Clear / week-header chrome — plus the generic accept / reject
 * strings the confirmpopup uses) follow the active language. The
 * filter / paginator components are NOT covered yet because we don't
 * render them; their `Translation` keys would need to be added here
 * before they get adopted.
 *
 * **Coverage rule.** We populate ONLY the fields we visibly use today.
 * Adding a `<p-confirmdialog>` button label, a paginator strings, or
 * a `<p-datatable>` filter operator means adding the corresponding
 * key here; the parity check is by hand (PrimeNG's `Translation`
 * interface allows partial maps).
 *
 * **First day of week.** EU convention is Monday-first. PrimeNG's
 * default is Sunday-first (US). We pin Monday-first for both EN and
 * IT — `en-GB` users (our EN-default audience, see `localeFor()`) and
 * Italian users both expect Monday on the left of the calendar.
 *
 * **Date format.** `dd/mm/yy` matches both the EU date order and the
 * `localeFor()` rationale (day-first regardless of UI language). It
 * applies only when a `<p-datepicker>` doesn't override via its own
 * `[dateFormat]` input — every datepicker today uses `yy-mm-dd` (ISO)
 * for the bound input value, so this field is a future-friendly
 * default rather than something currently visible.
 *
 * Adding a new locale (Spanish / German per #271): extend
 * `SupportedLanguage`, add a key here, and the type checker forces
 * the lookup map to stay exhaustive. No central lookup table to keep
 * in sync — same exhaustiveness pattern as `localeFor()`.
 */
const PRIMENG_TRANSLATIONS: Readonly<Record<SupportedLanguage, Translation>> = {
  en: {
    monthNames: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    monthNamesShort: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dayNamesMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    dateFormat: 'dd/mm/yy',
    firstDayOfWeek: 1,
    today: 'Today',
    clear: 'Clear',
    weekHeader: 'Wk',
    accept: 'Yes',
    reject: 'No',
  },
  it: {
    monthNames: [
      'Gennaio',
      'Febbraio',
      'Marzo',
      'Aprile',
      'Maggio',
      'Giugno',
      'Luglio',
      'Agosto',
      'Settembre',
      'Ottobre',
      'Novembre',
      'Dicembre',
    ],
    monthNamesShort: [
      'Gen',
      'Feb',
      'Mar',
      'Apr',
      'Mag',
      'Giu',
      'Lug',
      'Ago',
      'Set',
      'Ott',
      'Nov',
      'Dic',
    ],
    dayNames: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
    dayNamesShort: ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'],
    dayNamesMin: ['Do', 'Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa'],
    dateFormat: 'dd/mm/yy',
    firstDayOfWeek: 1,
    today: 'Oggi',
    clear: 'Cancella',
    weekHeader: 'Sett',
    accept: 'Sì',
    reject: 'No',
  },
};

export function primeNgTranslationFor(lang: SupportedLanguage): Translation {
  return PRIMENG_TRANSLATIONS[lang];
}
