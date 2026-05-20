import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { MyFeedComponent } from './my-feed.component';
import type { CommunityFeedPage, CommunityPost } from '../../core/services/community.service';
import { AuthService, type UserRole } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function emptyPage(): CommunityFeedPage {
  return {
    data: [],
    meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
  };
}

function setup(opts: { role?: UserRole } = {}) {
  TestBed.configureTestingModule({
    imports: [MyFeedComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });

  if (opts.role !== undefined) {
    TestBed.inject(AuthService).user.set({
      id: 1,
      first_name: 'Test',
      last_name: 'User',
      full_name: 'Test User',
      handle: null,
      email: 'test@example.com',
      email_verified_at: null,
      avatar_url: null,
      role: opts.role,
    });
  }

  const fixture = TestBed.createComponent(MyFeedComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http };
}

function postFixture(overrides: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id: 42,
    type: 'event',
    visibility: 'academy',
    payload: { title: 'Open mat', starts_at: '2026-06-13T10:00:00Z' },
    created_at: '2026-05-10T08:00:00Z',
    created_by: {
      id: 99,
      first_name: 'Other',
      last_name: 'User',
      full_name: 'Other User',
      handle: null,
      avatar_url: null,
      belt: null,
    },
    reactions_count: 0,
    reaction_counts: { clap: 0, pray: 0 },
    comments_count: 0,
    rsvps_count: 0,
    going_rsvps_count: 0,
    maybe_rsvps_count: 0,
    your_reaction: null,
    your_rsvp: null,
    ...overrides,
  };
}

