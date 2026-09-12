#!/usr/bin/env node
//
// The two dead-style traps, as a check instead of a grep (#1472).
//
// `.claude/gotchas.md` describes both, and they are the same bug seen from
// opposite sides:
//
//   1. a class in a template with no rule — the element renders, unstyled,
//      and nothing looks broken in a test or a screenshot review;
//   2. a rule with no element — the styling is simply never applied.
//
// Between them they account for #1301, #1320, #1328, #1355 and #1428. The
// gotcha's own advice was "grep the SCSS before committing", and it noted
// that nothing lints it. A guard you have to remember is the guard that was
// missing on each of those five occasions.
//
// Deliberately NOT a CSS parser. It reads the two files as text, which is
// enough for the shape this codebase writes — BEM blocks with `&__element`
// nesting — and wrong in ways that are always SAFE: anything it cannot
// resolve it treats as used, so it under-reports rather than crying wolf. A
// check that fires on healthy code gets muted, and then it is worth nothing.
//
//   node .claude/scripts/dead-styles.mjs            # every component
//   node .claude/scripts/dead-styles.mjs athletes   # paths matching a filter
//
// Exit code is 1 when anything is reported, so it can gate later.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const ROOT = new URL("../../client/src", import.meta.url).pathname;
const filter = process.argv[2] ?? "";

/** Every `.html` that has a same-named `.scss` beside it. */
function componentPairs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...componentPairs(path));
    } else if (entry.endsWith(".component.html")) {
      const scss = path.replace(/\.html$/, ".scss");
      try {
        statSync(scss);
        out.push({ html: path, scss });
      } catch {
        // Componentless template or styles inline — nothing to compare.
      }
    }
  }
  return out;
}

/**
 * Class names a template puts on an element.
 *
 * Covers the three shapes this repo uses: a literal `class="a b"`, Angular's
 * `[class.foo]="cond"`, and `[ngClass]` / `styleClass` string literals. An
 * interpolated class — `class="pi {{ icon() }}"` — cannot be resolved from
 * text, so the interpolation is stripped and only the static part counted;
 * the dynamic half then shows up as an unused RULE, which is the safe way
 * round.
 */
