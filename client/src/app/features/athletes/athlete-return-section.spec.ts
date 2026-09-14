import { returnSection } from './athlete-return-section';

describe('returnSection (#1633)', () => {
  it.each([['documents'], ['attendance'], ['payments'], ['coverage'], ['promotions']])(
    'returns %s unchanged, because it is a section that exists',
    (section) => {
      expect(returnSection(section)).toBe(section);
    },
  );

  it('falls back to documents when nothing was recorded', () => {
    expect(returnSection(null)).toBe('documents');
    expect(returnSection(undefined)).toBe('documents');
    expect(returnSection('')).toBe('documents');
  });

  it('refuses a value that is not one of the sections', () => {
    // The value arrives off a URL anybody can type. Handing it to the router
    // unchecked would navigate to a route that does not resolve.
    expect(returnSection('../../admin')).toBe('documents');
    expect(returnSection('Payments')).toBe('documents');
  });

  it('refuses edit in particular, which would reopen the form being closed', () => {
    expect(returnSection('edit')).toBe('documents');
  });
});
