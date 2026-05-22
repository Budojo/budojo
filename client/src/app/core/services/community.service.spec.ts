import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  CommunityFeedPage,
  CommunityPost,
  CommunityPostAuthor,
  CommunityService,
  CreateEventPayload,
  PostComment,
  PostReactionsPage,
  ReactionToggleResponse,
  RsvpToggleResponse,
} from './community.service';

const author: CommunityPostAuthor = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  full_name: 'Mario Rossi',
  handle: 'mariorossi',
  avatar_url: null,
  belt: 'blue',
};

const basePost = (overrides: Partial<CommunityPost> = {}): CommunityPost => ({
  id: 1,
  type: 'owner_announcement',
  visibility: 'academy',
  payload: {},
  created_at: '2026-05-22T08:00:00Z',
  created_by: author,
  reactions_count: 0,
  reaction_counts: { clap: 0, pray: 0 },
  comments_count: 0,
  rsvps_count: 0,
  going_rsvps_count: 0,
  maybe_rsvps_count: 0,
  your_reaction: null,
  your_rsvp: null,
  ...overrides,
});

const emptyFeed = (): CommunityFeedPage => ({
  data: [],
  meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
});

describe('CommunityService', () => {
  let svc: CommunityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(CommunityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ────────────────────────────────────────────────────────────────
  // Feed
  // ────────────────────────────────────────────────────────────────

  describe('getFeed()', () => {
    it('GETs /community/feed?page=1 by default', () => {
      svc.getFeed().subscribe();
      const req = http.expectOne((r) => r.url === '/api/v1/community/feed');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      req.flush(emptyFeed());
    });

    it('forwards the page param when explicitly passed', () => {
      svc.getFeed(3).subscribe();
      const req = http.expectOne((r) => r.url === '/api/v1/community/feed');
      expect(req.request.params.get('page')).toBe('3');
      req.flush(emptyFeed());
    });

    it('emits the page envelope verbatim (no service-side projection)', () => {
      let result: CommunityFeedPage | undefined;
      svc.getFeed().subscribe((p) => (result = p));
      const page: CommunityFeedPage = {
        data: [basePost({ id: 7 })],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      };
      http.expectOne((r) => r.url === '/api/v1/community/feed').flush(page);
      expect(result).toEqual(page);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Posts
  // ────────────────────────────────────────────────────────────────

  describe('deletePost()', () => {
    it('DELETEs /community/posts/<id>', () => {
      svc.deletePost(42).subscribe();
      const req = http.expectOne('/api/v1/community/posts/42');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Reactions
  // ────────────────────────────────────────────────────────────────

  describe('toggleReaction()', () => {
    it('POSTs the emoji to /posts/<id>/reactions and emits the resulting state', () => {
      let result: ReactionToggleResponse | undefined;
      svc.toggleReaction(7, 'clap').subscribe((r) => (result = r));

      const req = http.expectOne('/api/v1/community/posts/7/reactions');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ emoji: 'clap' });

      const response: ReactionToggleResponse = {
        your_reaction: 'clap',
        counts: { clap: 5, pray: 2 },
      };
      req.flush(response);
      expect(result).toEqual(response);
    });

    it('handles toggle-off (server returns your_reaction:null)', () => {
      let result: ReactionToggleResponse | undefined;
      svc.toggleReaction(7, 'pray').subscribe((r) => (result = r));
      http
        .expectOne('/api/v1/community/posts/7/reactions')
        .flush({ your_reaction: null, counts: { clap: 5, pray: 1 } });
      expect(result?.your_reaction).toBeNull();
    });
  });

  describe('listReactions()', () => {
    it('GETs /posts/<id>/reactions with page param', () => {
      svc.listReactions(7, 2).subscribe();
      const req = http.expectOne((r) => r.url === '/api/v1/community/posts/7/reactions');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('2');
      req.flush({ data: [], meta: { current_page: 2, per_page: 20, total: 0, last_page: 2 } });
    });

    it('defaults to page=1 when omitted', () => {
      svc.listReactions(7).subscribe();
      const req = http.expectOne((r) => r.url === '/api/v1/community/posts/7/reactions');
      expect(req.request.params.get('page')).toBe('1');
      req.flush({ data: [], meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 } });
    });

    it('emits the page envelope verbatim', () => {
      let result: PostReactionsPage | undefined;
      svc.listReactions(7).subscribe((p) => (result = p));
      const page: PostReactionsPage = {
        data: [{ id: 1, emoji: 'clap', created_at: '2026-05-22T08:00:00Z', user: author }],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      };
      http.expectOne((r) => r.url === '/api/v1/community/posts/7/reactions').flush(page);
      expect(result).toEqual(page);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Comments
  // ────────────────────────────────────────────────────────────────

  describe('listComments()', () => {
    it('GETs /posts/<id>/comments with page param', () => {
      svc.listComments(7, 3).subscribe();
      const req = http.expectOne((r) => r.url === '/api/v1/community/posts/7/comments');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('3');
      req.flush({ data: [], meta: { current_page: 3, per_page: 50, total: 0, last_page: 3 } });
    });

    it('defaults to page=1', () => {
      svc.listComments(7).subscribe();
      const req = http.expectOne((r) => r.url === '/api/v1/community/posts/7/comments');
      expect(req.request.params.get('page')).toBe('1');
      req.flush({ data: [], meta: { current_page: 1, per_page: 50, total: 0, last_page: 1 } });
    });
  });

  describe('createComment()', () => {
    it('POSTs the trimmed body to /posts/<id>/comments and unwraps data', () => {
      let result: PostComment | undefined;
      svc.createComment(7, '  Hello world  ').subscribe((c) => (result = c));

      const req = http.expectOne('/api/v1/community/posts/7/comments');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ body: 'Hello world' });

      const comment: PostComment = {
        id: 99,
        post_id: 7,
        body: 'Hello world',
        created_at: '2026-05-22T08:00:00Z',
        created_by: author,
      };
      req.flush({ data: comment });
      expect(result).toEqual(comment);
    });

    it('trims even when the body is all whitespace (the server will reject anyway)', () => {
      // Empty error handler — the 422 propagates and we don't want
      // an unhandled HttpErrorResponse to surface as an uncaught
      // exception in vitest. The interesting assertion is the
      // OUTBOUND body shape, not what the server does with it.
      svc.createComment(7, '   ').subscribe({ next: () => {}, error: () => {} });
      const req = http.expectOne('/api/v1/community/posts/7/comments');
      expect(req.request.body).toEqual({ body: '' });
      req.flush(
        { errors: { body: ['Required.'] } },
        { status: 422, statusText: 'Unprocessable Content' },
      );
    });
  });

  describe('deleteComment()', () => {
    it('DELETEs /community/comments/<id>', () => {
      svc.deleteComment(99).subscribe();
      const req = http.expectOne('/api/v1/community/comments/99');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // RSVP
  // ────────────────────────────────────────────────────────────────

  describe('toggleRsvp()', () => {
    it('POSTs the response to /posts/<id>/rsvp and emits the resulting state', () => {
      let result: RsvpToggleResponse | undefined;
      svc.toggleRsvp(7, 'going').subscribe((r) => (result = r));

      const req = http.expectOne('/api/v1/community/posts/7/rsvp');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ response: 'going' });

      const response: RsvpToggleResponse = {
        your_rsvp: 'going',
        counts: { going: 3, maybe: 1 },
      };
      req.flush(response);
      expect(result).toEqual(response);
    });

    it('handles toggle-off (server returns your_rsvp:null)', () => {
      let result: RsvpToggleResponse | undefined;
      svc.toggleRsvp(7, 'maybe').subscribe((r) => (result = r));
      http
        .expectOne('/api/v1/community/posts/7/rsvp')
        .flush({ your_rsvp: null, counts: { going: 3, maybe: 0 } });
      expect(result?.your_rsvp).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // createEvent — the only method with non-trivial normalisation
  // ────────────────────────────────────────────────────────────────

  describe('createEvent()', () => {
    const baseEvent = (overrides: Partial<CreateEventPayload> = {}): CreateEventPayload => ({
      title: 'Open mat',
      starts_at: '2026-06-01T18:00:00Z',
      ...overrides,
    });

    it('POSTs to /community/events and unwraps the created post', () => {
      let result: CommunityPost | undefined;
      svc.createEvent(baseEvent()).subscribe((p) => (result = p));
      const created = basePost({ id: 99, type: 'event' });
      http.expectOne('/api/v1/community/events').flush({ data: created });
      expect(result).toEqual(created);
    });

    it('trims the title before sending', () => {
      svc.createEvent(baseEvent({ title: '  Open mat  ' })).subscribe();
      const req = http.expectOne('/api/v1/community/events');
      expect(req.request.body.title).toBe('Open mat');
      req.flush({ data: basePost() });
    });

    it('preserves starts_at verbatim (already normalised upstream)', () => {
      svc.createEvent(baseEvent({ starts_at: '2026-06-01T18:00:00Z' })).subscribe();
      const req = http.expectOne('/api/v1/community/events');
      expect(req.request.body.starts_at).toBe('2026-06-01T18:00:00Z');
      req.flush({ data: basePost() });
    });

    it('collapses whitespace-only description to null', () => {
      svc.createEvent(baseEvent({ description: '   ' })).subscribe();
      const req = http.expectOne('/api/v1/community/events');
      expect(req.request.body.description).toBeNull();
      req.flush({ data: basePost() });
    });

    it('trims and keeps a populated description', () => {
      svc.createEvent(baseEvent({ description: '  Bring your gi  ' })).subscribe();
      const req = http.expectOne('/api/v1/community/events');
      expect(req.request.body.description).toBe('Bring your gi');
      req.flush({ data: basePost() });
    });

    it('collapses an undefined description to null', () => {
      svc.createEvent(baseEvent()).subscribe();
      const req = http.expectOne('/api/v1/community/events');
      expect(req.request.body.description).toBeNull();
      req.flush({ data: basePost() });
    });

    it('collapses whitespace-only location_text to null', () => {
      svc.createEvent(baseEvent({ location_text: '   ' })).subscribe();
      const req = http.expectOne('/api/v1/community/events');
      expect(req.request.body.location_text).toBeNull();
      req.flush({ data: basePost() });
    });

    it('coalesces missing lat/lon/max_attendees to null (not undefined)', () => {
      // Server contract wants `null` for missing optionals — the SPA
      // composer must not leak `undefined` over the wire (some servers
      // parse `undefined` field literally instead of treating it as
      // absent).
      svc.createEvent(baseEvent()).subscribe();
      const req = http.expectOne('/api/v1/community/events');
      expect(req.request.body.location_lat).toBeNull();
      expect(req.request.body.location_lon).toBeNull();
      expect(req.request.body.max_attendees).toBeNull();
      req.flush({ data: basePost() });
    });

    it('forwards populated lat/lon/max_attendees verbatim', () => {
      svc
        .createEvent(baseEvent({ location_lat: 45.46, location_lon: 9.18, max_attendees: 20 }))
        .subscribe();
      const req = http.expectOne('/api/v1/community/events');
      expect(req.request.body.location_lat).toBe(45.46);
      expect(req.request.body.location_lon).toBe(9.18);
      expect(req.request.body.max_attendees).toBe(20);
      req.flush({ data: basePost() });
    });

    it('preserves an explicit null on lat/lon/max_attendees', () => {
      svc
        .createEvent(baseEvent({ location_lat: null, location_lon: null, max_attendees: null }))
        .subscribe();
      const req = http.expectOne('/api/v1/community/events');
      expect(req.request.body.location_lat).toBeNull();
      expect(req.request.body.location_lon).toBeNull();
      expect(req.request.body.max_attendees).toBeNull();
      req.flush({ data: basePost() });
    });
  });
});
