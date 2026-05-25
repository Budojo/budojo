import { TestBed } from '@angular/core/testing';
import { IconButtonComponent } from './icon-button.component';

describe('IconButtonComponent (#1039)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [IconButtonComponent] });
  });

  function mount(inputs: {
    icon?: string;
    ariaLabel?: string;
    tooltip?: string;
    severity?: 'primary' | 'secondary' | 'danger' | 'warn' | 'success';
    size?: 'small' | 'large';
    text?: boolean;
    outlined?: boolean;
    disabled?: boolean;
    loading?: boolean;
    dataCy?: string | null;
  }) {
    const fixture = TestBed.createComponent(IconButtonComponent);
    fixture.componentRef.setInput('icon', inputs.icon ?? 'pi pi-trash');
    fixture.componentRef.setInput('ariaLabel', inputs.ariaLabel ?? 'Delete row');
    fixture.componentRef.setInput('tooltip', inputs.tooltip ?? 'Delete');
    if (inputs.severity !== undefined) fixture.componentRef.setInput('severity', inputs.severity);
    if (inputs.size !== undefined) fixture.componentRef.setInput('size', inputs.size);
    if (inputs.text !== undefined) fixture.componentRef.setInput('text', inputs.text);
    if (inputs.outlined !== undefined) fixture.componentRef.setInput('outlined', inputs.outlined);
    if (inputs.disabled !== undefined) fixture.componentRef.setInput('disabled', inputs.disabled);
    if (inputs.loading !== undefined) fixture.componentRef.setInput('loading', inputs.loading);
    if (inputs.dataCy !== undefined) fixture.componentRef.setInput('dataCy', inputs.dataCy);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a p-button with the supplied icon', () => {
    const fixture = mount({ icon: 'pi pi-pencil' });
    // PrimeNG binds [icon] as a property, not a DOM attribute — assert
    // via the rendered <span class="pi pi-pencil"> inside the host button.
    expect(fixture.nativeElement.querySelector('span.pi.pi-pencil')).not.toBeNull();
  });

  it('forwards ariaLabel to the underlying p-button (a11y is required)', () => {
    const fixture = mount({ ariaLabel: 'Edit athlete' });
    expect(fixture.componentInstance.ariaLabel()).toBe('Edit athlete');
  });

  it('forwards the tooltip to the underlying p-button (signifier is required)', () => {
    const fixture = mount({ tooltip: 'Edit' });
    expect(fixture.componentInstance.tooltip()).toBe('Edit');
  });

  it('emits clicked when the underlying button is activated', () => {
    const fixture = mount({});
    let clicks = 0;
    fixture.componentInstance.clicked.subscribe(() => clicks++);

    fixture.componentInstance.onClick();
    expect(clicks).toBe(1);
  });

  it('does not emit when disabled or loading', () => {
    const fixture = mount({ disabled: true });
    let clicks = 0;
    fixture.componentInstance.clicked.subscribe(() => clicks++);
    fixture.componentInstance.onClick();
    expect(clicks).toBe(0);

    fixture.componentRef.setInput('disabled', false);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    fixture.componentInstance.onClick();
    expect(clicks).toBe(0);
  });

  it('forwards data-cy when provided', () => {
    const fixture = mount({ dataCy: 'athletes-edit-btn' });
    expect(fixture.nativeElement.querySelector('[data-cy="athletes-edit-btn"]')).not.toBeNull();
  });

  it('defaults severity to secondary and text=true so it is unobtrusive in toolbars', () => {
    const fixture = mount({});
    expect(fixture.componentInstance.severity()).toBe('secondary');
    expect(fixture.componentInstance.text()).toBe(true);
  });

  it('host enforces 48×48 touch target via CSS (Fitts / MD3) regardless of underlying p-button size (#1045 reviewer)', () => {
    // The host element carries the min size; the inner p-button can
    // still render with size='small' for visual density, but the
    // touch target stays compliant.
    const fixture = mount({ size: 'small' });
    const host = fixture.nativeElement as HTMLElement;
    // Append to document so getComputedStyle returns real values.
    document.body.appendChild(host);
    const styles = getComputedStyle(host);
    expect(parseFloat(styles.minWidth)).toBeGreaterThanOrEqual(48);
    expect(parseFloat(styles.minHeight)).toBeGreaterThanOrEqual(48);
    host.remove();
  });
});
