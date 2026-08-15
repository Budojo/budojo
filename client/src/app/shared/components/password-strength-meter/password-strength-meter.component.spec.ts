import { TestBed, ComponentFixture } from '@angular/core/testing';

import { PasswordStrengthMeterComponent, ZXCVBN_LOADER } from './password-strength-meter.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

// The real zxcvbn-ts ships ~700 kB of dictionaries behind a lazy dynamic
// import. Under the esbuild unit-test builder on a cold CI cache, `vi.mock`
// does NOT intercept that code-split `import('@zxcvbn-ts/core')` chunk, so
// mocking the module left the real analyser to load and the spec timed out at
// its 5s ceiling (#1251, after #972/#1248 band-aids). Instead we inject a
// synchronous fake loader through ZXCVBN_LOADER — no dynamic import in the
// test path at all, deterministic on every runner. The component's contract is
// the rendered meter + ARIA, not the exact score: a password containing 'weak'
// scores 0, everything else 3 — exercising both the rendered and empty branches.
const fakeZxcvbnLoader = (): Promise<(value: string) => { score: number }> =>
  Promise.resolve((value: string) => ({ score: value.includes('weak') ? 0 : 3 }));

/**
 * The component is a thin presentation wrapper around `zxcvbn-ts` —
 * we don't pin the EXACT score zxcvbn returns for a given password
 * (the upstream library would lock our specs to its tuning), only the
 * structural invariants:
 *
 * - Empty input → no meter rendered.
 * - Non-empty input → meter is rendered with a score in [0, 4].
 * - The score-bucket label key matches the rendered score.
 *
 * Keeping the assertions framework-loose means a future zxcvbn-ts
 * minor version that re-tunes its scoring won't break our specs.
 */
async function setup(password: string | null): Promise<{
  fixture: ComponentFixture<PasswordStrengthMeterComponent>;
  cmp: PasswordStrengthMeterComponent;
}> {
  TestBed.configureTestingModule({
    imports: [PasswordStrengthMeterComponent],
    providers: [...provideI18nTesting(), { provide: ZXCVBN_LOADER, useValue: fakeZxcvbnLoader }],
  });
  const fixture = TestBed.createComponent(PasswordStrengthMeterComponent);
  fixture.componentRef.setInput('password', password);
  fixture.detectChanges();
  // The score signal lands asynchronously: the loader promise resolves
  // (here, the injected fake) and a following microtask runs the analysis
  // + the next CD pass. `vi.waitFor` polls until the DOM reflects the
  // analysed value OR the empty branch (for null / '' inputs that resolve
  // synchronously and never render).
  if (password !== null && password !== '') {
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        const node = fixture.nativeElement.querySelector('[data-cy="password-strength-meter"]');
        expect(node).not.toBeNull();
      },
      { timeout: 5_000, interval: 10 },
    );
  } else {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { fixture, cmp: fixture.componentInstance };
}

describe('PasswordStrengthMeterComponent (#415)', () => {
  it('renders nothing when the password is empty', async () => {
    const { fixture } = await setup('');
    expect(fixture.nativeElement.querySelector('[data-cy="password-strength-meter"]')).toBeNull();
  });

  it('renders nothing when the password is null', async () => {
    const { fixture } = await setup(null);
    expect(fixture.nativeElement.querySelector('[data-cy="password-strength-meter"]')).toBeNull();
  });

  it('renders the meter with a score in [0, 4] for a non-empty password', async () => {
    const { fixture } = await setup('any-password-123');
    const meter = fixture.nativeElement.querySelector('[data-cy="password-strength-meter"]');
    expect(meter).not.toBeNull();
    const score = Number(meter!.getAttribute('data-score'));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(4);
  });

  it('renders a progressbar with aria-valuemin/max pinned to 0 and 4', async () => {
    const { fixture } = await setup('hunter2');
    const bar = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('aria-valuemin')).toBe('0');
    expect(bar!.getAttribute('aria-valuemax')).toBe('4');
    // aria-valuenow matches the data-score attr — pinning the
    // structural mapping between ARIA and the rendered DOM.
    const score = Number(
      fixture.nativeElement
        .querySelector('[data-cy="password-strength-meter"]')!
        .getAttribute('data-score'),
    );
    expect(bar!.getAttribute('aria-valuenow')).toBe(String(score));
  });

  it('exposes a translated aria-label so screen readers announce what the value refers to', async () => {
    // Copilot caught the original release missing this — without an
    // accessible name, NVDA/VoiceOver read the value but not "what
    // the value is for". Pinning the resolved translated string here
    // (via provideI18nTesting → en bundle) guards both the binding
    // and the presence of the i18n key.
    const { fixture } = await setup('hunter2');
    const bar = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(bar!.getAttribute('aria-label')).toBe('Password strength');
  });

  it('clearing the password between ticks hides the meter again', async () => {
    const { fixture } = await setup('something');
    expect(
      fixture.nativeElement.querySelector('[data-cy="password-strength-meter"]'),
    ).not.toBeNull();
    fixture.componentRef.setInput('password', '');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="password-strength-meter"]')).toBeNull();
  });
});
