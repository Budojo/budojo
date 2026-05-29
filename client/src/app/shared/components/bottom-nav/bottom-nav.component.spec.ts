import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BottomNavCenterAction, BottomNavComponent, BottomNavTab } from './bottom-nav.component';

const CENTER: BottomNavCenterAction = {
  icon: 'pi pi-plus',
  ariaLabel: 'Create',
  dataCy: 'nav-create',
};

@Component({
  standalone: true,
  imports: [BottomNavComponent],
  template: `
    <app-bottom-nav
      [tabs]="tabs"
      [centerAction]="center"
      ariaLabel="Primary nav"
      (centerActivated)="centerCount = centerCount + 1"
    />
  `,
})
class HostComponent {
  tabs: BottomNavTab[] = [
    { icon: 'pi pi-home', label: 'Feed', routerLink: '/feed', dataCy: 'nav-feed' },
    { icon: 'pi pi-bolt', label: 'Academy', routerLink: '/academy', dataCy: 'nav-academy' },
    { icon: 'pi pi-bell', label: 'Alerts', routerLink: '/alerts', dataCy: 'nav-alerts' },
    { icon: 'pi pi-user', label: 'Profile', routerLink: '/profile', dataCy: 'nav-profile' },
  ];
  center: BottomNavCenterAction | null = CENTER;
  centerCount = 0;
}

const ROUTES = [
  { path: 'feed', children: [] },
  { path: 'academy', children: [] },
  { path: 'alerts', children: [] },
  { path: 'profile', children: [] },
];

// `center` is set BEFORE the first detectChanges — mutating an OnPush-fed
// input after the initial pass trips NG0100 in dev double-check mode.
function setup(center: BottomNavCenterAction | null = CENTER) {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [provideRouter(ROUTES)],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.center = center;
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('BottomNavComponent (#1108)', () => {
  it('renders a nav landmark with the supplied aria-label', () => {
    const { el } = setup();
    const nav = el.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('aria-label')).toBe('Primary nav');
  });

  it('renders one link per tab with icon, label and data-cy', () => {
    const { el } = setup();
    expect(el.querySelectorAll('app-bottom-nav a').length).toBe(4);
    const feed = el.querySelector('[data-cy="nav-feed"]');
    expect(feed?.querySelector('i')?.className).toContain('pi pi-home');
    expect(feed?.textContent).toContain('Feed');
  });

  it('renders the center create button (aria-label + data-cy) and emits on click', () => {
    const { fixture, el } = setup();
    const create = el.querySelector('[data-cy="nav-create"]') as HTMLButtonElement | null;
    expect(create).not.toBeNull();
    expect(create?.getAttribute('aria-label')).toBe('Create');
    create?.click();
    expect(fixture.componentInstance.centerCount).toBe(1);
  });

  it('omits the center button when centerAction is null', () => {
    const { el } = setup(null);
    expect(el.querySelector('[data-cy="nav-create"]')).toBeNull();
    // The four tabs still render contiguously.
    expect(el.querySelectorAll('app-bottom-nav a').length).toBe(4);
  });

  it('marks the active-route tab with aria-current="page"', async () => {
    const { fixture, el } = setup();
    await TestBed.inject(Router).navigate(['/academy']);
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="nav-academy"]')?.getAttribute('aria-current')).toBe('page');
    expect(el.querySelector('[data-cy="nav-feed"]')?.getAttribute('aria-current')).toBeNull();
  });
});
