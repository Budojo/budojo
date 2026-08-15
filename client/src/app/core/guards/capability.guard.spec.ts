import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { RuntimeService } from '../services/runtime.service';
import { capabilityGuard } from './capability.guard';

/**
 * Capability route gate (#1229): a deep link into a surface the runtime does
 * not offer lands on the dashboard instead of a shell that 404s on every call.
 */
describe('capabilityGuard', () => {
  function setup(capabilities: string[]): { loaded: ReturnType<typeof vi.fn> } {
    const set = new Set(capabilities);
    const loaded = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: RuntimeService,
          useValue: {
            load: loaded,
            has: signal((capability: string) => set.has(capability)),
          },
        },
      ],
    });
    return { loaded };
  }

  async function run(capability: 'community' | 'athlete_accounts'): Promise<boolean | UrlTree> {
    return TestBed.runInInjectionContext(() =>
      capabilityGuard(capability)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  }

  it('lets the navigation through when the runtime has the capability', async () => {
    setup(['community']);

    await expect(run('community')).resolves.toBe(true);
  });

  it('redirects to the dashboard when it does not', async () => {
    setup([]);
    const router = TestBed.inject(Router);

    const result = await run('community');

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/dashboard');
  });

  it('waits for the capability list before deciding', async () => {
    // A cold-start deep link must decide on real data, not the optimistic
    // web default that exists only so the hosted app never hides anything.
    const { loaded } = setup(['athlete_accounts']);

    await run('athlete_accounts');

    expect(loaded).toHaveBeenCalledTimes(1);
  });
});
