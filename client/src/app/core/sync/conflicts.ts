import { AthleteIdentity } from '../services/athlete.service';

/**
 * A write a rebase set aside, waiting for the owner (#2038, PRD § 6.4): what
 * `GET /api/v1/sync/conflicts` answers (`docs/api/v1.yaml`, `SyncConflict`).
 */
export interface SyncConflict {
  /** The set-aside journal entry's id. */
  id: string;
  /** The device that made the write: `pc4f2a`, `phone9c1e`. */
  device: string;
  route: string;
  reason: ConflictReason;
  /** What the replay found: a field and both sides, or a status and message. */
  detail: ConflictDetail;
  entry: {
    method: string;
    params: Record<string, unknown>;
    body: Record<string, unknown> | null;
    before: Record<string, unknown> | null;
  };
  recorded_at: string;
  subject: { athlete: AthleteIdentity & { name: string }; others: number } | null;
  /** The requests that make the set-aside write true here, in order; null when none would. */
  retry: ConflictRequest[] | null;
}

export type ConflictReason =
  'refused' | 'gone' | 'changed' | 'differs' | 'failed' | 'unknown-route';

export interface ConflictDetail {
  field?: string;
  /** `changed`: what the device saw before its write. */
  saw?: unknown;
  /** `changed`, `differs`: what this database holds. */
  here?: unknown;
  /** `differs`: what the device's write set. */
  mine?: unknown;
  message?: string | null;
}

export interface ConflictRequest {
  method: string;
  /** Relative to the server: `/api/v1/athletes/57`. */
  url: string;
  body: unknown;
}

export type ConflictDecision = 'theirs' | 'mine' | 'by-hand';

/** The kind of device an id names: the PC or the phone. */
export function deviceKind(device: string): 'pc' | 'phone' {
  return device.startsWith('phone') ? 'phone' : 'pc';
}
