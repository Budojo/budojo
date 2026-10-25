import { DOCUMENT, DestroyRef, inject } from '@angular/core';

/**
 * Keeps a PrimeNG dialog on screen while `busy()` says so (#2133 review).
 *
 * The dialog binds Escape and the mask click once, when it opens, and never
 * reads `closeOnEscape` or `dismissableMask` again: binding them to a saving
 * flag does nothing. So both are stopped here instead, in the capture phase,
 * before the dialog hears them. Hide the ✕ with `[closable]` as usual.
 *
 * `dialogClass` is the dialog's own `styleClass`, which names its mask: the
 * mask is the element the dialog sits directly in. Call it in an injection
 * context; the listeners go with the host.
 */
export function holdDialogWhile(busy: () => boolean, dialogClass: string): void {
  const document = inject(DOCUMENT);
  const hold = (event: Event): void => {
    if (!busy()) return;
    const escape = event instanceof KeyboardEvent && event.key === 'Escape';
    const mask =
      event.type === 'mousedown' &&
      event.target instanceof Element &&
      event.target.querySelector(`:scope > .${dialogClass}`) !== null;
    if (escape || mask) event.stopPropagation();
  };
  document.addEventListener('keydown', hold, true);
  document.addEventListener('mousedown', hold, true);
  inject(DestroyRef).onDestroy(() => {
    document.removeEventListener('keydown', hold, true);
    document.removeEventListener('mousedown', hold, true);
  });
}
