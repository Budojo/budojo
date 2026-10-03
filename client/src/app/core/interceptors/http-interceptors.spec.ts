import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';
import { httpInterceptors } from './http-interceptors';
import { versionInterceptor } from './version.interceptor';
import { phoneServerInterceptor } from '../mobile/phone-server';
import { writeGateInterceptor } from '../sync/write-gate';

/**
 * The order is the behaviour: a request runs through the list top to bottom,
 * and its answer comes back bottom to top.
 */
describe('httpInterceptors', () => {
  it('on the web: version, auth, then the global error handling', () => {
    expect(httpInterceptors('web')).toEqual([
      versionInterceptor,
      authInterceptor,
      errorInterceptor,
    ]);
  });

  it('on the desktop, the write gate below the error handling: a held write waits, it does not fail (#2046)', () => {
    expect(httpInterceptors('desktop')).toEqual([
      versionInterceptor,
      authInterceptor,
      errorInterceptor,
      writeGateInterceptor,
    ]);
  });

  it('on the phone, puts the server restart last, so a retry that works never reaches the error page (#2034)', () => {
    expect(httpInterceptors('mobile')).toEqual([
      versionInterceptor,
      authInterceptor,
      errorInterceptor,
      writeGateInterceptor,
      phoneServerInterceptor,
    ]);
  });
});
