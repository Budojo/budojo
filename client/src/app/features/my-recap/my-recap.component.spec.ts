import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { GetRecapResult, WeeklyRecapService } from '../../core/services/weekly-recap.service';
import { MyRecapComponent } from './my-recap.component';

interface RecapStub {
  getRecap: ReturnType<typeof vi.fn>;
}

function setup(
  recapReturn: unknown = of<GetRecapResult>({
    status: 'ok',
    recap: {
      iso_week_start: '2026-05-18',
      sessions: 3,
      hours: 4.5,
      partners: [{ first_name: 'Mario', last_name_initial: 'R' }],
    },
  }),
  isoWeek = '2026-05-18',
): {
  fixture: ComponentFixture<MyRecapComponent>;
  svc: RecapStub;
  router: Router;
  add: ReturnType<typeof vi.fn>;
} {
  const svc: RecapStub = { getRecap: vi.fn().mockReturnValue(recapReturn) };
  const messageService = { add: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MyRecapComponent],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: WeeklyRecapService, useValue: svc },
      { provide: MessageService, useValue: messageService },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ isoWeek })) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MyRecapComponent);
  fixture.detectChanges();
  return { fixture, svc, router: TestBed.inject(Router), add: messageService.add };
}

describe('MyRecapComponent (#960)', () => {
  it('shows sessions + hours + partner list on a successful recap fetch', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="recap-ok"]')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="recap-sessions"]')?.textContent,
    ).toContain('3');
    expect(fixture.nativeElement.querySelector('[data-cy="recap-hours"]')?.textContent).toContain(
      '4.5h',
    );
    expect(fixture.nativeElement.querySelector('[data-cy="recap-partner"]')?.textContent).toContain(
      'Mario',
    );
  });

  it('renders zero partners cleanly (omits the partners block when empty)', async () => {
    const { fixture } = setup(
      of<GetRecapResult>({
        status: 'ok',
        recap: { iso_week_start: '2026-05-18', sessions: 1, hours: 1.5, partners: [] },
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="recap-ok"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="recap-partners"]')).toBeNull();
  });

  it('flips to error panel on bad-week response', async () => {
    const { fixture } = setup(of<GetRecapResult>({ status: 'bad-week' }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="recap-error"]')).not.toBeNull();
  });

  it('bounces to owner dashboard on no-athlete response', async () => {
    const navSpy = vi.fn().mockResolvedValue(true);
    // Configure TestBed manually so we can spy on Router.navigateByUrl
    // BEFORE the component constructor fires its subscribe → navigate.
    TestBed.configureTestingModule({
      imports: [MyRecapComponent],
      providers: [
        provideRouter([]),
        provideAnimationsAsync(),
        ...provideI18nTesting(),
        {
          provide: WeeklyRecapService,
          useValue: {
            getRecap: vi.fn().mockReturnValue(of<GetRecapResult>({ status: 'no-athlete' })),
          },
        },
        { provide: MessageService, useValue: { add: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ isoWeek: '2026-05-18' })) },
        },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = navSpy as never;

    const fixture = TestBed.createComponent(MyRecapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('flips to error panel on a network error (500)', async () => {
    const { fixture } = setup(throwError(() => new Error('boom')));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="recap-error"]')).not.toBeNull();
  });
});
