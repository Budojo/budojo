import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { environment } from '../../../../environments/environment';
import { ReactionsListSheetComponent } from './reactions-list-sheet.component';

// Drive the component via ComponentRef.setInput() — no host
// wrapper. A host's [visible] binding wrapped around PrimeNG's
// p-dialog amplifies NG0100 (two-way-binding amplification in dev
// CD verification pass).

describe('ReactionsListSheetComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactionsListSheetComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function reactionRow(id: number, emoji: 'clap' | 'pray', name: string) {
    return {
      id,
      emoji,
      created_at: '2026-05-12T20:00:00Z',
      user: {
        id: id * 10,
        first_name: name.split(' ')[0],
        last_name: name.split(' ')[1] ?? '',
        full_name: name,
        handle: null,
        avatar_url: null,
        belt: null,
      },
    };
  }

  function mount(): {
    fixture: ComponentFixture<ReactionsListSheetComponent>;
    sheet: ReactionsListSheetComponent;
  } {
    const fixture = TestBed.createComponent(ReactionsListSheetComponent);
    fixture.componentRef.setInput('visible', false);
    fixture.componentRef.setInput('postId', null);
    fixture.componentRef.setInput('clapCount', 0);
    fixture.componentRef.setInput('prayCount', 0);
    fixture.detectChanges();
    return { fixture, sheet: fixture.componentInstance };
  }

  /** Helper — open the sheet for a postId and invoke reload() imperatively. */
  function open(
    fixture: ComponentFixture<ReactionsListSheetComponent>,
    sheet: ReactionsListSheetComponent,
    postId: number,
  ) {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('postId', postId);
    fixture.detectChanges();
    sheet.reload(postId);
    fixture.detectChanges();
  }

  describe('open behaviour', () => {
    it('fetches reactions when visible flips true', () => {
      const { fixture, sheet } = mount();
      open(fixture, sheet, 42);

      const req = httpMock.expectOne(
        `${environment.apiBase}/api/v1/community/posts/42/reactions?page=1`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        data: [reactionRow(1, 'clap', 'Mario Rossi')],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      });
    });

    it('resets the activeTab to "all" on each fresh open (Copilot review on #655)', () => {
      const { fixture, sheet } = mount();
      open(fixture, sheet, 42);
      httpMock
        .expectOne(`${environment.apiBase}/api/v1/community/posts/42/reactions?page=1`)
        .flush({
          data: [],
          meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
        });

      // User picks the clap tab.
      sheet['setTab']('clap');
      expect(sheet['activeTab']()).toBe('clap');

      // Close + re-open for a different post.
      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();
      open(fixture, sheet, 99);

      httpMock
        .expectOne(`${environment.apiBase}/api/v1/community/posts/99/reactions?page=1`)
        .flush({
          data: [],
          meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
        });

      expect(sheet['activeTab']()).toBe('all');
    });
  });

  describe('stale request guard (Copilot review on #655)', () => {
    it('drops a slow response that arrives after a newer open started', () => {
      const { fixture, sheet } = mount();
      open(fixture, sheet, 42);
      const reqA = httpMock.expectOne(
        `${environment.apiBase}/api/v1/community/posts/42/reactions?page=1`,
      );

      // Open a different post BEFORE flushing the first response.
      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();
      open(fixture, sheet, 99);
      const reqB = httpMock.expectOne(
        `${environment.apiBase}/api/v1/community/posts/99/reactions?page=1`,
      );

      // Flush A AFTER B was triggered. The component must ignore A.
      reqA.flush({
        data: [reactionRow(1, 'clap', 'Mario Rossi')],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      });
      reqB.flush({
        data: [reactionRow(2, 'pray', 'Francesco P.')],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      });

      const reactions = sheet['reactions']();
      expect(reactions).toHaveLength(1);
      expect(reactions[0]?.user.full_name).toBe('Francesco P.');
    });
  });

  describe('pagination', () => {
    it('appends rows on loadMore + advances currentPage', () => {
      const { fixture, sheet } = mount();
      open(fixture, sheet, 42);
      httpMock
        .expectOne(`${environment.apiBase}/api/v1/community/posts/42/reactions?page=1`)
        .flush({
          data: [reactionRow(1, 'clap', 'A A')],
          meta: { current_page: 1, per_page: 20, total: 25, last_page: 2 },
        });

      expect(sheet['hasMore']()).toBe(true);

      sheet['loadMore']();
      httpMock
        .expectOne(`${environment.apiBase}/api/v1/community/posts/42/reactions?page=2`)
        .flush({
          data: [reactionRow(2, 'pray', 'B B')],
          meta: { current_page: 2, per_page: 20, total: 25, last_page: 2 },
        });

      expect(sheet['reactions']()).toHaveLength(2);
      expect(sheet['currentPage']()).toBe(2);
      expect(sheet['hasMore']()).toBe(false);
    });
  });
});
