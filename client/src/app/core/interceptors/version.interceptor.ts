import { HttpInterceptorFn } from '@angular/common/http';
import { VERSION } from '../../../environments/version';

/**
 * Adds an `X-Budojo-Version` header to every outgoing API request so
 * the server can record which SPA build produced the request. The
 * support-ticket flow (#423 + post-v1.17 consolidation) reads this
 * header into `support_tickets.app_version`; future paths (audit log,
 * error reports) can lean on the same signal without changing the
 * client contract.
 *
 * Scoped to API URLs only (relative `/api/...` and absolute
 * `https://api.budojo.app/...` shapes both match) so cross-origin
 * requests for static assets (`/storage/...`) don't pick up an
 * unexpected custom header that would force a CORS preflight.
 */
export const versionInterceptor: HttpInterceptorFn = (req, next) => {
  // Match either relative (`/api/`) or absolute URLs that include
  // `/api/v1/` somewhere in the path. Anchoring on the version
  // segment avoids false-positives on any URL that happens to have
  // an `api` substring.
  if (!req.url.startsWith('/api/') && !/\/api\/v1\//.test(req.url)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'X-Budojo-Version': VERSION.tag } }));
};
