# Design Decisions

The thinking behind the SVG Cleaner, recorded so future changes stay coherent.

## One engine, many surfaces

All processing lives in `src/core.js`. The CLI, the browser tool, and any future
surface are thin wrappers that collect options and call `processSVG()`. History
justifies the rule: this tool previously lived as two independently-edited copies
(a CLI and a browser script) that drifted three major versions apart. Any change
that adds logic to a wrapper instead of the core is wrong.

The core is UMD (plain script + CommonJS) with zero dependencies and no build
step. That keeps it loadable from a `<script>` tag on a static page, requireable
from Node, and free of any supply chain.

## Modes model the destination, not the transformation

A user doesn't think "strip xmlns and force percentage sizing" — they think
"this is going to be an icon". Modes are destinations:

- **inline** — pasted into HTML markup
- **icon** — inline, wrapped and named for an icon system
- **logo** — inline, wrapped with a computed `aspect-ratio` so layout never shifts
- **standalone** — saved as a `.svg` file, referenced via `<img>`
- **css** — embedded in a stylesheet as a data URI

Modes are mutually exclusive. Passes (currentColor, comments, metadata,
precision, minify, sanitise) compose freely under any mode. An "illustration"
is not a mode — it's inline/standalone with original colours kept.

## Conventions are configuration, not code

Wrapper class names (`svg-icn`, `svg-logo`) and attribute names (`data-icon`,
`data-logo`) are By Default's conventions — good defaults, but other projects
have their own. They are options with defaults (`DEFAULTS` in the core),
settable per-project via `svg-cleaner.config.json`. No project should fork the
tool to change a class name.

## Sanitise by default, never silently

SVG is an active format: it can carry `<script>`, event handlers, `javascript:`
links and `<foreignObject>` HTML. The cleaner's output is destined for inline
embedding in someone's page, so shipping those through would hand an attack
vector downstream. Hence:

- The sanitise pass is **on by default** in every surface.
- It removes only script *execution* vectors. Declarative animation (CSS
  keyframes, SMIL) passes through untouched — cleaning must never break an
  animated SVG.
- Removal is always reported (`sanitiseReport()`, CLI stderr). A tool that
  silently deletes content teaches users not to trust it.
- `--no-sanitise` exists because deliberately scripted SVGs are legitimate;
  the flag is an informed opt-out, not a hidden default.

## Regex, not a parser

The engine transforms text with regular expressions. This is a deliberate
trade-off: zero dependencies, no build, runs anywhere, and the input domain is
"an SVG a designer just exported", not adversarial markup. The known costs:

- Pathological or deeply malformed SVG can confuse the transforms.
- The sanitise pass is a best-effort defence, not a guarantee — anything
  security-critical must also rely on browser-enforced boundaries (render
  untrusted SVG only in `<img>`/blob contexts, where scripts cannot run).
- The 2MB input cap bounds worst-case regex time.

If the tool ever needs to handle untrusted input at scale, the upgrade path is
swapping the engine's internals for a real parser behind the same
`processSVG()` API — the wrappers and tests stay.

## UI rules (for any surface built on this)

- Input and output live in inert text fields — never `innerHTML` user SVG.
- Preview only via `<img src="blob:…">`: the browser's image context blocks
  script execution and external fetches by specification.
- State what sanitising removed, visibly.
- The web tool runs fully client-side — "your SVG never leaves this page" is a
  guarantee the architecture makes, not a promise.
