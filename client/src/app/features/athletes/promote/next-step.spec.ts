import { LADDER_FIXTURES } from '../../../../test-utils/ladder-test';
import { nextStep } from './next-step';

const BJJ = LADDER_FIXTURES.bjj;
const JUDO = LADDER_FIXTURES.judo;

describe('nextStep', () => {
  it('gives the next stripe on the same belt', () => {
    expect(nextStep(BJJ, 'blue', 2)).toEqual({ belt: 'blue', stripes: 3 });
  });

  it('gives the next belt, with no stripes, once the belt is full', () => {
    expect(nextStep(BJJ, 'blue', 4)).toEqual({ belt: 'purple', stripes: 0 });
  });

  it("skips the kids' grades for an adult", () => {
    expect(nextStep(JUDO, 'white', 0)).toEqual({ belt: 'yellow', stripes: 0 });
  });

  it("keeps a child on the kids' grades, then lets them into the next one", () => {
    expect(nextStep(BJJ, 'grey', 4)).toEqual({ belt: 'yellow', stripes: 0 });
    expect(nextStep(BJJ, 'green', 4)).toEqual({ belt: 'white', stripes: 0 });
  });

  it('has nothing past the top of the ladder, or for a belt it does not hold', () => {
    expect(nextStep(BJJ, 'red', 4)).toBeNull();
    expect(nextStep([], 'white', 0)).toBeNull();
  });
});
