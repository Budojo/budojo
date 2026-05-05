import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { HelpComponent } from './help.component';
import { LanguageService } from '../../core/services/language.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

import EN from '../../../../public/assets/i18n/en.json';
import IT from '../../../../public/assets/i18n/it.json';

/**
 * Vitest unit spec for the `/help` page (#422).
 *
 * What we pin here:
 *   1. The page renders sectioned categories in declared order (the
 *      ordering is part of the user contract — Getting started must
 *      lead, Account must trail).
 *   2. Every entry id resolves to a non-empty translation in both
 *      EN and IT — locks the dynamic-key indirection per
 *      `client/CLAUDE.md` § i18n ("declare the allowed key set in
 *      code and lock it with a unit test").
 *   3. Search filters entries client-side by question OR answer text.
 *   4. The empty-state appears when no entry matches the query.
 *   5. The `?q=` query param pre-seeds the search box (deep-link
 *      from empty states / tooltips).
 *
 * E2E coverage (anchor scrolling, route registration, navigation
 * from /help to /help#anchor) lives in `cypress/e2e/help.cy.ts`.
 */

// Authoritative entry-id list — must stay in lock-step with the
// `categories` array in `help.component.ts`. The component-side
// list is the source of truth (rendered + tested here); changing
// it requires updating both files in the same commit. The dual
// declaration is intentional: it gives the i18n parity test
// something concrete to lock against without exposing the array
// from the component.
const EXPECTED_CATEGORY_ORDER = [
  'getting-started',
  'athletes',
  'attendance',
  'payments',
  'documents',
  'account',
] as const;

const EXPECTED_ENTRY_IDS = [
  'what-is-budojo',
  'create-academy',
  'invite-coach',
  'add-athlete',
  'import-athletes',
  'belt-not-listed',
  'suspend-athlete',
  'mark-attendance',
  'edit-attendance',
  'set-monthly-fee',
  'mark-paid',
  'unpaid-badge',
  'upload-medical-cert',
  'expiring-documents',
  'change-language',
  'export-data',
  'delete-account',
] as const;

describe('HelpComponent (#422)', () => {
  function setup(queryParam?: string) {
    TestBed.configureTestingModule({
      imports: [HelpComponent],
      providers: [
        provideRouter([]),
        ...provideI18nTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(queryParam ? { q: queryParam } : {}),
            },
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(HelpComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the title and all six categories in the declared order', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.help-page__title')?.textContent?.trim()).toBe(
      'Help & frequently asked questions',
    );

    const categoryIds = Array.from(root.querySelectorAll('.help-page__category')).map((el) =>
      (el as HTMLElement).id.replace(/^cat-/, ''),
    );
    expect(categoryIds).toEqual([...EXPECTED_CATEGORY_ORDER]);
  });

  it('renders every declared entry with a stable anchor id', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const entryIds = Array.from(root.querySelectorAll('.help-page__entry')).map(
      (el) => (el as HTMLElement).id,
    );
    expect(entryIds.sort()).toEqual([...EXPECTED_ENTRY_IDS].sort());
  });

  it('every entry has a non-empty translation in EN and IT (parity-locked)', () => {
    // The dynamic-key indirection canon § i18n trip-wire: lock the
    // allowed key set so a missing translation is caught here, not
    // by a user reading raw `help.entries.foo.question` text.
    function read(bundle: Record<string, unknown>, path: string): string | undefined {
      let node: unknown = bundle;
      for (const segment of path.split('.')) {
        if (node && typeof node === 'object') {
          node = (node as Record<string, unknown>)[segment];
        } else {
          return undefined;
        }
      }
      return typeof node === 'string' ? node : undefined;
    }

    const missing: string[] = [];
    const bundles: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ['en', EN as unknown as Record<string, unknown>],
      ['it', IT as unknown as Record<string, unknown>],
    ];
    for (const [lang, bundle] of bundles) {
      for (const cat of EXPECTED_CATEGORY_ORDER) {
        const heading = read(bundle, `help.categories.${cat}`);
        if (!heading || heading.trim() === '') {
          missing.push(`${lang}: help.categories.${cat}`);
        }
      }
      for (const id of EXPECTED_ENTRY_IDS) {
        const q = read(bundle, `help.entries.${id}.question`);
        const a = read(bundle, `help.entries.${id}.answer`);
        if (!q || q.trim() === '') missing.push(`${lang}: help.entries.${id}.question`);
        if (!a || a.trim() === '') missing.push(`${lang}: help.entries.${id}.answer`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('renders ALL entries when the query is empty', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.help-page__entry').length).toBe(EXPECTED_ENTRY_IDS.length);
    expect(root.querySelector('[data-cy="help-empty"]')).toBeNull();
  });

  it('client-side search filters entries by question OR answer text', () => {
    const { fixture, cmp } = setup();
    // Type a phrase that should match only the import-athletes entry.
    // The substring "import" is in the EN question; "spreadsheet" is
    // in the EN answer — pick "spreadsheet" to prove answer matching.
    cmp.query.set('spreadsheet');
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const visible = Array.from(root.querySelectorAll('.help-page__entry')).map(
      (el) => (el as HTMLElement).id,
    );
    expect(visible).toEqual(['import-athletes']);
  });

  it('search is case-insensitive', () => {
    const { fixture, cmp } = setup();
    cmp.query.set('SPREADSHEET');
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(
      Array.from(root.querySelectorAll('.help-page__entry')).map((el) => (el as HTMLElement).id),
    ).toEqual(['import-athletes']);
  });

  it('shows an empty state when the query matches nothing', () => {
    const { fixture, cmp } = setup();
    cmp.query.set('zzzzz-no-such-string-anywhere');
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.help-page__entry').length).toBe(0);
    expect(root.querySelector('[data-cy="help-empty"]')).not.toBeNull();
  });

  it('search reacts to the active language', () => {
    // Italian-only phrase: the IT answer for upload-medical-cert
    // mentions "certificato medico"; the EN answer says "medical
    // certificate" (no Italian text anywhere in the EN bundle).
    // Switching to IT via LanguageService re-evaluates the matcher
    // because the `filtered` computed reads `currentLang()` as a
    // signal dependency.
    const { fixture, cmp } = setup();
    TestBed.inject(LanguageService).setLanguage('it');
    cmp.query.set('certificato medico');
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const visible = Array.from(root.querySelectorAll('.help-page__entry')).map(
      (el) => (el as HTMLElement).id,
    );
    // The IT match must cover at least the upload-medical-cert entry;
    // we don't pin the exact set since the IT copy may also mention
    // "certificato medico" elsewhere (expiring-documents, etc.).
    expect(visible).toContain('upload-medical-cert');
  });

  it('pre-seeds the search box from the ?q= query param', () => {
    const { fixture, cmp } = setup('payment');
    fixture.detectChanges();

    expect(cmp.query()).toBe('payment');
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
