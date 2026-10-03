/**
 * The homecoming («il rientro», PRD § 6.2, #2039): what the other device's
 * work brought, as `GET /sync/homecoming` answers it, for the card on Oggi.
 * Counted by the server from the rows still there (`RecordHomecomingAction`).
 */
export interface Homecoming {
  /** The device whose work it is: `phone…` or `pc…`. */
  device: string;
  /** When that device made the newest of these writes, in UTC. */
  at: string;
  /** The newest entry's id: what `DELETE /sync/homecoming?through=` names. */
  through: string;
  /** Presences by the lesson they were recorded into, the busiest first; `lesson` null without one. */
  attendance: { lesson: string | null; count: number }[];
  payments: { count: number; amount_cents: number };
  athletes: number;
  promotions: number;
  /** One per write that created none of the rows above: an edit, a deletion, a note. */
  other: number;
}
