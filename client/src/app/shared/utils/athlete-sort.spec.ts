import { describe, expect, it } from 'vitest';
import {
  beltSortTooltipKey,
  nameSortAria,
  nameSortSignifier,
  nameSortTooltipKey,
  nextBeltSort,
  nextNameSort,
  type SortState,
} from './athlete-sort';

const state = (field: SortState['field'], order: SortState['order'] = 'desc'): SortState => ({
  field,
  order,
});

describe('nextNameSort', () => {
  it('walks first asc → first desc → last asc → last desc → first asc', () => {
    let s = nextNameSort(state(null));
    expect(s).toEqual(state('first_name', 'asc'));

    s = nextNameSort(s);
    expect(s).toEqual(state('first_name', 'desc'));

    s = nextNameSort(s);
    expect(s).toEqual(state('last_name', 'asc'));

    s = nextNameSort(s);
    expect(s).toEqual(state('last_name', 'desc'));

    // ...and round.
    s = nextNameSort(s);
    expect(s).toEqual(state('first_name', 'asc'));
  });

  it.each(['belt', 'attendance_month', 'attendance_total', 'created_at'] as const)(
    'restarts the cycle at first asc when arriving from %s',
    (field) => {
      expect(nextNameSort(state(field, 'asc'))).toEqual(state('first_name', 'asc'));
      expect(nextNameSort(state(field, 'desc'))).toEqual(state('first_name', 'asc'));
    },
  );
});

describe('nameSortSignifier', () => {
  it('says which name leads and in which direction', () => {
    expect(nameSortSignifier(state('first_name', 'asc'))).toBe('F↑');
    expect(nameSortSignifier(state('first_name', 'desc'))).toBe('F↓');
    expect(nameSortSignifier(state('last_name', 'asc'))).toBe('L↑');
    expect(nameSortSignifier(state('last_name', 'desc'))).toBe('L↓');
  });

  it('is null when a name is not what the list is sorted by', () => {
    expect(nameSortSignifier(state(null))).toBeNull();
    expect(nameSortSignifier(state('belt', 'desc'))).toBeNull();
    expect(nameSortSignifier(state('attendance_month', 'desc'))).toBeNull();
  });
});

describe('nameSortTooltipKey', () => {
  it('names the state the header is in', () => {
    expect(nameSortTooltipKey(state('first_name', 'asc'))).toBe('shared.sort.nameFirstAsc');
    expect(nameSortTooltipKey(state('first_name', 'desc'))).toBe('shared.sort.nameFirstDesc');
    expect(nameSortTooltipKey(state('last_name', 'asc'))).toBe('shared.sort.nameLastAsc');
    expect(nameSortTooltipKey(state('last_name', 'desc'))).toBe('shared.sort.nameLastDesc');
  });

  it('falls back to what the next press will do when the sort is elsewhere', () => {
    expect(nameSortTooltipKey(state(null))).toBe('shared.sort.nameInitial');
    expect(nameSortTooltipKey(state('belt', 'desc'))).toBe('shared.sort.nameInitial');
  });
});

describe('nameSortAria', () => {
  it('reports the direction only while a name drives the sort', () => {
    expect(nameSortAria(state('first_name', 'asc'))).toBe('ascending');
    expect(nameSortAria(state('last_name', 'desc'))).toBe('descending');
    expect(nameSortAria(state('belt', 'asc'))).toBe('none');
    expect(nameSortAria(state(null))).toBe('none');
  });
});

describe('nextBeltSort', () => {
  it('flips direction while belt is already the sort', () => {
    expect(nextBeltSort(state('belt', 'desc'))).toEqual(state('belt', 'asc'));
    expect(nextBeltSort(state('belt', 'asc'))).toEqual(state('belt', 'desc'));
  });

  it('comes back at highest rank first from anywhere else', () => {
    expect(nextBeltSort(state(null))).toEqual(state('belt', 'desc'));
    expect(nextBeltSort(state('first_name', 'asc'))).toEqual(state('belt', 'desc'));
    expect(nextBeltSort(state('attendance_month', 'asc'))).toEqual(state('belt', 'desc'));
  });

  it('has no off state — two presses return where they started', () => {
    const start = state('belt', 'desc');
    expect(nextBeltSort(nextBeltSort(start))).toEqual(start);
  });
});

describe('beltSortTooltipKey', () => {
  it('names the state the control is in', () => {
    expect(beltSortTooltipKey(state('belt', 'asc'))).toBe('shared.sort.beltAsc');
    expect(beltSortTooltipKey(state('belt', 'desc'))).toBe('shared.sort.beltDesc');
  });

  it('falls back to what the next press will do when the sort is elsewhere', () => {
    expect(beltSortTooltipKey(state(null))).toBe('shared.sort.beltInitial');
    expect(beltSortTooltipKey(state('last_name', 'asc'))).toBe('shared.sort.beltInitial');
  });
});
