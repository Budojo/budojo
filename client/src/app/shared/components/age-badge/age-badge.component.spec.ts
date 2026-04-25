import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgeBadgeComponent } from './age-badge.component';

function createWith(dateOfBirth: string | null | undefined) {
  TestBed.configureTestingModule({ imports: [AgeBadgeComponent] });
  const fixture = TestBed.createComponent(AgeBadgeComponent);
  fixture.componentRef.setInput('dateOfBirth', dateOfBirth);
  fixture.detectChanges();
  return fixture;
}

describe('AgeBadgeComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 25)); // April 25, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes whole-year age when birthday has already passed this year', () => {
    const fixture = createWith('1990-01-15');
    expect(fixture.componentInstance['years']()).toBe(36);
  });

  it('subtracts a year when the birthday has not happened yet this calendar year', () => {
    // April 25, 2026; DOB May 1, 1990 → still 35
    const fixture = createWith('1990-05-01');
    expect(fixture.componentInstance['years']()).toBe(35);
  });

  it('handles same-day-as-today birthday as already passed (turns N today)', () => {
    const fixture = createWith('1990-04-25');
    expect(fixture.componentInstance['years']()).toBe(36);
  });

  it('returns null when DOB is missing', () => {
    const fixture = createWith(null);
    expect(fixture.componentInstance['years']()).toBeNull();
  });

  it('returns null when DOB is malformed', () => {
    const fixture = createWith('not-a-date');
    expect(fixture.componentInstance['years']()).toBeNull();
  });

  it('returns null when DOB is in the future (data error)', () => {
    const fixture = createWith('2030-01-01');
    expect(fixture.componentInstance['years']()).toBeNull();
  });

  it('formats the tooltip in en-GB long form', () => {
    const fixture = createWith('1990-05-15');
    expect(fixture.componentInstance['dobLabel']()).toBe('15 May 1990');
  });

  it('does not render the chip when DOB is missing', () => {
    const fixture = createWith(null);
    expect(fixture.nativeElement.querySelector('p-tag')).toBeNull();
  });
});