function templateClasses(html) {
  const found = new Set();

  for (const m of html.matchAll(/\sclass="([^"]*)"/g)) {
    for (const c of m[1].replace(/\{\{[^}]*\}\}/g, " ").split(/\s+/)) {
      if (c) found.add(c);
    }
  }
  for (const m of html.matchAll(/\[class\.([A-Za-z0-9_-]+)\]/g)) {
    found.add(m[1]);
  }
  // `styleClass="x"` puts a class on a PrimeNG host exactly like `class` does,
  // and `[styleClass]="'x'"` is the bound form of the same thing. Missing
  // these reported every one of them as an unworn rule.
  for (const m of html.matchAll(/(?:ngClass|styleClass)="([^"']*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) found.add(c);
  }
  for (const m of html.matchAll(/\[(?:ngClass|styleClass)\]?="'([^']*)'/g)) {
    for (const c of m[1].split(/\s+/)) if (c) found.add(c);
  }
  return found;
}

/**
 * Class names an SCSS file defines, with `&__x` / `&--x` resolved against the
 * block they are nested in.
 *
 * The resolution is a stack of the most recent class selector at each brace
 * depth, which is how the nesting in this codebase is actually written. A
 * selector it cannot attribute is skipped rather than guessed at.
 */
function scssClasses(scss) {
  // Two sets, because the two directions need different answers.
  //
  //   `all`      — every name a selector mentions. A block that only hosts
  //                nested rules still styles nothing, but the element wearing
  //                it is not unstyled: the children are its styling.
  //   `declares` — names whose block sets at least one property of its own.
  //                Only these can be "a rule with no element"; calling a BEM
  //                namespace dead would report a healthy parent on every
  //                component in the app.
  const all = new Set();
  const declaring = new Set();
  const stack = [];
  const blocks = [];
  let depth = 0;

  // Tokenised on braces rather than read line by line, because a selector may
  // span several lines — `.full-name-th,\n.attendance-th {` is how two
  // headers share a rule here, and a line reader sees only the second half
  // and reports the first as unstyled.
  const text = scss
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  let buffer = "";

  for (const ch of text) {
    if (ch === "{") {
      const selector = buffer.split(";").pop().trim();
      // Parents are a LIST, because a comma group is several blocks sharing
      // one body: `.a, .b { &--on { … } }` defines `a--on` AND `b--on`.
      const parents = depth > 0 ? (stack[depth - 1] ?? []) : [];
      const own = [];

      for (const part of selector.split(",")) {
        const trimmed = part.trim();
        // `&X` is always parent-concatenated-with-X, whatever X starts
        // with. Special-casing `__` and `--` looked right and quietly broke
        // the suffix form: `&-cell` inside `&__legend` resolved to `-cell`
        // rather than `heatmap__legend-cell`, so the rule read as dead and
        // the class on the element read as unstyled — one mistake reported
        // twice, in opposite directions.
        const amp = trimmed.match(/^&([A-Za-z0-9_-]+)/);
        if (amp && parents.length) {
          for (const parent of parents) own.push(`${parent}${amp[1]}`);
          continue;
        }
        for (const m of trimmed.matchAll(/\.([A-Za-z0-9_-]+)/g)) own.push(m[1]);
      }

      // A block naming no class of its own — a media query, `:host`, a bare
      // element — keeps its parents so children still resolve `&`.
      for (const n of own) all.add(n);
      stack[depth] = own.length ? own : parents;
      blocks[depth] = { names: own, declares: false };
      depth += 1;
      buffer = "";
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
      const block = blocks[depth];
      // Only a block that DECLARES something is a rule. One that just hosts
      // nested children is a namespace — `.athlete-name { &__socials { … } }`
      // styles nothing itself, and calling its name dead would report a
      // healthy BEM parent as debt on every component in the app.
      if (block?.declares) for (const n of block.names) declaring.add(n);
      stack.length = Math.max(depth + 1, 1);
      blocks.length = Math.max(depth + 1, 1);
      buffer = "";
    } else {
      buffer += ch;
      // A `;` at this level closes a declaration belonging to the open block.
      if (ch === ";" && depth > 0 && blocks[depth - 1])
        blocks[depth - 1].declares = true;
    }
  }

  return { all, declaring };
}
/**
 * The contents of every partial a stylesheet pulls in with `@use` / `@import`.
 *
 * Resolved relative to the importer, trying the SCSS partial spellings in the
 * order sass does. A path that cannot be resolved is skipped rather than
 * guessed at — the cost of missing one is a false report, and the whole point
 * of this check is not making those.
 */
function importedPartials(scssPath) {
  const source = readFileSync(scssPath, "utf8");
  const out = [];

  for (const m of source.matchAll(/@(?:use|import)\s+'([^']+)'/g)) {
    const spec = m[1];
    if (spec.startsWith("sass:") || spec.startsWith("@")) continue;

    const dir = dirname(scssPath);
    const base = basename(spec);
    const parent = join(dir, dirname(spec));
    for (const candidate of [`_${base}.scss`, `${base}.scss`]) {
      const resolved = join(parent, candidate);
      try {
        statSync(resolved);
        out.push(resolved);
        break;
      } catch {
        // Next spelling.
      }
    }
  }
  return out;
}

/**
 * Classes defined in the GLOBAL stylesheets.
 *
 * A component template may legitimately wear a class its own SCSS never
 * mentions — the theme layer and the variant matrix both style by name across
 * the app. Without this the check would report every one of them.
 */
function globalClasses() {
  const dir = new URL("../../client/src/styles", import.meta.url).pathname;
  const names = new Set();
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const path = join(d, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith(".scss")) {
        for (const c of scssClasses(readFileSync(path, "utf8")).all)
          names.add(c);
      }
    }
  };
  try {
    walk(dir);
  } catch {
    // No global styles directory — every name then has to be local.
  }
  for (const c of scssClasses(
    readFileSync(
      new URL("../../client/src/styles.scss", import.meta.url).pathname,
      "utf8",
    ),
  ).all) {
    names.add(c);
  }
  return names;
}

/**
 * Class names the component applies from TypeScript.
 *
 * `[ngClass]="variantClass()"` with a computed `password-meter__bar-fill--
 * score-${s}` is a real Angular pattern, and the rule it lands on is not dead
 * — the template simply cannot show it. Reading the component's own `.ts` for
 * string literals that look like class names covers both the computed case
 * and the plain `'is-open'` one.
 *
 * Deliberately loose: it over-reports rather than under-reports, because a
 * missed name here is a false accusation of dead code, while an extra name is
 * only a check that stays quiet about one rule.
 */
