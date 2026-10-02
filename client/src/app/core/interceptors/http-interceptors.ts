import { HttpInterceptorFn } from '@angular/common/http';
import { ClientRuntime } from '../../../environments/runtime';
import { phoneServerInterceptor } from '../mobile/phone-server';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';
import { versionInterceptor } from './version.interceptor';

/**
 * The interceptors, in order. A request runs through them top to bottom and
 * its answer comes back bottom to top.
 *
 * - Auth before the error handling: it adds the bearer token, and the error
 *   handling inspects the *answer*, so it sits downstream of any change to the
 *   request. If a 5xx ever bounces us through an auth refresh, that retry must
 *   run before the global error redirect.
 * - On the phone, the server restart goes last, nearest the server (#2034):
 *   a retry that works must never reach the error handling, which would show
 *   the offline page for a request that in the end succeeded.
 */
export function httpInterceptors(runtime: ClientRuntime): HttpInterceptorFn[] {
  return [
    versionInterceptor,
    authInterceptor,
    errorInterceptor,
    ...(runtime === 'mobile' ? [phoneServerInterceptor] : []),
  ];
}
