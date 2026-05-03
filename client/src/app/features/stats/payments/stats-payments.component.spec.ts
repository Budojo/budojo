import { TestBed } from '@angular/core/testing';
import { StatsPaymentsComponent } from './stats-payments.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('StatsPaymentsComponent', () => {
  it('renders the stub label', async () => {
    await TestBed.configureTestingModule({
      imports: [StatsPaymentsComponent],
      providers: [...provideI18nTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(StatsPaymentsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-stub"]')).toBeTruthy();
  });
});
