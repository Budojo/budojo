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

function open(
  fixture: ReturnType<typeof setup>['fixture'],
  http: HttpTestingController,
  who: Athlete,
  next: { kind: 'stripe' | 'belt'; belt: string; stripes: number } | null,
): void {
  fixture.componentRef.setInput('athlete', who);
  fixture.detectChanges();
  http
    .expectOne((r) => r.method === 'GET' && r.url.endsWith(`/athletes/${who.id}/next-step`))
    .flush({ data: next });
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

  it("proposes the server's next step, and records it with one tap", () => {
    const { fixture, http, promoted } = setup();
    open(fixture, http, anna(), { kind: 'stripe', belt: 'blue', stripes: 3 });

    expect(text('promote-from')).toContain('Blue · 2');
    expect(text('promote-to')).toContain('Blue · 3');
    button().click();

    const put = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/athletes/7'));
    expect(put.request.body).toEqual({ belt: 'blue', stripes: 3 });
    put.flush({ data: anna({ stripes: 3 }) });
    expect(promoted.map((a) => a.stripes)).toEqual([3]);
  });

  it('shows where the athlete is until the proposal answers', () => {
    const { fixture, http } = setup();
    fixture.componentRef.setInput('athlete', anna());
    fixture.detectChanges();

    expect(text('promote-to')).toContain('Blue · 2');
    expect(button().disabled).toBe(true);
    http.expectOne((r) => r.url.endsWith('/next-step')).flush({ data: null });
  });

  it('keeps a pick made before the proposal answers', () => {
    const { fixture, http } = setup();
    fixture.componentRef.setInput('athlete', anna());
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { pickBelt: (belt: string) => void }).pickBelt(
      'purple',
    );
    http
      .expectOne((r) => r.url.endsWith('/next-step'))
      .flush({ data: { kind: 'stripe', belt: 'blue', stripes: 3 } });
    fixture.detectChanges();

    expect(text('promote-to')).toContain('Purple · 0');
  });

  it("lists a proposed kids' grade even where the academy hides them", () => {
    const { fixture, http } = setup();
    useLadder('judo', { trains_kids: false });
    open(fixture, http, anna({ belt: 'white-and-yellow', stripes: 0 }), {
      kind: 'belt',
      belt: 'yellow-and-orange',
      stripes: 0,
    });
    const values = (
      fixture.componentInstance as unknown as { beltOptions: () => { value: string }[] }
    )
      .beltOptions()
      .map((option) => option.value);

    expect(values).toContain('white-and-yellow');
    expect(values).toContain('yellow-and-orange');
    expect(values).not.toContain('orange-and-green');
  });

  it('starts a picked belt with no stripes', () => {
    const { fixture, http } = setup();
    open(fixture, http, anna(), { kind: 'stripe', belt: 'blue', stripes: 3 });

    (fixture.componentInstance as unknown as { pickBelt: (belt: string) => void }).pickBelt(
      'purple',
    );
    fixture.detectChanges();
    expect(text('promote-to')).toContain('Purple · 0');
  });

  it('says why there is nothing to record at the top of the ladder', () => {
    const { fixture, http } = setup();
    open(fixture, http, anna({ belt: 'red', stripes: 4 }), null);

    expect(button().disabled).toBe(true);
    expect(text('promote-same')).toContain('pick the one to record');
  });

  it('says so when the server refuses, and keeps the sheet', () => {
    const { fixture, http, promoted } = setup();
    open(fixture, http, anna(), { kind: 'stripe', belt: 'blue', stripes: 3 });
    button().click();
    http
      .expectOne((r) => r.method === 'PUT')
      .flush({ message: 'x' }, { status: 422, statusText: 'x' });
    fixture.detectChanges();

    expect(promoted).toEqual([]);
    expect(document.body.querySelector('[data-cy="promote-error"]')).not.toBeNull();
  });
});
