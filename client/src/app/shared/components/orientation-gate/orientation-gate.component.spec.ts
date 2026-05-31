import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { OrientationGateComponent } from './orientation-gate.component';

describe('OrientationGateComponent (#1171)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [OrientationGateComponent],
      providers: [...provideI18nTesting()],
    });
    const fixture = TestBed.createComponent(OrientationGateComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the rotate-to-portrait message and a mobile glyph', () => {
    const el = setup();
    expect(el.querySelector('.orientation-gate__message')).not.toBeNull();
    expect(el.querySelector('.pi-mobile')).not.toBeNull();
  });
});
