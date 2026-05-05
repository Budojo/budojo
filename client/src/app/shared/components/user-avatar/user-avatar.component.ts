import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';

/**
 * Renders a user's avatar — either the uploaded image OR a deterministic
 * initials fallback (#411). Used in the dashboard topbar chip and in the
 * profile-page avatar card.
 *
 * Inputs:
 *   - `name` — full name; initials are derived from the first letter of
 *     the first two whitespace-delimited tokens (`Mario Rossi` -> `MR`,
 *     `Cher` -> `C`). Empty / null name falls back to `?`.
 *   - `url`  — `avatar_url` from the User envelope; when null OR the
 *     image fails to load, the component shows the initials.
 *   - `size` — preset size token. Two slots covers every current need
 *     (`chip` for the topbar, `card` for the profile page); a third
 *     can be added the day a real third site appears (Rule of Three).
 *
 * Norman § signifier: the uploaded image, when present, is rendered as a
 * round disc with object-fit: cover so a non-square upload still looks
 * sensible. Server-side every upload is already 256x256, so this is a
 * defence-in-depth (an admin-injected image bypassing the resize would
 * still render as a circle, no aspect-ratio surprise).
 */
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-avatar.component.html',
  styleUrl: './user-avatar.component.scss',
})
export class UserAvatarComponent {
  readonly url = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>(null);
  readonly size = input<'chip' | 'card'>('chip');
  /**
   * Optional override for the `<img alt>` attribute. When omitted, the
   * image renders as `aria-hidden` because the surrounding context (the
   * topbar / the profile card) already announces the user's identity —
   * a redundant label here would force assistive tech to read the same
   * name twice.
   */
  readonly alt = input<string | null>(null);

  protected readonly initials = computed<string>(() => {
    const raw = (this.name() ?? '').trim();
    if (raw.length === 0) return '?';
    const tokens = raw.split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length === 0) return '?';
    const first = tokens[0]?.charAt(0) ?? '';
    const second = tokens[1]?.charAt(0) ?? '';
    return (first + second).toUpperCase();
  });

  /**
   * Set when the `<img>` fires its `error` event — typically a stale or
   * deleted file, or a transient CDN miss. Once tripped the template
   * swaps to the initials fallback so the user never sees a broken-image
   * icon. Resets the moment the URL changes, so a successful replace
   * (e.g. user uploads a new avatar after a previous broken one) lets
   * the new image render without forcing a remount.
   */
  protected readonly imageFailed = signal(false);

  constructor() {
    // Reset the failure latch whenever the URL changes — a fresh URL
    // is a new bitmap that hasn't had a chance to fail yet.
    effect(() => {
      this.url();
      this.imageFailed.set(false);
    });
  }

  /** Resolved src — null when there's no URL OR the image previously failed. */
  protected readonly displayedUrl = computed<string | null>(() =>
    !this.imageFailed() ? (this.url() ?? null) : null,
  );

  protected onImageError(): void {
    this.imageFailed.set(true);
  }
}
