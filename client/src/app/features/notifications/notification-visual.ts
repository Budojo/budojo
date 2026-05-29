/**
 * Maps a notification's stable `kind` discriminator (#1129) to its
 * presentation: a PrimeIcon and a semantic tone. The tone drives the
 * badge colour in SCSS (`.badge--<tone>`), so colours stay in the theme
 * layer, never hard-coded here. Unknown / null kinds fall back to a
 * neutral bell so a new server-side kind never renders blank.
 */
export type NotificationTone =
  | 'promotion'
  | 'member'
  | 'comment'
  | 'reaction'
  | 'event'
  | 'payment'
  | 'document'
  | 'training'
  | 'alert'
  | 'recap'
  | 'system';

export interface NotificationVisual {
  readonly icon: string;
  readonly tone: NotificationTone;
}

const VISUALS: Readonly<Record<string, NotificationVisual>> = {
  athlete_promoted: { icon: 'pi pi-star-fill', tone: 'promotion' },
  community_belt_celebration: { icon: 'pi pi-star-fill', tone: 'promotion' },
  athlete_signed_up: { icon: 'pi pi-user-plus', tone: 'member' },
  verification: { icon: 'pi pi-verified', tone: 'member' },
  community_comment_on_your_post: { icon: 'pi pi-comment', tone: 'comment' },
  community_reply: { icon: 'pi pi-comments', tone: 'comment' },
  community_reaction_on_your_post: { icon: 'pi pi-heart-fill', tone: 'reaction' },
  community_new_post: { icon: 'pi pi-megaphone', tone: 'event' },
  community_event_new: { icon: 'pi pi-calendar', tone: 'event' },
  owner_event_rsvp: { icon: 'pi pi-calendar-plus', tone: 'event' },
  athlete_payment_marked_paid: { icon: 'pi pi-wallet', tone: 'payment' },
  athlete_payment_overdue: { icon: 'pi pi-exclamation-circle', tone: 'alert' },
  athlete_medical_cert_expiring: { icon: 'pi pi-file', tone: 'document' },
  owner_athlete_doc_uploaded: { icon: 'pi pi-file', tone: 'document' },
  athlete_training_today: { icon: 'pi pi-bolt', tone: 'training' },
  owner_athlete_missed_streak: { icon: 'pi pi-exclamation-triangle', tone: 'alert' },
  weekly_recap: { icon: 'pi pi-chart-bar', tone: 'recap' },
};

const FALLBACK: NotificationVisual = { icon: 'pi pi-bell', tone: 'system' };

export function notificationVisual(kind: string | null | undefined): NotificationVisual {
  if (kind === null || kind === undefined) {
    return FALLBACK;
  }
  return VISUALS[kind] ?? FALLBACK;
}
