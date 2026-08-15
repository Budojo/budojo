import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Capability, RuntimeService } from '../services/runtime.service';

/**
 * Route gate for a runtime capability (#1229). A stale deep link into a
 * surface the runtime does not have — a bookmarked community feed on the
 * desktop — lands on the dashboard instead of rendering a shell whose every
 * request would 404.
 *
 * Awaits the capability list so the very first navigation of a cold start
 * decides on real data, not the optimistic web default.
 */
export function capabilityGuard(capability: Capability): CanActivateFn {
  return async () => {
    const runtime = inject(RuntimeService);
    const router = inject(Router);

    await runtime.load();

    if (runtime.has()(capability)) {
      return true;
    }

    return router.createUrlTree(['/dashboard']);
  };
}
