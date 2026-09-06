import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * What the API this SPA talks to is able to offer (#1229). Mirrors the
 * server's `Capability` enum; the list arrives from `GET /api/v1/runtime`.
 */
export type Capability =
  'community' | 'athlete_accounts' | 'web_push' | 'email' | 'password_breach_check';

export const ALL_CAPABILITIES: readonly Capability[] = [
  'community',
  'athlete_accounts',
  'web_push',
  'email',
  'password_breach_check',
];

interface RuntimeResponse {
  data: { profile: 'web' | 'desktop'; capabilities: Capability[] };
}

/**
 * The runtime capability list, loaded once at boot and exposed as signals.
 *
 * Why the default is *everything*: the hosted web app has every capability,
 * the whole existing Cypress suite runs without this endpoint mocked, and a
 * momentary failure to load must never hide surfaces on the web. Only a
 * successful response narrows the set — and on a runtime that lacks a
 * capability its routes answer 404 server-side anyway, so a stale "all"
 * costs one dead-end click, never a broken action.
 *
 * Why not the build-time `environment.runtime`: that flag gates build
 * artefacts (service worker, version poll). Feature visibility is a fact
 * about the API, and the API says so.
 */
@Injectable({ providedIn: 'root' })
export class RuntimeService {
  private readonly http = inject(HttpClient);

  private readonly capabilitiesSignal = signal<readonly Capability[]>(ALL_CAPABILITIES);
  private readonly profileSignal = signal<'web' | 'desktop'>('web');
  private loading: Promise<void> | null = null;

  readonly capabilities = this.capabilitiesSignal.asReadonly();
  readonly profile = this.profileSignal.asReadonly();

  /** True when the runtime offers the capability. Reactive — safe in templates and computeds. */
  readonly has = computed(() => {
    const current = new Set(this.capabilitiesSignal());
    return (capability: Capability): boolean => current.has(capability);
  });

  /**
   * Fetches the list once; concurrent callers share the same promise. Never
   * rejects — a failure keeps the web default.
   */
  load(): Promise<void> {
    this.loading ??= firstValueFrom(
      this.http.get<RuntimeResponse>(`${environment.apiBase}/api/v1/runtime`),
    )
      .then((response) => {
        // Trust the shape only when it is the shape. A catch-all test stub, a
        // proxy answering with the SPA shell, a half-deployed API — anything
        // that is not `{ data: { profile, capabilities[] } }` keeps the web
        // default rather than emptying the set and hiding the whole app.
        const parsed = parseRuntime(response);
        if (parsed === null) {
          return;
        }
        this.profileSignal.set(parsed.profile);
        this.capabilitiesSignal.set(parsed.capabilities);
      })
      .catch(() => undefined);

    return this.loading;
  }
}

function parseRuntime(
  response: unknown,
): { profile: 'web' | 'desktop'; capabilities: Capability[] } | null {
  if (typeof response !== 'object' || response === null) {
    return null;
  }
  const data = (response as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return null;
  }
  const { profile, capabilities } = data as { profile?: unknown; capabilities?: unknown };
  if ((profile !== 'web' && profile !== 'desktop') || !Array.isArray(capabilities)) {
    return null;
  }
  const known = new Set<string>(ALL_CAPABILITIES);
  return {
    profile,
    capabilities: capabilities.filter(
      (c): c is Capability => typeof c === 'string' && known.has(c),
    ),
  };
}
