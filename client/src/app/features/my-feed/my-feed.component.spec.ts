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
    expect(
      el.querySelector(`[data-cy="react-clap-${postId}"] .feed__react-count`)?.textContent,
    ).toContain('1');
  });

  it('renders the per-emoji count next to the right button (clap-only post)', () => {
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

    const clapCount = el.querySelector(`[data-cy="react-clap-${postId}"] .feed__react-count`);
    const prayCount = el.querySelector(`[data-cy="react-pray-${postId}"] .feed__react-count`);
    expect(clapCount?.textContent).toContain('2');
    // Pray button has no counter span when its count is 0.
    expect(prayCount).toBeNull();
  });

  it('renders the per-emoji count next to the right button (pray-only post — #647)', () => {
    // This is the regression we shipped — the previous shape dumped
    // the total on the Clap button regardless of which emoji had
    // been used. Pin the inverted shape.
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

    const clapCount = el.querySelector(`[data-cy="react-clap-${postId}"] .feed__react-count`);
    const prayCount = el.querySelector(`[data-cy="react-pray-${postId}"] .feed__react-count`);
    expect(prayCount?.textContent).toContain('2');
    expect(clapCount).toBeNull();
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

    // Optimistic: clap counter gone, pray shows 1.
    expect(el.querySelector(`[data-cy="react-clap-${postId}"] .feed__react-count`)).toBeNull();
    expect(
      el.querySelector(`[data-cy="react-pray-${postId}"] .feed__react-count`)?.textContent,
    ).toContain('1');

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
    expect(
      el.querySelector(`[data-cy="rsvp-going-${postId}"] .feed__react-count`)?.textContent,
    ).toContain('1');
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
});
