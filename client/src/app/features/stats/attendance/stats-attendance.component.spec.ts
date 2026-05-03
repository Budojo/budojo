import { TestBed } from '@angular/core/testing';
import { StatsAttendanceComponent } from './stats-attendance.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('StatsAttendanceComponent', () => {
  it('renders the stub label', async () => {
    await TestBed.configureTestingModule({
      imports: [StatsAttendanceComponent],
      providers: [...provideI18nTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(StatsAttendanceComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-attendance-stub"]')).toBeTruthy();
  });
});
