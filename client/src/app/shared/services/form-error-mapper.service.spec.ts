import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { FormErrorMapperService } from './form-error-mapper.service';

function setup() {
  TestBed.configureTestingModule({});
  const fb = new FormBuilder();
  const form = fb.group({
    email: fb.control(''),
    password: fb.control(''),
    address: fb.group({
      line1: fb.control(''),
      city: fb.control(''),
    }),
  });
  const service = TestBed.inject(FormErrorMapperService);
  return { service, form };
}

describe('FormErrorMapperService (#1035)', () => {
  it('writes server errors under each matched control', () => {
    const { service, form } = setup();
    const mapped = service.mapServerErrors(form, {
      email: ['email_taken'],
      password: ['password_breached'],
    });

    expect(mapped).toBe(true);
    expect(form.controls.email.errors?.['server']).toBe('email_taken');
    expect(form.controls.password.errors?.['server']).toBe('password_breached');
  });

  it('marks each mapped control as touched so inline error renders immediately', () => {
    const { service, form } = setup();
    expect(form.controls.email.touched).toBe(false);

    service.mapServerErrors(form, { email: ['email_taken'] });

    expect(form.controls.email.touched).toBe(true);
  });

  it('resolves dotted paths into nested form groups', () => {
    const { service, form } = setup();
    service.mapServerErrors(form, {
      'address.line1': ['line1_required'],
    });

    expect(form.get('address.line1')?.errors?.['server']).toBe('line1_required');
  });

  it('returns false when zero fields match (cross-field errors stay banner-only)', () => {
    const { service, form } = setup();
    const mapped = service.mapServerErrors(form, {
      general: ['something_broke'],
      unrecognized_field: ['nope'],
    });

    expect(mapped).toBe(false);
    expect(form.controls.email.errors).toBeNull();
  });

  it('preserves prior client-side errors when overlaying server errors', () => {
    const { service, form } = setup();
    form.controls.email.setErrors({ email: true });

    service.mapServerErrors(form, { email: ['email_taken'] });

    expect(form.controls.email.errors?.['email']).toBe(true);
    expect(form.controls.email.errors?.['server']).toBe('email_taken');
  });

  it('clearServerErrors strips only `server` key, keeps other errors', () => {
    const { service, form } = setup();
    form.controls.email.setErrors({ email: true, server: 'email_taken' });

    service.clearServerErrors(form);

    expect(form.controls.email.errors?.['email']).toBe(true);
    expect(form.controls.email.errors?.['server']).toBeUndefined();
  });

  it('clearServerErrors sets control errors to null when only `server` was present', () => {
    const { service, form } = setup();
    form.controls.email.setErrors({ server: 'email_taken' });

    service.clearServerErrors(form);

    expect(form.controls.email.errors).toBeNull();
  });

  it('clearServerErrors recurses into nested groups', () => {
    const { service, form } = setup();
    const line1 = form.get('address.line1');
    line1?.setErrors({ server: 'line1_required' });

    service.clearServerErrors(form);

    expect(line1?.errors).toBeNull();
  });

  it('clearServerErrors recurses into FormArray children', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(FormErrorMapperService);
    const fb = new FormBuilder();
    const list = fb.array([fb.control(''), fb.control('')]);
    list.at(0).setErrors({ server: 'item0_required' });
    list.at(1).setErrors({ required: true });

    service.clearServerErrors(list);

    expect(list.at(0).errors).toBeNull();
    // Non-server errors on siblings must survive the clear.
    expect(list.at(1).errors?.['required']).toBe(true);
  });

  it('clearServerErrors strips cross-field server errors on a FormGroup container itself (#1041 reviewer)', () => {
    const { service, form } = setup();
    // Cross-field server error: validation on the GROUP, not on a
    // single control (mirrors `address.country_required_when_state_set`).
    form.get('address')?.setErrors({ server: 'country_required_when_state_set' });

    service.clearServerErrors(form);

    expect(form.get('address')?.errors).toBeNull();
  });
});