describe('MyFeedComponent (#614, M9 PR-B2 client)', () => {
  it('shows the loading skeleton while the first feed request is in flight', () => {
    const { el, http } = setup();

    expect(el.querySelector('[data-cy="my-feed-loading"]')).not.toBeNull();
    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush(emptyPage());
  });

  it('shows the empty state when the feed has zero posts', () => {
    const { fixture, el, http } = setup();

    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush(emptyPage());
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="my-feed-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="my-feed-list"]')).toBeNull();
  });

  it('renders a belt-promotion post with athlete name and the belt transition', () => {
    const { fixture, el, http } = setup();

    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          id: 42,
          type: 'belt_promotion',
          visibility: 'academy',
          payload: {
            athlete_id: 7,
            athlete_name: 'Mario Rossi',
            old_belt: 'white',
            new_belt: 'blue',
            promoted_at: '2026-05-10T08:00:00Z',
          },
          created_at: '2026-05-10T08:00:00Z',
          created_by: {
            id: 1,
            first_name: 'Owner',
            last_name: 'One',
            full_name: 'Owner One',
            handle: null,
            avatar_url: null,
            belt: null,
          },
          reactions_count: 0,
          reaction_counts: { clap: 0, pray: 0 },
          comments_count: 0,
          rsvps_count: 0,
          going_rsvps_count: 0,
          maybe_rsvps_count: 0,
          your_reaction: null,
          your_rsvp: null,
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    const card = el.querySelector('[data-cy="my-feed-post-42"]');
    expect(card).not.toBeNull();
    expect(card?.querySelector('[data-cy="post-belt-promotion"]')).not.toBeNull();
    expect(card?.querySelector('.feed__belt-line')?.textContent).toContain('Mario Rossi');
  });

  it('renders an event post with title and starts-at time', () => {
    const { fixture, el, http } = setup();

    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          id: 51,
          type: 'event',
          visibility: 'academy',
          payload: {
            title: 'Open mat — Saturday',
            starts_at: '2026-05-17T10:00:00Z',
            location_text: 'Via Roma 10, Milano',
          },
          created_at: '2026-05-10T08:00:00Z',
          created_by: {
            id: 1,
            first_name: 'Owner',
            last_name: 'One',
            full_name: 'Owner One',
            handle: null,
            avatar_url: null,
            belt: null,
          },
          reactions_count: 0,
          reaction_counts: { clap: 0, pray: 0 },
          comments_count: 0,
          rsvps_count: 0,
          going_rsvps_count: 0,
          maybe_rsvps_count: 0,
          your_reaction: null,
          your_rsvp: null,
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    const card = el.querySelector('[data-cy="my-feed-post-51"]');
    expect(card?.querySelector('[data-cy="post-event"]')).not.toBeNull();
    expect(card?.querySelector('.feed__event-title')?.textContent).toContain('Open mat — Saturday');
    expect(card?.querySelector('.feed__event-location')?.textContent).toContain(
      'Via Roma 10, Milano',
    );
  });

  it('shows the error state when the API call fails', () => {
    const { fixture, el, http } = setup();

    http
      .expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="my-feed-error"]')).not.toBeNull();
  });

  it('clap-button click optimistically marks the button active + fires the API, reconciles on response', () => {
    const { fixture, el, http } = setup();

    const postId = 99;
    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          id: postId,
          type: 'owner_announcement',
          visibility: 'academy',
          payload: { body: 'A post' },
          created_at: '2026-05-10T08:00:00Z',
          created_by: {
            id: 1,
            first_name: 'O',
            last_name: 'O',
            full_name: 'O O',
            handle: null,
            avatar_url: null,
            belt: null,
          },
          reactions_count: 0,
          reaction_counts: { clap: 0, pray: 0 },
          comments_count: 0,
          rsvps_count: 0,
          going_rsvps_count: 0,
          maybe_rsvps_count: 0,
          your_reaction: null,
          your_rsvp: null,
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    const btn = el.querySelector(`[data-cy="react-clap-${postId}"]`) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    btn.click();
    fixture.detectChanges();

    // Optimistic flip — button shows as active before the response.
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    // Server confirms with canonical state.
    http
      .expectOne(`${environment.apiBase}/api/v1/community/posts/${postId}/reactions`)
      .flush({ your_reaction: 'clap', counts: { clap: 1, pray: 0 } });
    fixture.detectChanges();

    expect(btn.getAttribute('aria-pressed')).toBe('true');
    // Per-emoji count now sits INSIDE the reaction chip (#777, post-
    // v2.18.1) — separate touch zone that opens the reactions-list
    // sheet on tap. Asserting on the clap-specific count zone.
    expect(el.querySelector(`[data-cy="reactions-summary-clap-${postId}"]`)?.textContent).toContain(
      '1',
    );
    // Pray-side count zone absent when pray count is 0.
    expect(el.querySelector(`[data-cy="reactions-summary-pray-${postId}"]`)).toBeNull();
  });

  it('renders the per-emoji count inside the clap chip when only clap > 0 (#777)', () => {
    const { fixture, el, http } = setup();
    const postId = 90;
    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          ...postFixture({ id: postId }),
          reactions_count: 2,
          reaction_counts: { clap: 2, pray: 0 },
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    const clapCount = el.querySelector(`[data-cy="reactions-summary-clap-${postId}"]`);
    expect(clapCount?.textContent).toContain('2');
    // Pray side hidden when its count is 0.
    expect(el.querySelector(`[data-cy="reactions-summary-pray-${postId}"]`)).toBeNull();
  });

  it('renders the per-emoji count inside the pray chip when only pray > 0 (#647 / #777)', () => {
    const { fixture, el, http } = setup();
    const postId = 91;
    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          ...postFixture({ id: postId }),
          reactions_count: 2,
          reaction_counts: { clap: 0, pray: 2 },
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    const prayCount = el.querySelector(`[data-cy="reactions-summary-pray-${postId}"]`);
    expect(prayCount?.textContent).toContain('2');
    expect(el.querySelector(`[data-cy="reactions-summary-clap-${postId}"]`)).toBeNull();
  });

  it('clap → pray swap updates per-emoji counts without changing the total', () => {
    const { fixture, el, http } = setup();
    const postId = 92;
    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          ...postFixture({ id: postId }),
          reactions_count: 1,
          reaction_counts: { clap: 1, pray: 0 },
          your_reaction: 'clap',
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    // Tap the Pray button — swap in place (clap−1, pray+1, total=1).
    const prayBtn = el.querySelector(`[data-cy="react-pray-${postId}"]`) as HTMLButtonElement;
    prayBtn.click();
    fixture.detectChanges();

    // Optimistic: clap-side count zone disappears, pray-side renders "1".
    expect(el.querySelector(`[data-cy="reactions-summary-clap-${postId}"]`)).toBeNull();
    expect(el.querySelector(`[data-cy="reactions-summary-pray-${postId}"]`)?.textContent).toContain(
      '1',
    );

    // Server reconciles to the same shape.
    http
      .expectOne(`${environment.apiBase}/api/v1/community/posts/${postId}/reactions`)
      .flush({ your_reaction: 'pray', counts: { clap: 0, pray: 1 } });
    fixture.detectChanges();

    expect(prayBtn.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector(`[data-cy="react-clap-${postId}"]`)?.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('rolls back the optimistic reaction when the API call fails', () => {
    const { fixture, el, http } = setup();

    const postId = 77;
    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          id: postId,
          type: 'owner_announcement',
          visibility: 'academy',
          payload: { body: 'A post' },
          created_at: '2026-05-10T08:00:00Z',
          created_by: {
            id: 1,
            first_name: 'O',
            last_name: 'O',
            full_name: 'O O',
            handle: null,
            avatar_url: null,
            belt: null,
          },
          reactions_count: 0,
          reaction_counts: { clap: 0, pray: 0 },
          comments_count: 0,
          rsvps_count: 0,
          going_rsvps_count: 0,
          maybe_rsvps_count: 0,
          your_reaction: null,
          your_rsvp: null,
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    const btn = el.querySelector(`[data-cy="react-clap-${postId}"]`) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    http
      .expectOne(`${environment.apiBase}/api/v1/community/posts/${postId}/reactions`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // Rolled back to inactive.
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('Going-RSVP click optimistically marks the button active + reconciles on response', () => {
    const { fixture, el, http } = setup();

    const postId = 88;
    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          id: postId,
          type: 'event',
          visibility: 'academy',
          payload: {
            title: 'Open mat',
            starts_at: '2026-05-17T10:00:00Z',
            location_text: 'Via Roma 10',
          },
          created_at: '2026-05-10T08:00:00Z',
          created_by: {
            id: 1,
            first_name: 'O',
            last_name: 'O',
            full_name: 'O O',
            handle: null,
            avatar_url: null,
            belt: null,
          },
          reactions_count: 0,
          reaction_counts: { clap: 0, pray: 0 },
          comments_count: 0,
          rsvps_count: 0,
          going_rsvps_count: 0,
          maybe_rsvps_count: 0,
          your_reaction: null,
          your_rsvp: null,
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    const btn = el.querySelector(`[data-cy="rsvp-going-${postId}"]`) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    btn.click();
    fixture.detectChanges();
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    http
      .expectOne(`${environment.apiBase}/api/v1/community/posts/${postId}/rsvp`)
      .flush({ your_rsvp: 'going', counts: { going: 1, maybe: 0 } });
    fixture.detectChanges();

    expect(btn.getAttribute('aria-pressed')).toBe('true');
    // The count is now a sibling of the toggle button inside the
    // shared `.feed__react-chip` wrapper (#806 — RSVP buttons adopted
    // the same chip pattern as reactions). Scope the count selector
    // to the chip wrapper instead of nesting under the button.
    expect(
      el.querySelector(`[data-cy="rsvp-chip-going-${postId}"] .feed__react-count`)?.textContent,
    ).toContain('1');
  });

  it('renders RSVP triggers inside the shared .feed__react-chip wrapper (#806)', () => {
    const { fixture, el, http } = setup();

    const postId = 99;
    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          id: postId,
          type: 'event',
          visibility: 'academy',
          payload: {
            title: 'Visual chip test',
            starts_at: '2026-05-20T10:00:00Z',
            location_text: 'Via Roma 10',
          },
          created_at: '2026-05-10T08:00:00Z',
          created_by: {
            id: 1,
            first_name: 'O',
            last_name: 'O',
            full_name: 'O O',
            handle: null,
            avatar_url: null,
            belt: null,
          },
          reactions_count: 0,
          reaction_counts: { clap: 0, pray: 0 },
          comments_count: 0,
          rsvps_count: 2,
          your_reaction: null,
          your_rsvp: 'going',
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    // Each RSVP affordance is a chip wrapper containing a toggle button;
    // the active state lives on the chip (not the button) so the active
    // background + border render via `.feed__react-chip--active`.
    const goingChip = el.querySelector(`[data-cy="rsvp-chip-going-${postId}"]`);
    const maybeChip = el.querySelector(`[data-cy="rsvp-chip-maybe-${postId}"]`);
    expect(goingChip?.classList.contains('feed__react-chip')).toBe(true);
    expect(goingChip?.classList.contains('feed__react-chip--active')).toBe(true);
    expect(maybeChip?.classList.contains('feed__react-chip')).toBe(true);
    expect(maybeChip?.classList.contains('feed__react-chip--active')).toBe(false);

    // The toggle button is the focusable element (aria-pressed, click).
    const goingBtn = goingChip?.querySelector('button.feed__react-toggle');
    expect(goingBtn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('rolls back the optimistic RSVP when the API call fails', () => {
    const { fixture, el, http } = setup();

    const postId = 89;
    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          id: postId,
          type: 'event',
          visibility: 'academy',
          payload: { title: 'Open mat', starts_at: '2026-05-17T10:00:00Z' },
          created_at: '2026-05-10T08:00:00Z',
          created_by: {
            id: 1,
            first_name: 'O',
            last_name: 'O',
            full_name: 'O O',
            handle: null,
            avatar_url: null,
            belt: null,
          },
          reactions_count: 0,
          reaction_counts: { clap: 0, pray: 0 },
          comments_count: 0,
          rsvps_count: 0,
          going_rsvps_count: 0,
          maybe_rsvps_count: 0,
          your_reaction: null,
          your_rsvp: null,
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    const btn = el.querySelector(`[data-cy="rsvp-maybe-${postId}"]`) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    http
      .expectOne(`${environment.apiBase}/api/v1/community/posts/${postId}/rsvp`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('navigates to the next page when the next button is clicked', () => {
    const { fixture, el, http } = setup();

    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
      data: [
        {
          id: 1,
          type: 'owner_announcement',
          visibility: 'academy',
          payload: { body: 'First post' },
          created_at: '2026-05-10T08:00:00Z',
          created_by: {
            id: 1,
            first_name: 'O',
            last_name: 'O',
            full_name: 'O O',
            handle: null,
            avatar_url: null,
            belt: null,
          },
          reactions_count: 0,
          reaction_counts: { clap: 0, pray: 0 },
          comments_count: 0,
          rsvps_count: 0,
          going_rsvps_count: 0,
          maybe_rsvps_count: 0,
          your_reaction: null,
          your_rsvp: null,
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 25, last_page: 2 },
    });
    fixture.detectChanges();

    const nextBtn = el.querySelector('[data-cy="my-feed-next"]') as HTMLButtonElement | null;
    expect(nextBtn).not.toBeNull();
    nextBtn?.click();

    http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=2`).flush({
      data: [],
      meta: { current_page: 2, per_page: 20, total: 25, last_page: 2 },
    });
    fixture.detectChanges();
  });

  describe('owner moderation (#641)', () => {
    function flushFeed(http: HttpTestingController, post: CommunityPost) {
      http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
        data: [post],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      });
    }

    it('does NOT render the trash icon for athletes', () => {
      const { fixture, el, http } = setup({ role: 'athlete' });
      flushFeed(http, postFixture({ id: 42 }));
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="delete-post-42"]')).toBeNull();
    });

    it('does NOT render the trash icon when no user is signed in', () => {
      // Defensive — the guards make this unreachable in production, but
      // the gate must not break in the absence of a user.
      const { fixture, el, http } = setup();
      flushFeed(http, postFixture({ id: 42 }));
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="delete-post-42"]')).toBeNull();
    });

    it('renders the trash icon on every feed card for owners', () => {
      const { fixture, el, http } = setup({ role: 'owner' });
      flushFeed(http, postFixture({ id: 42 }));
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="delete-post-42"]')).not.toBeNull();
    });

    it('clicks the trash → confirm → DELETE /community/posts/<id> → removes the card', () => {
      const { fixture, el, http } = setup({ role: 'owner' });
      flushFeed(http, postFixture({ id: 42 }));
      fixture.detectChanges();

      // Auto-accept the confirm dialog so the click flows straight to
      // the DELETE call. ConfirmationService is component-scoped (the
      // MyFeed providers array), so we pull it from the fixture's
      // injector rather than the root TestBed.
      const confirm = fixture.debugElement.injector.get(ConfirmationService);
      vi.spyOn(confirm, 'confirm').mockImplementation((opts) => {
        opts.accept?.();
        return confirm;
      });

      const btn = el.querySelector('[data-cy="delete-post-42"]') as HTMLButtonElement;
      btn.click();
      const req = http.expectOne(`${environment.apiBase}/api/v1/community/posts/42`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="my-feed-post-42"]')).toBeNull();
    });

    it('keeps the post in place when the DELETE request fails', () => {
      const { fixture, el, http } = setup({ role: 'owner' });
      flushFeed(http, postFixture({ id: 42 }));
      fixture.detectChanges();

      const confirm = fixture.debugElement.injector.get(ConfirmationService);
      vi.spyOn(confirm, 'confirm').mockImplementation((opts) => {
        opts.accept?.();
        return confirm;
      });

      const btn = el.querySelector('[data-cy="delete-post-42"]') as HTMLButtonElement;
      btn.click();
      const req = http.expectOne(`${environment.apiBase}/api/v1/community/posts/42`);
      req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      // No optimistic removal — the card stays so the user sees the
      // operation didn't take.
      expect(el.querySelector('[data-cy="my-feed-post-42"]')).not.toBeNull();
    });
  });

  // ─── Feed mobile polish (#777) ───────────────────────────────────────────
  // - Per-emoji count zones inside the chips open the reactions-list sheet.
  // - Comments toggle leaves the reactions row and becomes a corner FAB with
  //   an optional badge counter.

  describe('feed mobile polish (#777)', () => {
    function flushOne(http: HttpTestingController, post: CommunityPost) {
      http.expectOne(`${environment.apiBase}/api/v1/community/feed?page=1`).flush({
        data: [post],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      });
    }

    it('renders the comments FAB with a badge counter when comments_count > 0', () => {
      const { fixture, el, http } = setup();
      flushOne(http, postFixture({ id: 42, comments_count: 3 }));
      fixture.detectChanges();

      const fab = el.querySelector('[data-cy="toggle-comments-42"]');
      expect(fab).not.toBeNull();
      expect(fab?.classList.contains('feed__comments-fab')).toBe(true);
      const badge = el.querySelector('[data-cy="comments-fab-badge-42"]');
      expect(badge?.textContent?.trim()).toBe('3');
    });

    it('omits the badge counter when comments_count is 0', () => {
      const { fixture, el, http } = setup();
      flushOne(http, postFixture({ id: 42, comments_count: 0 }));
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="toggle-comments-42"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="comments-fab-badge-42"]')).toBeNull();
    });

    it('caps the badge counter at "99+" for large comment counts', () => {
      const { fixture, el, http } = setup();
      flushOne(http, postFixture({ id: 42, comments_count: 142 }));
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="comments-fab-badge-42"]')?.textContent?.trim()).toBe(
        '99+',
      );
    });

    it('tapping the count zone inside a chip opens the reactions-list sheet without toggling the reaction', () => {
      const { fixture, el, http } = setup();
      flushOne(
        http,
        postFixture({
          id: 42,
          reactions_count: 2,
          reaction_counts: { clap: 2, pray: 0 },
          your_reaction: null,
        }),
      );
      fixture.detectChanges();

      const countZone = el.querySelector('[data-cy="reactions-summary-clap-42"]') as HTMLElement;
      expect(countZone).not.toBeNull();

      // `openReactionsSheet` is protected — spy via an `any` cast so the
      // TS visibility check doesn't trip.
      const spy = vi.spyOn(
        fixture.componentInstance as unknown as { openReactionsSheet: (p: CommunityPost) => void },
        'openReactionsSheet',
      );
      countZone.click();
      fixture.detectChanges();

      expect(spy).toHaveBeenCalledTimes(1);

      // No reaction-toggle PATCH fired — clicking the count zone must
      // stopPropagation so the outer chip's toggle handler doesn't run.
      http.expectNone((r) => r.url.endsWith('/api/v1/community/posts/42/reactions'));
    });
  });
});
