import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LandingComponent } from './landing.component';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function setup() {
  TestBed.configureTestingModule({
    imports: [LandingComponent],
    providers: [provideRouter([]), ...provideI18nTesting()],
  });
  const router = TestBed.inject(Router);
  router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
  const fixture = TestBed.createComponent(LandingComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance };
}

/**
 * The app's first screen (#330, rewritten in #1497).
 *
 * It was a marketing page and this spec pinned its sales arc — four pain
 * points, six feature cards, three trust claims, a pricing tile. Nothing
 * serves the page on the web any more (#1230); the only thing that renders
 * it is the desktop app at `APP_ORIGIN/`, and `publicGuard` sends anyone
 * with an account to the roster. So the reader is always someone who has
 * just installed Budojo, and the assertions below are about what they need
 * next rather than about what would persuade them.
 */
describe('LandingComponent (#1497)', () => {
  it('says what the app is, without selling it', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.landing__headline')?.textContent).toContain(
      'Run your academy, not a spreadsheet',
    );
    // Local-first is the fact that makes the rest of the screen make sense:
    // no account on a server, no network, nothing leaving the machine.
    expect(root.querySelector('.landing__sub')?.textContent).toContain("on the gym's own computer");
  });

  it('makes creating the academy the one loud action', () => {
    // Someone opening this for the first time has no account to sign in to.
    // Log in is for a reinstall or a second machine, and reads as such.
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const create = root.querySelector('[data-cy="landing-signup"]');
    const login = root.querySelector('[data-cy="landing-login"]');

    expect(create?.textContent).toContain('Create your academy');
    expect(login?.textContent).toContain('I already have an account');
    // One filled button on the page — the canon's one-primary-CTA rule.
    expect(root.querySelectorAll('p-button').length).toBe(1);
  });

  it('lists the three steps in order', () => {
    // The gap between "installed" and "using it" is where a local-first app
    // loses people: no onboarding email, nobody to ask.
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const steps = root.querySelectorAll('.landing__step');
    expect(steps.length).toBe(3);
    expect(steps[0].textContent).toContain('Create your account');
    expect(steps[1].textContent).toContain('Set up the academy');
    expect(steps[2].textContent).toContain('Add your first athlete');

    const numbers = Array.from(root.querySelectorAll('.landing__step-number')).map((n) =>
      n.textContent?.trim(),
    );
    expect(numbers).toEqual(['1', '2', '3']);
  });

  it('promises nothing the shipped build cannot do', () => {
    // The page advertised an iOS and Android install, a phone-first product
    // and an in-app contact form that #1464 removed for not working. This is
    // the regression test for the whole of #1497.
    const { fixture } = setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    for (const claim of ['iOS', 'Android', 'phone', 'pocket', 'credit card', 'Free during']) {
      expect(text, claim).not.toContain(claim);
    }
  });

  it('leaves a stuck first-run user a way to reach a person', () => {
    // Every other route to support sits behind the login they cannot get
    // past, which is exactly when they need it (#1476).
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const support = root.querySelector('[data-cy="landing-footer-support"]');
    expect(support?.getAttribute('href')).toContain('mailto:matteobonanno1990@gmail.com');
  });

  it('keeps the legal links and the help page', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    for (const cy of ['privacy', 'terms', 'help']) {
      expect(root.querySelector(`[data-cy="landing-footer-${cy}"]`), cy).not.toBeNull();
    }
  });

  it('switchLanguage flips between en and it', () => {
    const { cmp } = setup();
    const component = cmp as unknown as {
      currentLanguage: () => string;
      otherLanguage: () => string;
      switchLanguage: () => void;
    };

    expect(component.currentLanguage()).toBe('en');
    expect(component.otherLanguage()).toBe('it');

    component.switchLanguage();
    expect(component.currentLanguage()).toBe('it');
    expect(component.otherLanguage()).toBe('en');
  });
});
