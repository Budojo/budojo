import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { CommentsThreadComponent } from './comments-thread.component';
import { AuthService } from '../../../core/services/auth.service';
import type { User } from '../../../core/services/auth.service';
import type { PostComment } from '../../../core/services/community.service';
import { environment } from '../../../../environments/environment';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

function authorComment(over: Partial<PostComment> = {}): PostComment {
  return {
    id: 1,
    post_id: 99,
    body: 'Nice work!',
    created_at: '2026-05-10T08:00:00Z',
    created_by: {
      id: 7,
      first_name: 'Mario',
      last_name: 'Rossi',
      full_name: 'Mario Rossi',
      handle: 'mariobjj',
      avatar_url: null,
      belt: 'blue',
    },
    ...over,
  };
}

function setup(opts: { currentUserId?: number | null } = {}) {
  const user = signal<User | null>(
    opts.currentUserId === undefined
      ? null
      : ({ id: opts.currentUserId } as unknown as User | null),
  );

  TestBed.configureTestingModule({
    imports: [CommentsThreadComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      MessageService,
      { provide: AuthService, useValue: { user } as unknown as AuthService },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(CommentsThreadComponent);
  fixture.componentRef.setInput('postId', 99);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http };
}

describe('CommentsThreadComponent (#604, M9 PR-D2 client)', () => {
  it('renders the empty state when the API returns zero comments', () => {
    const { fixture, el, http } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/community/posts/99/comments?page=1`).flush({
      data: [],
      meta: { current_page: 1, per_page: 50, total: 0, last_page: 1 },
    });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="thread-empty"]')).not.toBeNull();
  });

  it('renders comments with the identity flair line', () => {
    const { fixture, el, http } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/community/posts/99/comments?page=1`).flush({
      data: [authorComment({ id: 1, body: 'Forza!' })],
      meta: { current_page: 1, per_page: 50, total: 1, last_page: 1 },
    });
    fixture.detectChanges();

    const row = el.querySelector('[data-cy="comment-1"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('Forza!');
    expect(row?.textContent).toContain('Mario Rossi');
    expect(row?.textContent).toContain('mariobjj');
  });

  it('shows the trash button only on the current users own comment', () => {
    const { fixture, el, http } = setup({ currentUserId: 7 });
    http.expectOne(`${environment.apiBase}/api/v1/community/posts/99/comments?page=1`).flush({
      data: [
        authorComment({ id: 1, created_by: { ...authorComment().created_by, id: 7 } }),
        authorComment({ id: 2, created_by: { ...authorComment().created_by, id: 8 } }),
      ],
      meta: { current_page: 1, per_page: 50, total: 2, last_page: 1 },
    });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="comment-delete-1"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="comment-delete-2"]')).toBeNull();
  });
});
