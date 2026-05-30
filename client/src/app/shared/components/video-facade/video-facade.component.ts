import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { MentionTextComponent } from '../mention-text/mention-text.component';

export type VideoProvider = 'instagram' | 'youtube' | 'tiktok';

/**
 * Tap-to-play facade for a shared external technique video (#1155, epic
 * #1153). Renders OUR cached cover (or a cover-less branded card) + a play
 * button by default — **nothing third-party loads**. On tap it swaps in the
 * provider's official embed in a **sandboxed** iframe, so the video plays
 * inline in Budojo and the user only pulls in a third party by choosing to.
 *
 * YouTube + TikTok play inline. Instagram **gates third-party embeds**, so
 * its iframe only renders a login/broken card (confirmed on-device, #1175) —
 * we never mount it: the IG cover keeps our cached preview and tapping opens
 * the reel on Instagram. The inline embeds are sandboxed and pinned to a
 * privacy `referrerpolicy` so a tapped provider only ever learns our origin,
 * never the feed deep-link (#1156).
 */
@Component({
  selector: 'app-video-facade',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MentionTextComponent],
  templateUrl: './video-facade.component.html',
  styleUrl: './video-facade.component.scss',
})
export class VideoFacadeComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly provider = input.required<VideoProvider>();
  /** Provider video id / shortcode. */
  readonly videoId = input.required<string>();
  /** Our cached, same-origin cover URL; null → cover-less branded card. */
  readonly thumbnailUrl = input<string | null>(null);
  readonly title = input<string | null>(null);
  readonly authorName = input<string | null>(null);
  /** The sharer's own note. */
  readonly caption = input<string | null>(null);
  /** The original watch URL — the "Open on <provider>" fallback. */
  readonly url = input.required<string>();

  /** Flips on the first tap; only then is the third-party embed mounted. */
  protected readonly playing = signal(false);

  /**
   * Instagram and TikTok are reels — native 9:16 portrait. YouTube is
   * 16:9 landscape. The media box follows the provider so the original
   * isn't cropped into the wrong aspect ratio (#1166).
   */
  protected readonly isPortrait = computed<boolean>(
    () => this.provider() === 'instagram' || this.provider() === 'tiktok',
  );

  protected readonly providerLabel = computed<string>(
    () => ({ instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok' })[this.provider()],
  );

  protected readonly providerGlyph = computed<string>(
    () =>
      ({
        instagram: 'pi pi-instagram',
        youtube: 'pi pi-youtube',
        tiktok: 'pi pi-tiktok',
      })[this.provider()],
  );

  /**
   * Instagram can't be played inline (it gates embeds), so its cover opens
   * the reel on Instagram instead of mounting the broken embed (#1175).
   */
  protected readonly opensExternally = computed<boolean>(() => this.provider() === 'instagram');

  /**
   * Centre overlay on the cover: a play triangle for the inline providers,
   * the provider glyph for IG so it signals "opens Instagram", not "plays
   * here".
   */
  protected readonly overlayGlyph = computed<string>(() =>
    this.opensExternally() ? this.providerGlyph() : 'pi pi-play-circle',
  );

  /**
   * The sandboxed embed URL, built only once `playing()` is true. Privacy-
   * enhanced where the provider offers it (YouTube `-nocookie`). Marked
   * trusted because it's derived from a fixed per-provider template with a
   * server-validated id — never raw user input.
   */
  protected readonly embedSrc = computed<SafeResourceUrl | null>(() => {
    // IG never plays inline (opensExternally) — the embed is never mounted.
    if (!this.playing() || this.opensExternally()) {
      return null;
    }

    const id = encodeURIComponent(this.videoId());
    const raw = {
      youtube: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
      tiktok: `https://www.tiktok.com/embed/v2/${id}`,
      instagram: `https://www.instagram.com/reel/${id}/embed/`,
    }[this.provider()];

    return this.sanitizer.bypassSecurityTrustResourceUrl(raw);
  });

  protected play(): void {
    if (this.opensExternally()) {
      // IG: open the reel on Instagram rather than mounting the broken embed.
      window.open(this.url(), '_blank', 'noopener,noreferrer');
      return;
    }
    this.playing.set(true);
  }
}
