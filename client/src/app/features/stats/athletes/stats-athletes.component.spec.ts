import { TestBed } from '@angular/core/testing';
import { StatsAthletesComponent } from './stats-athletes.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('StatsAthletesComponent', () => {
  it('renders the stub label', async () => {
    await TestBed.configureTestingModule({
      imports: [StatsAthletesComponent],
      providers: [...provideI18nTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(StatsAthletesComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-stub"]')).toBeTruthy();
  });
});
