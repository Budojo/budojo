import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { PayChip } from './pay-chip';
import { PayChipComponent } from './pay-chip.component';

function render(chip: PayChip, present = false) {
  TestBed.configureTestingModule({
    imports: [PayChipComponent],
    providers: [...provideI18nTesting()],
  });
  const fixture = TestBed.createComponent(PayChipComponent);
  fixture.componentRef.setInput('chip', chip);
  fixture.componentRef.setInput('present', present);
  fixture.componentRef.setInput('name', 'Anna Bianchi');
  let asked = 0;
  fixture.componentInstance.ask.subscribe(() => asked++);
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, asked: () => asked };
}

describe('PayChipComponent', () => {
  it('names the month owed, and asks once the athlete is present', () => {
    const away = render({ kind: 'due', month: '2026-09' });
    expect(away.root.textContent?.trim()).toBe('September');
    TestBed.resetTestingModule();

    const here = render({ kind: 'due', month: '2026-09' }, true);
    const button = here.root.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Ask September');
    expect(button.getAttribute('aria-label')).toBe("Record Anna Bianchi's payment for September");
    button.click();
    expect(here.asked()).toBe(1);
  });

  it('is a quiet label, not a button, for every other state', () => {
    const states: [PayChip, string][] = [
      [{ kind: 'free' }, 'Free'],
      [{ kind: 'carnet', left: 3 }, 'Carnet · 3'],
      [{ kind: 'covered' }, 'Paid'],
    ];
    for (const [chip, words] of states) {
      const { root } = render(chip, true);
      expect(root.querySelector('button')).toBeNull();
      expect(root.textContent?.trim()).toBe(words);
      TestBed.resetTestingModule();
    }
  });
});
