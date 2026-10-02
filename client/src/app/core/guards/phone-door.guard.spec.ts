import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Route,
  RouterStateSnapshot,
  UrlSegment,
  UrlTree,
} from '@angular/router';
import { describe, expect, it } from 'vitest';
import { DRIVE_AUTH, PHP_SERVER } from '../mobile/shell-plugins';
import { phoneDoorMatch, signInIsTheDoor } from './phone-door.guard';

/** The door is the sign-in only inside the Android app, with a shell that made a secret (#2079). */
describe('phoneDoorMatch (#2079)', () => {
  function matches(plugins: boolean, secret: string | undefined): boolean {
    if (secret === undefined) {
      delete (window as { __BUDOJO_MOBILE__?: unknown }).__BUDOJO_MOBILE__;
    } else {
      window.__BUDOJO_MOBILE__ = { apiBase: 'http://127.0.0.1:1', shellSecret: secret };
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: PHP_SERVER, useValue: plugins ? {} : null },
        { provide: DRIVE_AUTH, useValue: plugins ? {} : null },
        provideRouter([]),
      ],
    });
    return TestBed.runInInjectionContext(() =>
      phoneDoorMatch({} as Route, [] as UrlSegment[]),
    ) as boolean;
  }

  afterEach(() => {
    delete (window as { __BUDOJO_MOBILE__?: unknown }).__BUDOJO_MOBILE__;
  });

  it("matches inside the app, with the shell's secret", () => {
    expect(matches(true, 'from-the-shell')).toBe(true);
  });

  it('does not in a browser or on the desktop: no phone plugins', () => {
    expect(matches(false, 'from-the-shell')).toBe(false);
  });

  it('does not with a shell older than the door, which made no secret', () => {
    expect(matches(true, undefined)).toBe(false);
  });

  it('sends the sign-in to the door on the phone, and nowhere else', () => {
    const signIn = (plugins: boolean) => {
      matches(plugins, 'from-the-shell');
      return TestBed.runInInjectionContext(() =>
        signInIsTheDoor({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
    };

    const onPhone = signIn(true);
    expect(onPhone).toBeInstanceOf(UrlTree);
    expect(String(onPhone)).toBe('/');
    TestBed.resetTestingModule();
    expect(signIn(false)).toBe(true);
  });
});
