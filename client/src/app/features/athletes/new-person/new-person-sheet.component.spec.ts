import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { Athlete } from '../../../core/services/athlete.service';
import { NewPersonSheetComponent } from './new-person-sheet.component';

function setup() {
  TestBed.configureTestingModule({
    imports: [NewPersonSheetComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });
  const fixture = TestBed.createComponent(NewPersonSheetComponent);
  const created: Athlete[] = [];
  fixture.componentInstance.created.subscribe((a) => created.push(a));
  let closed = 0;
  fixture.componentInstance.closed.subscribe(() => closed++);
  return {
    fixture,
    http: TestBed.inject(HttpTestingController),
    created,
    closed: () => closed,
  };
}

function open(fixture: ReturnType<typeof setup>['fixture'], typed: string): void {
  fixture.componentRef.setInput('name', typed);
  fixture.detectChanges();
}

const field = (cy: string): HTMLInputElement =>
  document.body.querySelector(`[data-cy="${cy}"]`) as HTMLInputElement;
const submit = (): HTMLButtonElement =>
  document.body.querySelector('[data-cy="new-person-submit"] button') as HTMLButtonElement;

describe('NewPersonSheetComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 19, 5));
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  it('stays closed until a name is given', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    expect(document.body.querySelector('.p-dialog')).toBeNull();
  });

  it('splits what was typed into the two names, with a free trial picked', () => {
    const { fixture } = setup();
    open(fixture, '  Luca   Bianchi Rossi ');

    expect(field('new-person-first').value).toBe('Luca');
    expect(field('new-person-last').value).toBe('Bianchi Rossi');
    expect(document.body.querySelector('[data-cy="new-person-kind"]')?.textContent).toContain(
      'Free trial',
    );
  });

  it('adds a free trial as active from today, at no fee, and hands the athlete back', () => {
    const { fixture, http, created } = setup();
    open(fixture, 'Luca Bianchi');

    submit().click();
    const post = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/v1/athletes'));
    expect(post.request.body).toEqual({
      first_name: 'Luca',
      last_name: 'Bianchi',
      belt: 'white',
      stripes: 0,
      status: 'active',
      joined_at: '2026-10-06',
      fee_override_cents: 0,
    });
    post.flush({ data: { id: 31, first_name: 'Luca', last_name: 'Bianchi' } });

    expect(created.map((a) => a.id)).toEqual([31]);
  });

  it('leaves a new member on the academy fee', () => {
    const { fixture, http } = setup();
    open(fixture, 'Luca Bianchi');
    const member = Array.from(
      document.body.querySelectorAll<HTMLElement>('[data-cy="new-person-kind"] .p-togglebutton'),
    ).find((b) => b.textContent?.includes('Joins'));
    expect(member).toBeDefined();
    member?.click();
    fixture.detectChanges();

    submit().click();
    const post = http.expectOne((r) => r.method === 'POST');
    expect(post.request.body).not.toHaveProperty('fee_override_cents');
    post.flush({ data: { id: 32, first_name: 'Luca', last_name: 'Bianchi' } });
  });

  it('asks for the last name before it sends anything', () => {
    const { fixture, http, created } = setup();
    open(fixture, 'Luca');

    submit().click();
    fixture.detectChanges();
    http.expectNone((r) => r.method === 'POST');
    expect(created).toEqual([]);
    expect(document.body.textContent).toContain('Last name is required');
  });

  it('says so when the server refuses, and keeps the sheet', () => {
    const { fixture, http, created, closed } = setup();
    open(fixture, 'Luca Bianchi');

    submit().click();
    fixture.detectChanges();
    // Not dismissable while it saves (#2133).
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed()).toBe(0);

    http
      .expectOne((r) => r.method === 'POST')
      .flush({ message: 'x' }, { status: 500, statusText: 'x' });
    fixture.detectChanges();

    expect(created).toEqual([]);
    expect(document.body.querySelector('[data-cy="new-person-error"]')).not.toBeNull();
    expect(document.body.querySelector('.p-dialog')).not.toBeNull();

    // And Escape closes it again once nothing is on its way: the hold above
    // held, the dialog was listening.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed()).toBe(1);
  });
});
