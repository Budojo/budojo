import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { VideoFacadeComponent, VideoProvider } from './video-facade.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

@Component({
  standalone: true,
  imports: [VideoFacadeComponent],
  template: `<app-video-facade
    [provider]="provider"
    [videoId]="videoId"
    [thumbnailUrl]="thumbnailUrl"
    [title]="title"
    [authorName]="authorName"
    [caption]="caption"
    [url]="url"
  />`,
})
class HostComponent {
  provider: VideoProvider = 'youtube';
  videoId = 'abc123';
  thumbnailUrl: string | null = '/storage/community/video-thumbnails/x.jpg';
  title: string | null = 'Armbar from guard';
  authorName: string | null = 'BJJ Channel';
  caption: string | null = 'Nice grip detail';
  url = 'https://www.youtube.com/watch?v=abc123';
}

function setup(opts: Partial<HostComponent> = {}) {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    // MentionTextComponent (caption) pulls in AuthService (→ HttpClient) and
    // renders @handle links via routerLink (→ Router).
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideI18nTesting(),
    ],
  });
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, opts);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const play = () => {
    (el.querySelector('[data-cy="video-facade-cover"]') as HTMLElement).click();
    fixture.detectChanges();
  };
  return { fixture, el, play };
}

describe('VideoFacadeComponent (#1155)', () => {
  it('renders the cached cover and NO third-party iframe by default', () => {
    const { el } = setup();
    const img = el.querySelector('.video-facade__img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('community/video-thumbnails/');
    // Privacy: nothing third-party is mounted until the user taps play.
    expect(el.querySelector('[data-cy="video-facade-embed"]')).toBeNull();
  });

  it('renders a cover-less branded card when there is no thumbnail', () => {
    const { el } = setup({ thumbnailUrl: null });
    expect(el.querySelector('.video-facade__img')).toBeNull();
    expect(el.querySelector('.video-facade__placeholder')).not.toBeNull();
  });

  it('mounts the sandboxed YouTube-nocookie embed only after tapping play', () => {
    const { el, play } = setup();
    play();
    const iframe = el.querySelector('[data-cy="video-facade-embed"]') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('src')).toContain('youtube-nocookie.com/embed/abc123');
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    // The cover (and its play button) are gone once the embed is live.
    expect(el.querySelector('[data-cy="video-facade-cover"]')).toBeNull();
  });

  it('builds the TikTok embed url on play', () => {
    const { el, play } = setup({
      provider: 'tiktok',
      videoId: '7123456789',
      url: 'https://www.tiktok.com/@c/video/7123456789',
    });
    play();
    expect(
      (el.querySelector('[data-cy="video-facade-embed"]') as HTMLIFrameElement).getAttribute('src'),
    ).toContain('tiktok.com/embed/v2/7123456789');
  });

  it('builds the Instagram embed url on play', () => {
    const { el, play } = setup({
      provider: 'instagram',
      videoId: 'C8abc_-',
      url: 'https://www.instagram.com/reel/C8abc_-/',
    });
    play();
    expect(
      (el.querySelector('[data-cy="video-facade-embed"]') as HTMLIFrameElement).getAttribute('src'),
    ).toContain('instagram.com/reel/C8abc_-/embed');
  });

  it('always offers an "open on provider" link to the original', () => {
    const { el } = setup();
    const open = el.querySelector('[data-cy="video-facade-open"]') as HTMLAnchorElement;
    expect(open.getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc123');
    expect(open.getAttribute('rel')).toContain('noopener');
  });

  it('keeps the embed referrer to the origin — never the deep-link path', () => {
    const { el, play } = setup();
    play();
    const iframe = el.querySelector('[data-cy="video-facade-embed"]') as HTMLIFrameElement;
    expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
  });

  it('renders @handle mentions in the caption as profile links', () => {
    const { el } = setup({ caption: 'Watch @coachmarco break this down' });
    const link = el.querySelector(
      '.video-facade__caption [data-cy="mention-link"]',
    ) as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('coachmarco');
  });
});
