import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MartialArt } from '../../../core/services/academy.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { MartialArtPickerComponent } from './martial-art-picker.component';

@Component({
  imports: [MartialArtPickerComponent],
  template: `<app-martial-art-picker
    [value]="value()"
    ariaLabel="Martial art"
    (valueChange)="picked.push($event)"
  />`,
})
class HostComponent {
  readonly value = signal<MartialArt | null>(null);
  readonly picked: MartialArt[] = [];
}

function setup() {
  TestBed.configureTestingModule({ imports: [HostComponent], providers: provideI18nTesting() });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const option = (art: MartialArt) =>
    el.querySelector<HTMLButtonElement>(`[data-cy="martial-art-${art}"]`)!;
  return { fixture, host: fixture.componentInstance, el, option };
}

describe('MartialArtPickerComponent (#1802)', () => {
  it('is a labelled group of four plain buttons, which never submit the form around them', () => {
    const { el } = setup();

    const group = el.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Martial art');
    const buttons = Array.from(group!.querySelectorAll('button'));
    expect(buttons).toHaveLength(4);
    expect(buttons.every((b) => b.type === 'button')).toBe(true);
  });

  it('marks only the current value as pressed', () => {
    const { fixture, host, option } = setup();
    host.value.set('taekwondo');
    fixture.detectChanges();

    expect(option('taekwondo').getAttribute('aria-pressed')).toBe('true');
    expect(option('bjj').getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the press and leaves the value to its owner', () => {
    const { fixture, host, option } = setup();

    option('judo').click();
    fixture.detectChanges();

    expect(host.picked).toEqual(['judo']);
    // Controlled: nothing looks selected until the parent says so.
    expect(option('judo').getAttribute('aria-pressed')).toBe('false');
  });
});
