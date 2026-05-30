import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { environment } from '../../../../environments/environment';
import type { CommunityPost } from '../../../core/services/community.service';
import { VideoComposerComponent } from './video-composer.component';

@Component({
  standalone: true,
  imports: [VideoComposerComponent],
  template: `<app-video-composer [(visible)]="visible" (created)="lastCreated.set($event)" />`,
})
class HostComponent {
  visible = true;
  readonly lastCreated = signal<CommunityPost | null>(null);
}

const POST: CommunityPost = {
  id: 7,
  type: 'shared_video',
  visibility: 'academy',
  payload: {
    provider: 'youtube',
    url: 'https://www.youtube.com/watch?v=abc',
    video_id: 'abc',
    thumbnail_url: '/storage/community/video-thumbnails/x.jpg',
    title: 'Armbar',
    author_name: 'BJJ',
    caption: 'nice',
  },
  created_at: '2026-05-30T10:00:00Z',
  created_by: {
    id: 1,
    first_name: 'Marco',
    last_name: 'Rossi',
    full_name: 'Marco Rossi',
    handle: 'marco',
    avatar_url: null,
    belt: 'blue',
  },
  reactions_count: 0,
  reaction_counts: { clap: 0, pray: 0 },
  comments_count: 0,
  rsvps_count: 0,
  going_rsvps_count: 0,
  maybe_rsvps_count: 0,
  your_reaction: null,
  your_rsvp: null,
};

const URL = `${environment.apiBase}/api/v1/community/videos`;

describe('VideoComposerComponent (#1155)', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VideoComposerComponent, HostComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        MessageService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function mount() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const composer = fixture.debugElement.query((el) => el.name === 'app-video-composer')
      .componentInstance as VideoComposerComponent;
    return { fixture, composer };
  }

  it('starts invalid — the url is required', () => {
    const { composer } = mount();
    expect(composer['form'].invalid).toBe(true);
    expect(composer['form'].controls.url.hasError('required')).toBe(true);
  });

  it('rejects an obvious non-URL value client-side', () => {
    const { composer } = mount();
    composer['form'].controls.url.setValue('not a url');
    expect(composer['form'].controls.url.hasError('url')).toBe(true);
  });

  it('POSTs the trimmed url + caption and emits `created` on success', () => {
    const { fixture, composer } = mount();
    composer['form'].controls.url.setValue('  https://www.youtube.com/watch?v=abc  ');
    composer['form'].controls.caption.setValue('  nice  ');
    composer['onSubmit']();

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      url: 'https://www.youtube.com/watch?v=abc',
      caption: 'nice',
    });

    req.flush({ data: POST });
    expect(fixture.componentInstance.lastCreated()?.id).toBe(7);
    expect(composer['submitting']()).toBe(false);
  });

  it('keeps the dialog open + clears submitting on a 422 (unresolvable link)', () => {
    const { fixture, composer } = mount();
    // A syntactically valid URL the client accepts but the SERVER rejects
    // as a non-allowlisted provider.
    composer['form'].controls.url.setValue('https://vimeo.com/12345');
    composer['onSubmit']();

    httpMock
      .expectOne(URL)
      .flush(
        { message: 'We could not read that video link.' },
        { status: 422, statusText: 'Unprocessable' },
      );

    expect(fixture.componentInstance.lastCreated()).toBeNull();
    expect(composer['submitting']()).toBe(false);
  });
});
