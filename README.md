# SVG Cleaner

Clean and prepare SVGs for inline use, icon systems, standalone files and CSS. One dependency-free engine, consumed two ways: a Node CLI and a browser global.

Every piece of SVG-processing logic lives in `src/core.js` — projects consume this package rather than carrying their own copy, so features and fixes land once and every project picks them up with a version bump.

## Install

Private repo — install as a git dependency:

```json
"devDependencies": {
  "@bydefaultstudio/svg-cleaner": "github:bydefaultstudio/svg-cleaner#v1.0.0"
}
```

Update by bumping the tag and running `npm install`.

## CLI

Reads SVG from stdin, writes the cleaned result to stdout (or a file with `-o`).

```bash
# Inline SVG: strips xmlns, 100% sizing, theme-ready fills
cat logo.svg | svg-cleaner --current-color

# Icon, wrapped and named
cat icon.svg | svg-cleaner --current-color --icon --icon-name "arrow-right"

# Standalone .svg file (keeps colours and dimensions, re-adds xmlns)
cat logo.svg | svg-cleaner --standalone -o assets/images/logo-primary.svg

# CSS background-image data URI
cat pattern.svg | svg-cleaner --css --css-format basic
```

Run `svg-cleaner --help` for the full flag list.

### Modes (mutually exclusive)

| Mode | Output |
|---|---|
| default (inline) | Bare `<svg>` ready to paste into HTML — xmlns stripped, `width/height="100%"` |
| `--icon` | Inline SVG wrapped in an icon div with a name attribute |
| `--logo` | Inline SVG wrapped in a logo div with a computed `aspect-ratio` |
| `--standalone` | A complete `.svg` file — XML declaration, xmlns, original dimensions |
| `--css` | A `url('data:image/svg+xml,…')` value, optionally wrapped in a CSS snippet |

### Project conventions

Wrapper class and attribute names are configurable. Commit a `svg-cleaner.config.json` at the project root and every invocation in that project uses its conventions (flags still override):

```json
{
  "iconClass": "svg-icn",
  "iconAttr": "data-icon",
  "logoClass": "svg-logo",
  "logoAttr": "data-logo"
}
```

## Browser

`src/core.js` is a UMD module — load it with a `<script>` tag and it exposes `window.SvgCleaner`:

```html
<script src="core.js"></script>
<script>
  var cleaned = SvgCleaner.processSVG(raw, { currentColor: true, icon: true, iconName: 'star' });
</script>
```

The API surface is `processSVG(svg, options)`, `sanitiseSVG(svg)`, `sanitiseReport(svg)`, `sanitiseName(name)`, `svgToDataURI(svg)`, `wrapCSSHelper(uri, format)`, plus `VERSION`, `DEFAULTS` and `MAX_INPUT_BYTES`.

## Security

- **Sanitising is on by default.** The sanitise pass removes script execution vectors: `<script>` blocks, `on*` event handler attributes (quoted or not), `javascript:` and `data:text/html` URLs in any attribute (entity-encoded or not), `<foreignObject>`, and any element that is not SVG. Declarative animation — CSS keyframes in `<style>`, SMIL `<animate>` elements — is untouched.
- **Nothing is removed silently.** The CLI reports what sanitising removed on stderr; `sanitiseReport()` gives UIs the same information. Disable with `--no-sanitise` only for trusted, deliberately scripted SVGs.
- **Everything runs locally.** The CLI processes stdin on your machine; the browser build processes in-page. No network, no uploads, no storage.
- **Zero dependencies**, and it stays that way — there is no supply chain to compromise.
- **Untrusted SVG must never be rendered live.** UIs built on this package keep input/output in inert text fields and preview only via `<img>`/blob URLs, where the browser guarantees scripts cannot run.
- **Known limit:** the sanitise pass tokenises tags the way a browser does and writes them back in a form HTML and XML parsers agree on, but it is not a full XML parser (see DESIGN.md). Do not use it as the only defence when embedding SVG from genuinely hostile sources.

Inputs over 2MB are refused — this tool targets hand-authored SVGs, not large exports.

Process one SVG at a time: the cleaner treats the whole paste as a single SVG document (nested `<svg>` viewports inside it are preserved; two separate SVGs in one paste are not supported).

## Web tool

`docs/` is the public-facing tool — a fully static page, no build step. It works straight from disk (open `docs/index.html`), and when the repo goes public it deploys with GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `docs`**. Same layout as the original: pick a mode, paste, copy. Additions: a visible Sanitise toggle with a status line reporting what was removed, and wrapper settings saved per-browser. The CSP ships in the page as a meta tag since Pages can't send headers.

Two vendored files live in `docs/assets`, neither hand-edited:
- `js/svg-cleaner-core.js` — synced from `src/core.js` on `npm install`; `npm test` fails if it drifts
- `css/design-system.css` — a copy of the By Default design system (engine defaults, system fonts); re-copy manually on design-system upgrades

## Development

```bash
npm test   # assert-based self-check, core + CLI
```

`DESIGN.md` records the decisions and trade-offs; `CHANGELOG.md` tracks every release.
