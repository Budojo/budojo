import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MyFeedComponent } from './my-feed.component';
import type { CommunityFeedPage } from '../../core/services/community.service';
import { environment } from '../../../environments/environment';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function emptyPage(): CommunityFeedPage {
  return {
    data: [],
    meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [MyFeedComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(MyFeedComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http };
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
});
