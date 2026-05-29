import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SideRailComponent, RailBrand, RailProfile } from './side-rail.component';
import { BottomNavTab } from '../bottom-nav/bottom-nav.component';

@Component({
  standalone: true,
  imports: [SideRailComponent],
  template: `<app-side-rail
    [tabs]="tabs"
    [brand]="brand"
    [profile]="profile"
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
  created = 0;
}

function setup(opts: { profile?: RailProfile | null } = {}) {
  TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(HostComponent);
  if (opts.profile !== undefined) {
    fixture.componentInstance.profile = opts.profile;
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

  it('exposes a navigation landmark with the passed aria-label on the host', () => {
    const { el } = setup();
    const host = el.querySelector('app-side-rail');
    expect(host?.getAttribute('role')).toBe('navigation');
    expect(host?.getAttribute('aria-label')).toBe('Primary');
  });
});
