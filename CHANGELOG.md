# Changelog

## 1.1.0 — 2026-07-23

- New: `docs/` — the public web tool, a fully static page served by GitHub
  Pages once the repo is public (works straight from disk too, no build).
  Mirrors the original tool's layout (modes, toggles, paste → output) with
  three additions: a visible Sanitise toggle (on by default) with a status
  line reporting what was removed in every mode including image saves,
  wrapper settings (icon/logo class and attribute names, saved in the
  browser), and a 2MB input guard. Fully client-side — no uploads, no
  network calls, CSP shipped as a meta tag.
- `docs/assets/css/design-system.css` is a vendored copy of the By Default
  design system (engine defaults, system font stacks). Re-copy on upgrade —
  the design-system package's git install ships no dist, so it cannot be
  synced automatically yet.
- `docs/assets/js/svg-cleaner-core.js` is synced from `src/core.js` on
  `npm install` and guarded by the test suite — never edit it directly.

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
