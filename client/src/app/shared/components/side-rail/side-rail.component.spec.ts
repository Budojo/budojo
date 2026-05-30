import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  SideRailComponent,
  RailBrand,
  RailNotifications,
  RailProfile,
} from './side-rail.component';
import { BottomNavTab } from '../bottom-nav/bottom-nav.component';

@Component({
  standalone: true,
  imports: [SideRailComponent],
  template: `<app-side-rail
    [tabs]="tabs"
    [brand]="brand"
    [profile]="profile"
    [notifications]="notifications"
    [createLabel]="'Create'"
    [ariaLabel]="'Primary'"
    (createActivated)="created = created + 1"
  />`,
})
class HostComponent {
  tabs: BottomNavTab[] = [
    { icon: 'pi pi-home', label: 'Feed', routerLink: '/dashboard/me/feed' },
    { icon: 'pi pi-building', label: 'Academy', routerLink: '/dashboard/me/academy' },
  ];
  brand: RailBrand = { label: 'Budojo', logoUrl: null, routerLink: '/dashboard/me/feed' };
  profile: RailProfile | null = {
    name: 'Marco Rossi',
    avatarUrl: null,
    handle: 'marcobjj',
    routerLink: '/dashboard/me/more',
  };
  notifications: RailNotifications | null = null;
  created = 0;
}

function setup(
  opts: { profile?: RailProfile | null; notifications?: RailNotifications | null } = {},
) {
  TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(HostComponent);
  if (opts.profile !== undefined) {
    fixture.componentInstance.profile = opts.profile;
  }
  if (opts.notifications !== undefined) {
    fixture.componentInstance.notifications = opts.notifications;
  }
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('SideRailComponent (#1120)', () => {
  it('renders the brand with the visible label as its accessible name (no aria-label override)', () => {
    const { el } = setup();
    const brand = el.querySelector('[data-cy="rail-brand"]') as HTMLAnchorElement;
    expect(brand).not.toBeNull();
    expect(brand.getAttribute('href')).toBe('/dashboard/me/feed');
    expect(brand.textContent).toContain('Budojo');
    // WCAG 2.5.3 label-in-name (#1119): no aria-label hiding the visible text.
    expect(brand.getAttribute('aria-label')).toBeNull();
  });

  it('renders a rail item per tab, linking to each destination', () => {
    const { el } = setup();
    expect(el.querySelectorAll('.rail__item').length).toBe(2);
    expect(el.querySelector('a.rail__item[href="/dashboard/me/feed"]')).not.toBeNull();
    expect(el.querySelector('a.rail__item[href="/dashboard/me/academy"]')).not.toBeNull();
  });

  it('emits createActivated when the ➕ Create button is clicked', () => {
    const { el, host } = setup();
    (el.querySelector('[data-cy="rail-create"]') as HTMLElement).click();
    expect(host.created).toBe(1);
  });

  it('renders the profile chip with the handle when a profile is provided', () => {
    const { el } = setup();
    const chip = el.querySelector('[data-cy="rail-profile"]') as HTMLAnchorElement;
    expect(chip).not.toBeNull();
    expect(chip.getAttribute('href')).toBe('/dashboard/me/more');
    expect(chip.textContent).toContain('Marco Rossi');
    expect(chip.textContent).toContain('@marcobjj');
  });

  it('hides the profile chip when no profile is provided', () => {
    const { el } = setup({ profile: null });
    expect(el.querySelector('[data-cy="rail-profile"]')).toBeNull();
  });

  it('renders the notifications entry with the unread badge when provided', () => {
    const { el } = setup({
      notifications: { routerLink: '/dashboard/notifications', unread: 5, label: 'Notifications' },
    });
    const item = el.querySelector('[data-cy="rail-notifications"]') as HTMLAnchorElement;
    expect(item).not.toBeNull();
    expect(item.getAttribute('href')).toBe('/dashboard/notifications');
    expect(item.textContent).toContain('Notifications');
    expect(el.querySelector('[data-cy="rail-notifications-badge"]')?.textContent?.trim()).toBe('5');
  });

  it('omits the badge when there are no unread notifications', () => {
    const { el } = setup({
      notifications: { routerLink: '/dashboard/notifications', unread: 0, label: 'Notifications' },
    });
    expect(el.querySelector('[data-cy="rail-notifications"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="rail-notifications-badge"]')).toBeNull();
  });

  it('omits the notifications entry when none is provided', () => {
    const { el } = setup();
    expect(el.querySelector('[data-cy="rail-notifications"]')).toBeNull();
  });

  it('exposes a navigation landmark with the passed aria-label on the host', () => {
    const { el } = setup();
    const host = el.querySelector('app-side-rail');
    expect(host?.getAttribute('role')).toBe('navigation');
    expect(host?.getAttribute('aria-label')).toBe('Primary');
  });

  it('uses a single navigation landmark — no nested <nav> inside the rail (#1121)', () => {
    const { el } = setup();
    // The tab links live in a plain container; a second <nav> would nest a
    // redundant landmark inside the host's role="navigation".
    expect(el.querySelector('app-side-rail nav')).toBeNull();
  });
});
