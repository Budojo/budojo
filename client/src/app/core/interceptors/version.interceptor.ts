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
 * Scoped to relative `/api/...` URLs so cross-origin requests
 * (e.g. assets pulled from `/storage/...` via an absolute URL) don't
 * pick up an unexpected custom header — no preflight cost there.
 */
export const versionInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') && !req.url.includes('/api/v1/')) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'X-Budojo-Version': VERSION.tag } }));
};
