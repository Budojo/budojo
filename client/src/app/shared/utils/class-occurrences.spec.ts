import { addDays, admitsTopic, localIso, occurrencesOf } from './class-occurrences';

describe('class occurrences (#1859)', () => {
  // weekday follows Carbon's dayOfWeek: 0 = Sunday, 1 = Monday.
  const monday = { weekday: 1 };
  const sunday = { weekday: 0 };

  it('lists every Monday between two dates, both ends included', () => {
    expect(occurrencesOf(monday, '2026-09-21', '2026-10-05')).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
  });

  it('crosses a month and a year boundary', () => {
    expect(occurrencesOf(monday, '2026-12-25', '2027-01-12')).toEqual([
      '2026-12-28',
      '2027-01-04',
      '2027-01-11',
    ]);
  });

  it('finds a Sunday class, the day the week wraps', () => {
    expect(occurrencesOf(sunday, '2026-09-21', '2026-09-27')).toEqual(['2026-09-27']);
  });

  it('answers nothing for a window the class never meets, or one that runs backwards', () => {
    expect(occurrencesOf(monday, '2026-09-22', '2026-09-27')).toEqual([]);
    expect(occurrencesOf(monday, '2026-10-05', '2026-09-21')).toEqual([]);
  });

  it('adds days across a month boundary without touching the clock', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
    expect(addDays('2026-10-05', -7)).toBe('2026-09-28');
    // The day the clocks go back in Europe is still one day.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('names a date by its local calendar day', () => {
    expect(localIso(new Date(2026, 8, 24, 23, 30))).toBe('2026-09-24');
  });

  it('admits into a class what TrainingMode::admittedTopicModes admits', () => {
    // A mode admits itself and `both`.
    expect(admitsTopic('gi', 'gi')).toBe(true);
    expect(admitsTopic('gi', 'both')).toBe(true);
    expect(admitsTopic('gi', 'nogi')).toBe(false);
    expect(admitsTopic('kata', 'kumite')).toBe(false);
    // `both` and `other` narrow nothing.
    expect(admitsTopic('both', 'nogi')).toBe(true);
    expect(admitsTopic('other', 'kata')).toBe(true);
  });
});
