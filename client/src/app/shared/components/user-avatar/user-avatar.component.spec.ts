import { TestBed } from '@angular/core/testing';
import { UserAvatarComponent } from './user-avatar.component';

function render(props: { name?: string | null; url?: string | null; alt?: string | null } = {}) {
  TestBed.configureTestingModule({
    imports: [UserAvatarComponent],
  });
  const fixture = TestBed.createComponent(UserAvatarComponent);
  fixture.componentRef.setInput('name', props.name ?? null);
  fixture.componentRef.setInput('url', props.url ?? null);
  if (props.alt !== undefined) fixture.componentRef.setInput('alt', props.alt);
  fixture.detectChanges();
  return fixture;
}

describe('UserAvatarComponent (#411)', () => {
  it('renders the image when a url is provided', () => {
    const fixture = render({ url: '/storage/users/avatars/1.jpg', name: 'Mario Rossi' });
    const img = fixture.nativeElement.querySelector('[data-cy="user-avatar-image"]');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/storage/users/avatars/1.jpg');
    expect(fixture.nativeElement.querySelector('[data-cy="user-avatar-initials"]')).toBeNull();
  });

  it('falls back to initials when the url is null', () => {
    const fixture = render({ url: null, name: 'Mario Rossi' });
    const initials = fixture.nativeElement.querySelector('[data-cy="user-avatar-initials"]');
    expect(initials).not.toBeNull();
    expect(initials.textContent.trim()).toBe('MR');
  });

  it('renders a single initial when only one token is provided', () => {
    const fixture = render({ url: null, name: 'Cher' });
    const initials = fixture.nativeElement.querySelector('[data-cy="user-avatar-initials"]');
    expect(initials.textContent.trim()).toBe('C');
  });

  it('renders a "?" fallback for an empty name', () => {
    const fixture = render({ url: null, name: '' });
    const initials = fixture.nativeElement.querySelector('[data-cy="user-avatar-initials"]');
    expect(initials.textContent.trim()).toBe('?');
  });

  it('renders a "?" fallback for a null name', () => {
    const fixture = render({ url: null, name: null });
    const initials = fixture.nativeElement.querySelector('[data-cy="user-avatar-initials"]');
    expect(initials.textContent.trim()).toBe('?');
  });

  it('marks the image aria-hidden when no alt is provided (decorative context)', () => {
    const fixture = render({ url: '/storage/x.jpg', name: 'X' });
    const img = fixture.nativeElement.querySelector('[data-cy="user-avatar-image"]');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('honours an explicit alt label and drops aria-hidden', () => {
    const fixture = render({ url: '/storage/x.jpg', name: 'X', alt: 'Mario Rossi avatar' });
    const img = fixture.nativeElement.querySelector('[data-cy="user-avatar-image"]');
    expect(img.getAttribute('alt')).toBe('Mario Rossi avatar');
    expect(img.getAttribute('aria-hidden')).toBeNull();
  });
});
