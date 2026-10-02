/**
 * PostCSS plugin (#2034): every `:hover` rule of ours applies only where
 * there is a pointer that hovers, `@media (hover: hover)`.
 *
 * On a touch screen a tap leaves the pointer where it was, so a hover style
 * sticks after the finger has gone: a tapped row or chip looks selected when
 * it is not. Writing the media query by hand in 130-odd rules would be
 * forgotten in the next one, so the build adds it. A rule whose selector list
 * mixes hover and non-hover selectors is split, and only the hover half is
 * gated; one already inside `(hover: hover)` is left alone.
 *
 * Wired by `client/postcss.config.json`, which the Angular builder reads.
 * PrimeNG's own styles are injected at runtime and never pass through here;
 * `src/styles/_touch-hover-tokens.scss` handles those.
 */
const QUERY = '(hover: hover)';

const insideHoverQuery = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'media' && parent.params.includes(QUERY)) {
      return true;
    }
  }
  return false;
};

const insideKeyframes = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true;
  }
  return false;
};

const plugin = () => ({
  postcssPlugin: 'budojo-hover-gate',
  Once(root, { AtRule }) {
    root.walkRules((rule) => {
      if (!rule.selector.includes(':hover') || insideHoverQuery(rule) || insideKeyframes(rule)) {
        return;
      }
      const hover = rule.selectors.filter((s) => s.includes(':hover'));
      const rest = rule.selectors.filter((s) => !s.includes(':hover'));
      const gated = rule.clone({ selectors: hover });
      const media = new AtRule({ name: 'media', params: QUERY });
      media.append(gated);
      rule.after(media);
      if (rest.length > 0) rule.selectors = rest;
      else rule.remove();
    });
  },
});
plugin.postcss = true;

module.exports = plugin;