function scriptClasses(htmlPath) {
  const names = new Set();
  const ts = htmlPath.replace(/\.html$/, ".ts");
  let source;
  try {
    source = readFileSync(ts, "utf8");
  } catch {
    return names;
  }
  // Any quoted or templated run that looks like a BEM-ish class name, plus
  // the literal prefix of a template string that interpolates its suffix.
  for (const m of source.matchAll(/['"`]([A-Za-z][A-Za-z0-9_-]*(?:__|--)[A-Za-z0-9_-]*)/g)) {
    names.add(m[1]);
  }
  return names;
}

/**
 * Classes a component styles on its OWN host — `:host(.compact)`.
 *
 * These are worn by a PARENT template (`<app-belt-badge class="compact">`) and
 * styled by the CHILD's stylesheet, so neither side sees the other and the
 * pairwise check reports both halves as dead. It is a real Angular pattern,
 * and the alternative — an allowlist of the three templates that use it — is
 * a list of the bugs we decided to keep.
 *
 * Collected across every component so one declaration covers every parent.
 */
function hostClasses(root) {
  const names = new Set();
  for (const { scss } of componentPairs(root)) {
    for (const source of [scss, ...importedPartials(scss)]) {
      let text;
      try {
        text = readFileSync(source, "utf8");
      } catch {
        continue;
      }
      for (const m of text.matchAll(/:host\s*\(([^)]*)\)/g)) {
        for (const c of m[1].matchAll(/\.([A-Za-z0-9_-]+)/g)) names.add(c[1]);
      }
    }
  }
  return names;
}

/**
 * Classes that legitimately appear on only one side.
 *
 * Every entry is a rule about the framework, not an excuse for a specific
 * component — an allowlist of names would rot into a list of the bugs we
 * decided to keep.
 */
const IGNORE = [
  /^p-/, // PrimeNG's own classes, styled globally or by the library.
  /^pi(-|$)/, // PrimeIcons.
  /^ng-/, // Angular's state classes: ng-invalid, ng-dirty, ng-star-inserted.
  /^(dark|light)$/, // Theme roots, set on <html>.
  /^cdk-/, // Angular CDK.
  /^budojo-/, // Global utilities from styles/, not component-scoped.
  /^(w|h|m[trblxy]?|p[trblxy]?|text|flex|grid|gap|justify|items)-/, // PrimeFlex.
];
const ignored = (c) => IGNORE.some((re) => re.test(c));

const GLOBAL = globalClasses();
const HOST = hostClasses(ROOT);

let problems = 0;
const report = [];

for (const { html, scss } of componentPairs(ROOT)) {
  if (filter && !html.includes(filter)) continue;

  const used = templateClasses(readFileSync(html, "utf8"));
  const own = scssClasses(readFileSync(scss, "utf8"));
  const defined = new Set(own.all);
  const declaring = new Set(own.declaring);

  // Follow `@use` / `@import`. Seven legal pages share `_legal-page.scss`
  // and pull it in this way; without following the import every class on all
  // seven reads as unstyled, which is most of what this check found on its
  // first run.
  for (const partial of importedPartials(scss)) {
    const from = scssClasses(readFileSync(partial, "utf8"));
    for (const c of from.all) defined.add(c);
    // A partial's rules are shared by every page that pulls it in, so an
    // unworn name there is not this component's to answer for.
    for (const c of from.declaring) declaring.delete(c);
  }

  const unstyled = [...used].filter(
    (c) => !ignored(c) && !defined.has(c) && !GLOBAL.has(c) && !HOST.has(c),
  );
  // A rule can be worn by a class the TEMPLATE never spells out, because the
  // component built the name in TypeScript.
  const fromScript = scriptClasses(html);
  const unused = [...declaring].filter(
    (c) =>
      !ignored(c) &&
      !used.has(c) &&
      !fromScript.has(c) &&
      ![...fromScript].some((prefix) => c.startsWith(prefix)),
  );

  if (unstyled.length || unused.length) {
    problems += unstyled.length + unused.length;
    const name = basename(dirname(html));
    report.push({
      name,
      html: html.replace(ROOT, "client/src"),
      unstyled,
      unused,
    });
  }
}

for (const r of report.sort((a, b) => b.unstyled.length - a.unstyled.length)) {
  console.log(`\n${r.html}`);
  if (r.unstyled.length)
    console.log(`  in the template, no rule:  ${r.unstyled.join(", ")}`);
  if (r.unused.length)
    console.log(`  in the stylesheet, unworn: ${r.unused.join(", ")}`);
}

console.log(
  `\n${report.length} component(s), ${problems} name(s) on one side only.` +
    (problems
      ? "\nEach is either a style that never applies or one that never had an element."
      : ""),
);
process.exit(problems ? 1 : 0);
