import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { CreateSheetAction, CreateSheetComponent } from './create-sheet.component';

@Component({
  standalone: true,
  imports: [CreateSheetComponent],
  template: `<app-create-sheet [actions]="actions" heading="Create" />`,
})
class HostComponent {
  readonly sheet = viewChild.required(CreateSheetComponent);
  actions: CreateSheetAction[] = [
    {
      icon: 'pi pi-check-circle',
      label: 'Check in',
      routerLink: '/dashboard/me/attendance',
      dataCy: 'create-checkin',
    },
    {
      icon: 'pi pi-pencil',
      label: 'New post',
      routerLink: '/dashboard/me/feed',
      dataCy: 'create-post',
    },
  ];
}

function setup() {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [
      provideRouter([
        { path: 'dashboard/me/attendance', children: [] },
        { path: 'dashboard/me/feed', children: [] },
      ]),
      provideAnimationsAsync(),
    ],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

describe('CreateSheetComponent (#1109)', () => {
  it('is closed by default — no dialog rendered', () => {
    const { el } = setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('open() shows a modal dialog with the heading + one row per action', () => {
    const { fixture, el, host } = setup();
    host.sheet().open();
    fixture.detectChanges();

    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    expect(el.querySelectorAll('.create-sheet__action').length).toBe(2);
    const checkin = el.querySelector('[data-cy="create-checkin"]');
    expect(checkin?.querySelector('i')?.className).toContain('pi pi-check-circle');
    expect(checkin?.textContent).toContain('Check in');
  });

  it('selecting an action closes the sheet', () => {
    const { fixture, el, host } = setup();
    host.sheet().open();
    fixture.detectChanges();

    (el.querySelector('[data-cy="create-checkin"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
