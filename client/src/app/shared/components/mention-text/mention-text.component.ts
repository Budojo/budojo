import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Renders plain feed body text, transforming `@handle` segments into
 * router links to the same-academy public profile (#864, M9 social-profile
 * epic slice B).
 *
 * The handle regex mirrors the server's canonical pattern (`HandleFormat`,
 * #479): lowercase `[a-z][a-z0-9._]{2,29}` (3-30 chars total, must start
 * with a letter). Case-insensitive so `@MARIO` in body text still gets
 * picked up — the link normalizes the case before navigating.
 *
 * Word-boundary guard at the front prevents email-style false positives
 * (`mario@example.com` must not produce a link on `@example`). Practical
 * approximation: the `@` must be preceded by start-of-string, whitespace,
 * or one of the punctuation characters that naturally precedes a mention
 * in social copy (`(`, `[`, `\n`, etc.).
 *
 * Output is rendered as a fragment of `<span>` + `<a routerLink>` siblings
 * — no `innerHTML`, no `bypassSecurityTrustHtml`, no XSS surface. Slice C
 * sidebar refactor is independent; once both Slice A (route) + Slice B
 * (this component) land, an author writing "Congrats @mariobjj!" gets a
 * tappable link to mariobjj's public profile.
 */

type Segment = { kind: 'text'; value: string } | { kind: 'mention'; handle: string };

const HANDLE_PATTERN = /(^|[\s([{,;:!?\n])@([a-z][a-z0-9._]{2,29})(?![a-z0-9._])/gi;

@Component({
  selector: 'app-mention-text',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (segment of segments(); track $index) {
      @if (segment.kind === 'text') {
        <span>{{ segment.value }}</span>
      } @else {
        <a
          [routerLink]="['/dashboard/u', segment.handle]"
          class="mention-text__link"
          data-cy="mention-link"
          >&commat;{{ segment.handle }}</a
        >
      }
    }
  `,
  styles: [
    `
      :host {
        display: inline;
        white-space: pre-wrap;
      }
      .mention-text__link {
        color: var(--p-primary-color);
        text-decoration: none;
      }
      .mention-text__link:hover,
      .mention-text__link:focus-visible {
        text-decoration: underline;
      }
    `,
  ],
})
export class MentionTextComponent {
  readonly text = input.required<string>();

  protected readonly segments = computed<Segment[]>(() => splitIntoSegments(this.text()));
}

export function splitIntoSegments(input: string): Segment[] {
  if (input === '') {
    return [];
  }

  const segments: Segment[] = [];
  let cursor = 0;
  // Reset lastIndex — the regex is module-scoped, so a previous run
  // would leave the search anchored mid-string on the next call.
  HANDLE_PATTERN.lastIndex = 0;

  for (let match = HANDLE_PATTERN.exec(input); match !== null; match = HANDLE_PATTERN.exec(input)) {
    const [, prefix, handle] = match;
    const mentionStart = match.index + (prefix ?? '').length;

    if (cursor < mentionStart) {
      segments.push({ kind: 'text', value: input.slice(cursor, mentionStart) });
    }
    segments.push({ kind: 'mention', handle: handle.toLowerCase() });
    cursor = mentionStart + 1 + handle.length;
  }

  if (cursor < input.length) {
    segments.push({ kind: 'text', value: input.slice(cursor) });
  }

  return segments;
}
