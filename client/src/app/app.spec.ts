import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { App } from './app';
import { provideI18nTesting } from '../test-utils/i18n-test';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // The shell now mounts a `<p-toast>` so the verify-error landing
      // (and any future cross-shell component) can fire toasts. PrimeNG's
      // Toast injects MessageService at construction time.
      providers: [MessageService, ...provideI18nTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
