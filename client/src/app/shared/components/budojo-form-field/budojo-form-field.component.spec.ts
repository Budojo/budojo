import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { BudojoFormFieldComponent } from './budojo-form-field.component';

describe('BudojoFormFieldComponent (#1039)', () => {
  // The form-field has a slot for the actual control; mount it with a
  // canary `<input>` so we can assert label + control association.
  @Component({
    standalone: true,
    imports: [BudojoFormFieldComponent],
    template: `
      <app-budojo-form-field
        [label]="label"
        [required]="required"
        [optionalLabel]="optionalLabel"
        [error]="error"
        [hint]="hint"
        [controlId]="controlId"
        [dataCy]="dataCy"
      >
        <input [id]="controlId" type="text" />
      </app-budojo-form-field>
    `,
  })
  class HostComponent {
    label = 'Email';
    required = false;
    optionalLabel: string | null = null;
    error: string | null = null;
    hint: string | null = null;
    controlId = 'email-input';
    dataCy: string | null = null;
  }

  function mount(overrides: Partial<HostComponent> = {}) {
    const fixture = TestBed.createComponent(HostComponent);
    Object.assign(fixture.componentInstance, overrides);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the label and associates it with the slotted control via for/id', () => {
    const fixture = mount({ label: 'Email address', controlId: 'email-field' });
    const root: HTMLElement = fixture.nativeElement;
    const label = root.querySelector('label') as HTMLLabelElement | null;
    expect(label?.textContent?.trim()).toContain('Email address');
    expect(label?.getAttribute('for')).toBe('email-field');
  });

  it('renders a required marker (*) only when required is true', () => {
    const fixtureNoReq = mount({ required: false });
    expect(fixtureNoReq.nativeElement.querySelector('.budojo-form-field__required')).toBeNull();

    const fixtureReq = mount({ required: true });
    expect(
      fixtureReq.nativeElement.querySelector('.budojo-form-field__required')?.textContent?.trim(),
    ).toBe('*');
  });

  it('renders the optional marker only when optionalLabel is set (#1050)', () => {
    const fixtureNone = mount({});
    expect(fixtureNone.nativeElement.querySelector('.budojo-form-field__optional')).toBeNull();

    const fixtureOpt = mount({ optionalLabel: 'Optional' });
    expect(
      fixtureOpt.nativeElement.querySelector('.budojo-form-field__optional')?.textContent?.trim(),
    ).toBe('Optional');
  });

  it('marks the required indicator aria-hidden so screen readers do not announce the asterisk', () => {
    const fixture = mount({ required: true });
    const marker = fixture.nativeElement.querySelector('.budojo-form-field__required');
    expect(marker?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the hint as a <small> when provided', () => {
    const fixture = mount({ hint: 'Used for password reset.' });
    expect(
      fixture.nativeElement.querySelector('small.budojo-form-field__hint')?.textContent?.trim(),
    ).toBe('Used for password reset.');
  });

  it('renders the error as a <small> with role=alert when provided', () => {
    const fixture = mount({ error: 'Email is required.' });
    const err = fixture.nativeElement.querySelector('small.budojo-form-field__error');
    expect(err?.textContent?.trim()).toBe('Email is required.');
    expect(err?.getAttribute('role')).toBe('alert');
  });

  it('hides the hint when an error is present (error takes precedence)', () => {
    const fixture = mount({ hint: 'Used for password reset.', error: 'Email is required.' });
    expect(fixture.nativeElement.querySelector('.budojo-form-field__hint')).toBeNull();
    expect(fixture.nativeElement.querySelector('.budojo-form-field__error')).not.toBeNull();
  });

  it('wires aria-describedby on the control id to the hint/error id (a11y)', () => {
    const fixture = mount({ controlId: 'pwd-field', hint: 'At least 8 chars.' });
    const root: HTMLElement = fixture.nativeElement;
    const hint = root.querySelector('.budojo-form-field__hint') as HTMLElement | null;
    expect(hint?.id).toBe('pwd-field-hint');
  });

  it('forwards data-cy to the root container', () => {
    const fixture = mount({ dataCy: 'email-form-field' });
    expect(fixture.nativeElement.querySelector('[data-cy="email-form-field"]')).not.toBeNull();
  });
});
