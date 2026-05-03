import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LanguageService } from '../../../core/services/language.service';
import { AgeBadgeComponent } from './age-badge.component';

function createWith(dateOfBirth: string | null | undefined) {
  TestBed.configureTestingModule({
    imports: [AgeBadgeComponent],
    providers: [...provideI18nTesting()],
  });
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

  it('reformats the tooltip in Italian after the language toggles to it', () => {
    // Regression trip-wire for the locale-aware DOB formatter (#280
    // PR-D / Copilot review on PR #365). Without the LanguageService
    // signal dependency on the dobLabel computed, this assertion
    // would still read "15 May 1990" after the IT switch.
    const fixture = createWith('1990-05-15');
    expect(fixture.componentInstance['dobLabel']()).toBe('15 May 1990');

    TestBed.inject(LanguageService).setLanguage('it');
    fixture.detectChanges();

    expect(fixture.componentInstance['dobLabel']()).toBe('15 maggio 1990');
  });

  it('does not render the chip when DOB is missing', () => {
    const fixture = createWith(null);
    expect(fixture.nativeElement.querySelector('p-tag')).toBeNull();
  });
});
