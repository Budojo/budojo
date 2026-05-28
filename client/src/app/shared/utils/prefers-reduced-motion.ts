/**
 * True when the user's OS / browser prefers reduced motion (#1074
 * motion convention).
 *
 * The CSS layer is caught globally by the
 * `@media (prefers-reduced-motion: reduce)` rule in `styles.scss` — that
 * disables every `transition: …` / `animation: …` declaration across the
 * app. But CSS can't override the `behavior` option passed to JS
 * `Element.scrollIntoView({ behavior: 'smooth' })` (the JS option wins),
 * so motion-bearing JS call sites gate on this helper before choosing
 * between `'smooth'` and `'auto'`.
 *
 * SSR-safe: returns `false` when `window` / `matchMedia` is unavailable.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
