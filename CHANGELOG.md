# Changelog

## 1.0.0 — 2026-07-23

First release as a standalone package. Consolidates the two implementations
that previously lived in the design-system repo (`assets/js/svg-clean.js`
v1.4.0 and `assets/js/svg-cleaner.js` v3.3.0) into one shared engine.

- `src/core.js` — single UMD engine for Node and browser, superset of both
  prior versions (including the CSS data-URI mode from the browser build)
- `bin/svg-cleaner.js` — CLI with all prior flags plus:
  - `--icon-class`, `--icon-attr`, `--logo-class`, `--logo-attr` — per-project
    wrapper conventions
  - `svg-cleaner.config.json` support (flags override config)
  - `--css` / `--css-format` — CSS data-URI output from the CLI
  - modes are now validated as mutually exclusive
- New: sanitise pass, on by default (`--no-sanitise` to opt out) — strips
  `<script>`, `on*` handlers, `javascript:`/`data:text/html` links and
  `<foreignObject>`; keeps CSS keyframes and SMIL animation; always reports
  what it removed
- New: 2MB input cap
- `test/check.js` — assert-based spec for core and CLI
- Fixes bugs inherited from both originals: `currentColor` no longer injects
  a fill into `<linearGradient>` (the `line` prefix collision), single-quoted
  attributes are now cleaned like double-quoted ones, logo `aspect-ratio` no
  longer emits invalid CSS when width/height carry units (falls back to
  viewBox), and out-of-range `--precision` values are clamped instead of
  throwing
