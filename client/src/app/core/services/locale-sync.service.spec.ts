import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { AuthService, User } from './auth.service';
import { LanguageService } from './language.service';
import { LocaleSyncService } from './locale-sync.service';

/**
 * #1912 — the server writes the owner's notifications, so it has to be told
 * the app's language: on boot when it has not heard it, and on every switch.
 */
describe('LocaleSyncService', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let language: LanguageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    language = TestBed.inject(LanguageService);
    TestBed.inject(LocaleSyncService);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('budojoLang');
  });

  function signIn(locale: User['locale']): void {
    auth.user.set({ id: 1, locale } as User);
    TestBed.tick();
  }

  it('says nothing while nobody is signed in', () => {
    language.setLanguage('it');
    TestBed.tick();

    http.expectNone('/api/v1/me/locale');
  });

  it('tells the server the language it has not heard yet, once', () => {
    language.setLanguage('it');
    signIn(null);

    const req = http.expectOne('/api/v1/me/locale');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ locale: 'it' });
    req.flush({ data: { locale: 'it' } });
    TestBed.tick();

    // The user now carries it, so the effect has nothing left to say.
    expect(auth.user()?.locale).toBe('it');
    http.expectNone('/api/v1/me/locale');
  });

  it('says nothing when the server already has it', () => {
    language.setLanguage('it');
    signIn('it');

    http.expectNone('/api/v1/me/locale');
  });

  it('tells the server when the language switch changes', () => {
    language.setLanguage('en');
    signIn('en');

    language.setLanguage('it');
    TestBed.tick();

    http.expectOne('/api/v1/me/locale').flush({ data: { locale: 'it' } });
  });

  it('gives up quietly when the server does not answer', () => {
    language.setLanguage('it');
    signIn('en');

    http.expectOne('/api/v1/me/locale').flush(null, { status: 500, statusText: 'Server Error' });
    TestBed.tick();

    // Not retried in a loop: the next attempt waits for a change.
    http.expectNone('/api/v1/me/locale');
    expect(auth.user()?.locale).toBe('en');
  });
});
