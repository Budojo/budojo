import { Injectable } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';

/**
 * Laravel 422 → reactive-form field errors (#1035).
 *
 * The SPA's pattern before this service: client-side validation
 * (`required`, `email`, `minlength`) surfaces inline as `<small
 * class="field-error">` under the field; server-side 422 validation
 * (`email_taken`, `password_breached`) gets dumped into a top-of-form
 * `p-message` banner. Users on a long form scroll past the banner
 * and read the same field again with no inline cue — Norman's
 * feedback rule (signal the problem AT the source of the input).
 *
 * `mapServerErrors()` flattens the Laravel `errors.<field>[0]` shape
 * onto `FormControl.errors['server']` on every matched control. The
 * sibling `ServerErrorPipe` reads that key in the template, rendering
 * the same `<small class="field-error">` element used by client-side
 * validation. End result: 422 looks identical to a `Validators.email`
 * miss — same place, same shape.
 *
 * `clearServerErrors()` is the cleanup half. Without it, a retry
 * that resolves to 200 leaves the stale `server` error on the
 * control and the field stays "red" forever. Call it at the start
 * of every submit handler.
 *
 * Cross-field server errors (no matching control, e.g. `errors.general`)
 * fall through to the caller's existing `error()` signal / banner —
 * the service returns `false` only when NOTHING mapped, so the
 * caller can decide between inline-only vs. banner-fallback display.
 */
@Injectable({ providedIn: 'root' })
export class FormErrorMapperService {
  /**
   * Walks the 422 `errors` map and writes each first-message onto
   * the corresponding control under `errors['server']`. Returns
   * `true` if at least one control was matched — the caller can
   * skip the top-of-form banner when the surface is fully covered.
   *
   * @param form    the FormGroup that owns the controls
   * @param errors  Laravel's `errors.<field>: [messages]` shape
   *                from a 422 response. Field paths are dot-joined
   *                for nested groups (`address.line1`).
   */
  mapServerErrors(form: AbstractControl, errors: Record<string, readonly string[]>): boolean {
    let mapped = false;

    for (const [path, msgs] of Object.entries(errors)) {
      const first = msgs[0];
      if (!first) continue;

      const control = form.get(path);
      if (control === null) continue;

      // Merge with existing errors so client-side `required` /
      // `email` etc. survive the server-error overlay — the template
      // can decide which to render first (canonical order: client
      // first, server fallback).
      control.setErrors({ ...(control.errors ?? {}), server: first });
      // Force the field into a "touched" state so error display
      // bound to `(touched && hasError)` actually renders the
      // server error without a manual blur from the user.
      control.markAsTouched();
      mapped = true;
    }

    return mapped;
  }

  /**
   * Walks the form tree and strips the `server` error key from every
   * control's `errors` map. Idempotent — calling on a clean form is
   * a no-op. Designed to be invoked at the start of every submit
   * handler so a successful 2nd attempt clears the inline red ring.
   */
  clearServerErrors(form: AbstractControl): void {
    if (form instanceof FormGroup) {
      for (const child of Object.values(form.controls)) {
        this.clearServerErrors(child);
      }
      return;
    }

    const errs = form.errors;
    if (errs && 'server' in errs) {
      // Build the remaining error map; null out if it becomes empty
      // (an empty object marks the control as STILL invalid, which
      // is the opposite of what we want when only the server-error
      // was left).
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(errs)) {
        if (k !== 'server') rest[k] = v;
      }
      form.setErrors(Object.keys(rest).length > 0 ? rest : null);
    }
  }
}
