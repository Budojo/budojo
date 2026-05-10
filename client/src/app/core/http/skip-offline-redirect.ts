import { HttpContextToken } from '@angular/common/http';

/**
 * HttpContext flag that opts a request out of `errorInterceptor`'s
 * `status === 0` → `/offline` global redirect.
 *
 * **Why this exists.** The default behavior — a `status === 0` response
 * (CORS / DNS / network drop) means the whole app is offline, so the
 * full-page takeover to `/offline` is the right UX for user-initiated
 * traffic. Background polls (the cache-bust check at `/version.json`,
 * #548) are NOT user-initiated — a transient network hiccup at minute
 * 17 of a 20-minute interval poll should not unexpectedly navigate the
 * user away from the form they're filling out.
 *
 * Set the flag on a request via `context: new HttpContext().set(SKIP_OFFLINE_REDIRECT, true)`
 * (or merge into an existing context). `errorInterceptor` reads it and
 * lets the error propagate to the caller's local handler without the
 * global side-effect.
 */
export const SKIP_OFFLINE_REDIRECT = new HttpContextToken<boolean>(() => false);
