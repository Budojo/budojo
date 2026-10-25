import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { AppLockAnswer, AppLockPlugin } from '../../../core/mobile/app-lock';
import { APP_LOCK } from '../../../core/mobile/shell-plugins';
import { AppLockComponent } from './app-lock.component';

/**
 * The fingerprint lock's cover (#2159): what the phone shows while Budojo is
 * locked, with one way to ask again after the prompt was closed.
 */
describe('AppLockComponent', () => {
  let unlock: ReturnType<typeof vi.fn<AppLockPlugin['unlock']>>;
  let answer: (value: AppLockAnswer) => void;
  const state: AppLockPlugin['state'] = () =>
    Promise.resolve({ unlocked: false, away: 0, closed: false });

  async function render(plugin: AppLockPlugin | null): Promise<ComponentFixture<AppLockComponent>> {
    await TestBed.configureTestingModule({
      imports: [AppLockComponent],
      providers: [...provideI18nTesting(), { provide: APP_LOCK, useValue: plugin }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AppLockComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const cover = (fixture: ComponentFixture<AppLockComponent>): HTMLElement | null =>
    fixture.nativeElement.querySelector('[data-cy="app-lock"]');

  async function settle(fixture: ComponentFixture<AppLockComponent>): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    unlock = vi.fn(() => new Promise<AppLockAnswer>((resolve) => (answer = resolve)));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.documentElement.classList.remove('budojo-locked');
  });

  it('shows nothing, and hides nothing, outside the Android app', async () => {
    const fixture = await render(null);

    expect(cover(fixture)).toBeNull();
    expect(document.documentElement.classList.contains('budojo-locked')).toBe(false);
  });

  it('covers the app and asks for the fingerprint once it has rendered', async () => {
    const fixture = await render({ unlock, state });
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());

    expect(cover(fixture)?.textContent).toContain('Budojo is locked');
    expect(cover(fixture)?.getAttribute('aria-modal')).toBe('true');
    // The rest of the app is hidden to the eye, the keyboard and a screen reader.
    expect(document.documentElement.classList.contains('budojo-locked')).toBe(true);
    expect(unlock).toHaveBeenCalledExactlyOnceWith({ title: 'Unlock Budojo' });
  });

  it('opens the app once the phone says yes', async () => {
    const fixture = await render({ unlock, state });
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    answer({ unlocked: true, secure: true });
    await settle(fixture);

    expect(cover(fixture)).toBeNull();
    expect(document.documentElement.classList.contains('budojo-locked')).toBe(false);
  });

  it('asks again from its button after the prompt was closed', async () => {
    const fixture = await render({ unlock, state });
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    // The prompt is up: the button renders disabled first, as on the phone.
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="app-lock-unlock"] button').disabled).toBe(
      true,
    );
    answer({ unlocked: false, secure: true, code: 10, message: 'Cancelled' });
    await settle(fixture);

    const button = fixture.nativeElement.querySelector(
      '[data-cy="app-lock-unlock"] button',
    ) as HTMLButtonElement;
    expect(button.textContent).toContain('Unlock');
    expect(button.disabled).toBe(false);
    // The prompt kept it disabled; the keyboard starts on it once it is closed.
    expect(document.activeElement).toBe(button);
    expect(fixture.nativeElement.querySelector('[data-cy="app-lock-problem"]')).toBeNull();

    button.click();
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it("says why when the phone refused, in Android's words", async () => {
    const fixture = await render({ unlock, state });
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    answer({ unlocked: false, secure: true, code: 7, message: 'Too many attempts' });
    await settle(fixture);

    expect(
      fixture.nativeElement.querySelector('[data-cy="app-lock-problem"]')?.textContent,
    ).toContain('Too many attempts');
  });
});
