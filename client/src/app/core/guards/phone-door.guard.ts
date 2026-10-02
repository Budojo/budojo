import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { DRIVE_AUTH, PHP_SERVER } from '../mobile/shell-plugins';

/**
 * The door (#2079) is where a signed-out owner lands on the phone: inside the
 * Android app, with the plugins it needs and a shell that made a secret. A
 * shell older than the door has none, and keeps the welcome and the sign-in.
 */
function onThePhone(): boolean {
  return (
    inject(PHP_SERVER) !== null &&
    inject(DRIVE_AUTH) !== null &&
    Boolean(window.__BUDOJO_MOBILE__?.shellSecret)
  );
}

/** `/` is the door on the phone, the welcome elsewhere. */
export const phoneDoorMatch: CanMatchFn = () => onThePhone();

/**
 * The sign-in sends the phone to the door: every way out of a session (sign
 * out, a token refused) lands there. A guard, since Angular refuses one on a
 * redirect.
 */
export const signInIsTheDoor: CanActivateFn = () =>
  onThePhone() ? inject(Router).createUrlTree(['/']) : true;
