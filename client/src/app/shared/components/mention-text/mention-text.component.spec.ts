import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, beforeEach, it, expect } from 'vitest';
import { MentionTextComponent, splitIntoSegments } from './mention-text.component';

@Component({
  standalone: true,
  imports: [MentionTextComponent],
  template: `<app-mention-text [text]="value" />`,
})
class HostComponent {
  value = '';
}

describe('splitIntoSegments (#864 mention parser)', () => {
  it('returns an empty list when input is empty', () => {
    expect(splitIntoSegments('')).toEqual([]);
  });

  it('returns a single text segment when there is no mention', () => {
    expect(splitIntoSegments('great class today!')).toEqual([
      { kind: 'text', value: 'great class today!' },
    ]);
  });

  it('extracts a single mention at the start of the string', () => {
    expect(splitIntoSegments('@mariobjj nice promotion!')).toEqual([
      { kind: 'mention', handle: 'mariobjj' },
      { kind: 'text', value: ' nice promotion!' },
    ]);
  });

  it('extracts a mention preceded by whitespace', () => {
    expect(splitIntoSegments('congrats @mariobjj!')).toEqual([
      { kind: 'text', value: 'congrats ' },
      { kind: 'mention', handle: 'mariobjj' },
      { kind: 'text', value: '!' },
    ]);
  });

  it('extracts multiple mentions in the same body', () => {
    const out = splitIntoSegments('shoutout to @alice and @bob.42');
    expect(out).toEqual([
      { kind: 'text', value: 'shoutout to ' },
      { kind: 'mention', handle: 'alice' },
      { kind: 'text', value: ' and ' },
      { kind: 'mention', handle: 'bob.42' },
    ]);
  });

  it('does NOT treat an email-suffix @ as a mention', () => {
    expect(splitIntoSegments('write to mario@example.com')).toEqual([
      { kind: 'text', value: 'write to mario@example.com' },
    ]);
  });

  it('rejects malformed handles (too short, leading digit, uppercase-only)', () => {
    expect(splitIntoSegments('hi @ab')).toEqual([{ kind: 'text', value: 'hi @ab' }]);
    expect(splitIntoSegments('hi @4mario')).toEqual([{ kind: 'text', value: 'hi @4mario' }]);
  });

  it('lowercases the captured handle (case-insensitive matching, normalized output)', () => {
    expect(splitIntoSegments('hey @MarioBJJ')).toEqual([
      { kind: 'text', value: 'hey ' },
      { kind: 'mention', handle: 'mariobjj' },
    ]);
  });

  it('matches across multiple regex runs without leaking lastIndex state', () => {
    splitIntoSegments('first @runone please');
    // The HANDLE_PATTERN constant is module-scoped — without an explicit
    // lastIndex reset it would skip a leading mention on the second call.
    expect(splitIntoSegments('@runtwo and @runthree')).toEqual([
      { kind: 'mention', handle: 'runtwo' },
      { kind: 'text', value: ' and ' },
      { kind: 'mention', handle: 'runthree' },
    ]);
  });
});

describe('MentionTextComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideRouter([])],
    });
  });

  it('renders mentions as router links pointing at the public profile route', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.value = 'congrats @mariobjj!';
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      '[data-cy="mention-link"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.textContent?.trim()).toBe('@mariobjj');
    expect(link!.getAttribute('href')).toBe('/dashboard/u/mariobjj');
  });

  it('renders plain text when the body has no mention', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.value = 'no mention here';
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-cy="mention-link"]')).toBeNull();
    expect(root.textContent).toContain('no mention here');
  });
});
