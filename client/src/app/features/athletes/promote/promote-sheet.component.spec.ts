import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { useLadder } from '../../../../test-utils/ladder-test';
import { Athlete } from '../../../core/services/athlete.service';
import { PromoteSheetComponent } from './promote-sheet.component';

const anna = (over: Partial<Athlete> = {}): Athlete =>
  ({
    id: 7,
    first_name: 'Anna',
    last_name: 'Rossi',
    belt: 'blue',
    stripes: 2,
    status: 'active',
    is_self: false,
    date_of_birth: null,
    photo_url: null,
    user_avatar_url: null,
    ...over,
  }) as Athlete;

function setup() {
  TestBed.configureTestingModule({
    imports: [PromoteSheetComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });
  useLadder('bjj');
  const fixture = TestBed.createComponent(PromoteSheetComponent);
  const promoted: Athlete[] = [];
  fixture.componentInstance.promoted.subscribe((a) => promoted.push(a));
  return { fixture, http: TestBed.inject(HttpTestingController), promoted };
}

function open(fixture: ReturnType<typeof setup>['fixture'], who: Athlete): void {
  fixture.componentRef.setInput('athlete', who);
  fixture.detectChanges();
}

const button = (): HTMLButtonElement =>
  document.body.querySelector('[data-cy="promote-submit"] button') as HTMLButtonElement;
const text = (cy: string): string =>
  (document.body.querySelector(`[data-cy="${cy}"]`)?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('PromoteSheetComponent', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('stays closed without an athlete', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    expect(document.body.querySelector('.p-dialog')).toBeNull();
  });

  it('proposes the next stripe, and records it with one tap', () => {
    const { fixture, http, promoted } = setup();
    open(fixture, anna());

    expect(text('promote-from')).toContain('Blue · 2');
    expect(text('promote-to')).toContain('Blue · 3');
    button().click();

    const patch = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/athletes/7'));
    expect(patch.request.body).toEqual({ belt: 'blue', stripes: 3 });
    patch.flush({ data: anna({ stripes: 3 }) });
    expect(promoted.map((a) => a.stripes)).toEqual([3]);
  });

  it('proposes the next belt once the stripes are full', () => {
    const { fixture } = setup();
    open(fixture, anna({ stripes: 4 }));
    expect(text('promote-to')).toContain('Purple · 0');
  });

  it('cannot record a step to where the athlete already is', () => {
    const { fixture } = setup();
    open(fixture, anna({ belt: 'red', stripes: 4 }));
    // The top of the ladder: nothing proposed, nothing to record.
    expect(button().disabled).toBe(true);
  });

  it('says so when the server refuses, and keeps the sheet', () => {
    const { fixture, http, promoted } = setup();
    open(fixture, anna());
    button().click();
    http
      .expectOne((r) => r.method === 'PUT')
      .flush({ message: 'x' }, { status: 422, statusText: 'x' });
    fixture.detectChanges();

    expect(promoted).toEqual([]);
    expect(document.body.querySelector('[data-cy="promote-error"]')).not.toBeNull();
  });
});
