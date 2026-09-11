import { AcademyClass } from '../../../core/services/academy-class.service';
import { pickDefaultClass } from './class-pick';

function klass(overrides: Partial<AcademyClass> & { id: number }): AcademyClass {
  return {
    name: `Class ${overrides.id}`,
    weekday: 1,
    starts_at: null,
    duration_minutes: null,
    kind: 'gi',
    ...overrides,
  };
}

// A Monday. `at('18:30')` is that Monday at half past six.
const MONDAY = new Date(2026, 8, 14);
function at(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 8, 14, h, m);
}

const KIDS = klass({ id: 1, name: 'Kids', starts_at: '17:00', duration_minutes: 60 });
const FUNDAMENTALS = klass({
  id: 2,
  name: 'Fundamentals',
  starts_at: '19:00',
  duration_minutes: 60,
});
const OPEN_MAT = klass({ id: 3, name: 'Open mat', starts_at: '20:30', duration_minutes: 90 });
const DAY = [KIDS, FUNDAMENTALS, OPEN_MAT];

describe('pickDefaultClass (#1562)', () => {
  it('has nothing to pick on a day with no classes', () => {
    expect(pickDefaultClass([], MONDAY, at('18:30'))).toBeNull();
  });

  it('opens on the class that is running right now', () => {
    // 19:45 — fundamentals started at 19:00 and runs until 20:00. The open
    // mat at 20:30 is exactly as far from the clock, and loses anyway.
    expect(pickDefaultClass(DAY, MONDAY, at('19:45'))).toBe(FUNDAMENTALS);
  });

  it('otherwise opens on the class starting nearest to the clock', () => {
    // 18:30 — kids ended at 18:00, fundamentals is half an hour away.
    expect(pickDefaultClass(DAY, MONDAY, at('18:30'))).toBe(FUNDAMENTALS);
    // 16:00 — well before anything; kids is the nearest start.
    expect(pickDefaultClass(DAY, MONDAY, at('16:00'))).toBe(KIDS);
    // 22:30 — everything is over; the open mat started most recently.
    expect(pickDefaultClass(DAY, MONDAY, at('22:30'))).toBe(OPEN_MAT);
  });

  it('assumes an hour for a class with a start but no duration', () => {
    const untimedLength = klass({ id: 9, starts_at: '19:00', duration_minutes: null });
    expect(pickDefaultClass([untimedLength, OPEN_MAT], MONDAY, at('19:50'))).toBe(untimedLength);
  });

  it('breaks a tie toward the earlier class', () => {
    // 18:00 — kids started an hour ago and is over; fundamentals is an
    // hour away. Same distance, the earlier one wins.
    expect(pickDefaultClass([KIDS, FUNDAMENTALS], MONDAY, at('18:00'))).toBe(KIDS);
  });

  it('opens a past day on its first class — the clock says nothing about last Monday', () => {
    const wednesdayEvening = new Date(2026, 8, 16, 21, 0);
    expect(pickDefaultClass(DAY, MONDAY, wednesdayEvening)).toBe(KIDS);
  });

  it('falls back to the first class when none of them has a time', () => {
    const a = klass({ id: 1 });
    const b = klass({ id: 2 });
    expect(pickDefaultClass([a, b], MONDAY, at('18:30'))).toBe(a);
  });

  it('never picks an untimed class over a timed one on the day itself', () => {
    const untimed = klass({ id: 7, starts_at: null });
    expect(pickDefaultClass([FUNDAMENTALS, untimed], MONDAY, at('12:00'))).toBe(FUNDAMENTALS);
  });
});
