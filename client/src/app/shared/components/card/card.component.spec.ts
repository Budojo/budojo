import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CardComponent } from './card.component';

@Component({
  standalone: true,
  imports: [CardComponent],
  template: `
    <app-card [active]="isActive" [dataCy]="hookId">
      <section header><span class="head">Header content</span></section>
      <section body><span class="bod">Body content</span></section>
      <section footer><span class="foo">Footer content</span></section>
    </app-card>
  `,
})
class HostComponent {
  isActive = false;
  hookId: string | null = null;
}

describe('CardComponent (#1038)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('renders each of the three named slots when content is supplied', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('[header] .head')?.textContent).toBe('Header content');
    expect(root.querySelector('[body] .bod')?.textContent).toBe('Body content');
    expect(root.querySelector('[footer] .foo')?.textContent).toBe('Footer content');
  });

  it('exposes the .card host class for SCSS-level overrides', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card')).not.toBeNull();
  });

  it('toggles card--active when active=true (present-state tint)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.isActive = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card.card--active')).not.toBeNull();
  });

  it('omits card--active when active=false (default)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card.card--active')).toBeNull();
  });

  it('forwards data-cy to the .card root', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.hookId = 'athlete-card-42';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-card-42"]')).not.toBeNull();
  });
});
