import { EMPTY_LEDGER, SyncLedger } from './engine';
import { forgetLedger, loadLedger, saveLedger } from './ledger-store';

/** The device's memory between rounds and launches (#2046). */
describe('the ledger store', () => {
  const ledger: SyncLedger = {
    base: { seq: 4, device: 'pc4f2a' },
    pushedThrough: '01J9ZQ3K8M4N5P6Q7R8S9T0V1W',
    listedThrough: null,
    unconfirmed: {
      version: { seq: 5, device: 'phone9c1e' },
      parent: { seq: 4, device: 'pc4f2a' },
      pushedAt: null,
    },
  };

  beforeEach(() => localStorage.clear());

  it('keeps a ledger across launches', () => {
    saveLedger('phone9c1e', ledger);
    expect(loadLedger('phone9c1e')).toEqual(ledger);
  });

  it('starts empty with nothing saved', () => {
    expect(loadLedger('phone9c1e')).toEqual(EMPTY_LEDGER);
  });

  it('never hands one device’s ledger to another identity', () => {
    saveLedger('phone9c1e', ledger);
    expect(loadLedger('phone7k2m')).toEqual(EMPTY_LEDGER);
  });

  it('starts empty on a damaged ledger rather than trusting it', () => {
    localStorage.setItem('budojoSyncLedger', '{"device":"phone9c1e","ledger":{"base":7}}');
    expect(loadLedger('phone9c1e')).toEqual(EMPTY_LEDGER);
    localStorage.setItem('budojoSyncLedger', 'not json');
    expect(loadLedger('phone9c1e')).toEqual(EMPTY_LEDGER);
  });

  it('forgets it when the database is replaced outside the sync', () => {
    saveLedger('phone9c1e', ledger);
    forgetLedger();
    expect(loadLedger('phone9c1e')).toEqual(EMPTY_LEDGER);
  });
});
