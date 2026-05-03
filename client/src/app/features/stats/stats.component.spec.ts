import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsComponent } from './stats.component';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

describe('StatsComponent (shell)', () => {
  let fixture: ComponentFixture<StatsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(StatsComponent);
  });

  it('renders the overview child', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-stats-overview')).toBeTruthy();
  });
});
