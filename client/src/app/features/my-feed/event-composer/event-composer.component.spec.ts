import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { environment } from '../../../../environments/environment';
import type { CommunityPost } from '../../../core/services/community.service';
import { EventComposerComponent } from './event-composer.component';

// Host component models the production parent: pass [visible] as a
// model binding + listen to the `created` output.
@Component({
  standalone: true,
  imports: [EventComposerComponent],
  template: ` <app-event-composer [(visible)]="visible" (created)="lastCreated.set($event)" /> `,
})
class HostComponent {
  visible = true;
  readonly lastCreated = signal<CommunityPost | null>(null);
}

const POST: CommunityPost = {
  id: 99,
  type: 'event',
  visibility: 'academy',
  payload: {
    title: 'Open mat',
    description: null,
    starts_at: '2026-06-13T10:00:00Z',
    location_text: null,
    location_address: null,
    location_lat: null,
    location_lon: null,
    max_attendees: null,
  },
  created_at: '2026-05-12T14:30:00Z',
  created_by: {
    id: 1,
    first_name: 'Mario',
    last_name: 'Rossi',
    full_name: 'Mario Rossi',
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
};

describe('EventComposerComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EventComposerComponent, HostComponent],
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
    const composer = fixture.debugElement.query((el) => el.name === 'app-event-composer')
      .componentInstance as EventComposerComponent;
    return { fixture, composer };
  }

  describe('form validation', () => {
    it('starts invalid — title + starts_at are required', () => {
      const { composer } = mount();
      expect(composer['form'].invalid).toBe(true);
      expect(composer['form'].controls.title.hasError('required')).toBe(true);
      expect(composer['form'].controls.starts_at.hasError('required')).toBe(true);
    });

    it('rejects a title longer than 120 chars', () => {
      const { composer } = mount();
      composer['form'].controls.title.setValue('x'.repeat(121));
      expect(composer['form'].controls.title.hasError('maxlength')).toBe(true);
    });

    it('rejects a description longer than 2000 chars', () => {
      const { composer } = mount();
      composer['form'].controls.description.setValue('x'.repeat(2001));
      expect(composer['form'].controls.description.hasError('maxlength')).toBe(true);
    });

    it('rejects max_attendees outside [1, 10000]', () => {
      const { composer } = mount();
      composer['form'].controls.max_attendees.setValue(0);
      expect(composer['form'].controls.max_attendees.hasError('min')).toBe(true);

      composer['form'].controls.max_attendees.setValue(10_001);
      expect(composer['form'].controls.max_attendees.hasError('max')).toBe(true);
    });

    it('passes validation with title + starts_at set', () => {
      const { composer } = mount();
      composer['form'].patchValue({
        title: 'Open mat',
        starts_at: new Date('2026-06-13T10:00:00Z'),
      });
      expect(composer['form'].valid).toBe(true);
    });
  });

  describe('submit', () => {
    function fillValid(composer: EventComposerComponent) {
      composer['form'].patchValue({
        title: '  Open mat — Saturday  ',
        starts_at: new Date('2026-06-13T10:00:00Z'),
        description: '  All belts welcome  ',
        location_text: '  Via Roma 10  ',
        max_attendees: 30,
      });
    }

    it('POSTs the trimmed payload to /community/events and emits `created` on success', () => {
      const { fixture, composer } = mount();
      fillValid(composer);

      composer['onSubmit']();

      const req = httpMock.expectOne(`${environment.apiBase}/api/v1/community/events`);
      expect(req.request.method).toBe('POST');
      // Whitespace trimmed for all three string fields.
      expect(req.request.body.title).toBe('Open mat — Saturday');
      expect(req.request.body.description).toBe('All belts welcome');
      expect(req.request.body.location_text).toBe('Via Roma 10');
      expect(req.request.body.max_attendees).toBe(30);

      req.flush({ data: POST });
      fixture.detectChanges();

      expect(fixture.componentInstance.lastCreated()).toEqual(POST);
      expect(fixture.componentInstance.visible).toBe(false);
    });

    it('sends null when description / location_text are blank-after-trim', () => {
      const { composer } = mount();
      composer['form'].patchValue({
        title: 'Bare event',
        starts_at: new Date('2026-06-13T10:00:00Z'),
        description: '   ',
        location_text: '',
      });

      composer['onSubmit']();

      const req = httpMock.expectOne(`${environment.apiBase}/api/v1/community/events`);
      expect(req.request.body.description).toBeNull();
      expect(req.request.body.location_text).toBeNull();
      req.flush({ data: POST });
    });

    it('toggles `submitting` while the request is in flight', () => {
      const { composer } = mount();
      composer['form'].patchValue({
        title: 'Open mat',
        starts_at: new Date('2026-06-13T10:00:00Z'),
      });

      composer['onSubmit']();
      expect(composer['submitting']()).toBe(true);

      const req = httpMock.expectOne(`${environment.apiBase}/api/v1/community/events`);
      req.flush({ data: POST });
      expect(composer['submitting']()).toBe(false);
    });

    it('keeps the dialog open + clears submitting + toasts on server error', () => {
      const messageService = TestBed.inject(MessageService);
      const addSpy = vi.spyOn(messageService, 'add');
      const { fixture, composer } = mount();
      composer['form'].patchValue({
        title: 'Open mat',
        starts_at: new Date('2026-06-13T10:00:00Z'),
      });

      composer['onSubmit']();
      const req = httpMock.expectOne(`${environment.apiBase}/api/v1/community/events`);
      req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(composer['submitting']()).toBe(false);
      // Dialog stays open so the user can retry without re-typing.
      expect(fixture.componentInstance.visible).toBe(true);
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    });

    it('does nothing when submit is fired with an invalid form', () => {
      const { composer } = mount();
      // Missing starts_at — form is invalid.
      composer['form'].patchValue({ title: 'Open mat' });

      composer['onSubmit']();
      httpMock.expectNone(`${environment.apiBase}/api/v1/community/events`);
    });
  });
});
