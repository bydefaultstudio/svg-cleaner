/**
 * Script Purpose: Self-check for the SVG Cleaner core and CLI — assert-based, no framework
 * Author: By Default Studio
 * Created: 2026-07-23
 * Version: 1.0.0
 *
 * Run: npm test  (or: node test/check.js)
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cleaner = require('../src/core.js');

const { processSVG, sanitiseSVG, sanitiseReport, sanitiseName, svgToDataURI } = cleaner;

const BASIC = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="#000" d="M0 0h24v24H0z"/></svg>';

//
//------- Core: cleaning -------//
//

// xmlns stripped in inline mode, 100% sizing applied
let out = processSVG(BASIC, { size: true });
assert(!out.includes('xmlns'), 'inline strips xmlns');
assert(out.includes('width="100%" height="100%"'), 'inline applies 100% sizing');
assert(!out.includes('width="24"'), 'inline removes original width');

// standalone re-adds xmlns + XML declaration, keeps dimensions
out = processSVG(BASIC, { standalone: true, size: false });
assert(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'standalone adds XML declaration');
assert(out.includes('xmlns="http://www.w3.org/2000/svg"'), 'standalone re-adds xmlns');
assert(out.includes('width="24"'), 'standalone keeps original width');

// viewBox fallback: width/height derived when missing and size off
out = processSVG('<svg viewBox="0 0 100 50"><path d="M0 0"/></svg>', { size: false });
assert(out.includes('width="100"') && out.includes('height="50"'), 'derives dimensions from viewBox');

// currentColor: replaces fills, adds when missing, rewrites style fills
out = processSVG(
  '<svg viewBox="0 0 1 1"><path fill="#f00" d="M0 0"/><rect d="x"/><circle style="fill: red; stroke: blue"/></svg>',
  { currentColor: true }
);
assert(!out.includes('#f00'), 'replaces fill attribute');
assert((out.match(/fill="currentColor"/g) || []).length >= 3, 'all shapes get currentColor');
assert(out.includes('fill: currentColor'), 'rewrites style fill');
assert(out.includes('stroke: blue'), 'leaves other style properties alone');

// re-cleaning already-wrapped markup extracts the inner svg
out = processSVG('<div class="svg-icn">\n  ' + BASIC + '\n</div>', { icon: true, iconName: 'x' });
assert(out.indexOf('<div') === 0 && out.indexOf('<svg') > 0, 'strips existing wrapper before re-wrapping');
assert((out.match(/<div/g) || []).length === 1, 'does not double-wrap');

// currentColor must not touch <linearGradient> (the "line" prefix collision)
out = processSVG(
  '<svg viewBox="0 0 1 1"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><path fill="url(#g)" d="M0 0"/><line x1="0"/></svg>',
  { currentColor: true }
);
assert(!/<linearGradient[^>]*currentColor/.test(out), 'currentColor leaves gradient elements alone');
assert(/<line x1="0" fill="currentColor"\/>/.test(out), '<line> itself still gets currentColor');

// single-quoted attributes are cleaned like double-quoted ones
out = processSVG(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'><path fill='#000' d='M0 0'/></svg>",
  { size: true, currentColor: true }
);
assert(!out.includes('xmlns'), 'strips single-quoted xmlns');
assert(!out.includes('#000') && out.includes('fill="currentColor"'), 'converts single-quoted fills');
assert(!out.includes("width='24'"), 'removes single-quoted dimensions');

//
//------- Core: wrappers + conventions -------//
//

// icon wrap with default conventions
out = processSVG(BASIC, { icon: true, iconName: 'Arrow Right!' });
assert(out.includes('<div class="svg-icn">'), 'icon wraps with default class');
assert(out.includes('data-icon="arrow-right"'), 'icon name sanitised into default attribute');

// custom wrapper conventions
out = processSVG(BASIC, { icon: true, iconName: 'star', iconClass: 'my-icon', iconAttr: 'data-glyph' });
assert(out.includes('<div class="my-icon">'), 'custom icon class respected');
assert(out.includes('data-glyph="star"'), 'custom icon attribute respected');

// logo wrap: aspect-ratio from attributes, custom attr
out = processSVG(BASIC, { logo: true, logoName: 'brand', logoAttr: 'data-brand' });
assert(out.includes('aspect-ratio: 24 / 24'), 'logo aspect-ratio from width/height');
assert(out.includes('data-brand="brand"'), 'custom logo attribute respected');
assert(out.includes('class="svg-logo"'), 'logo default class');

// logo aspect-ratio falls back to viewBox
out = processSVG('<svg viewBox="0 0 200 50"><path d="M0 0"/></svg>', { logo: true, logoName: 'wide' });
assert(out.includes('aspect-ratio: 200 / 50'), 'logo aspect-ratio from viewBox fallback');

// dimension units: px is stripped, percentages fall back to viewBox
out = processSVG('<svg width="24px" height="12px" viewBox="0 0 24 12"><path d="M0 0"/></svg>', { logo: true, logoName: 'x' });
assert(out.includes('aspect-ratio: 24 / 12'), 'px units stripped for aspect-ratio');
out = processSVG('<svg width="100%" height="100%" viewBox="0 0 200 50"><path d="M0 0"/></svg>', { logo: true, logoName: 'x' });
assert(out.includes('aspect-ratio: 200 / 50'), 'percentage dimensions fall back to viewBox');

//
//------- Core: sanitise -------//
//

const HOSTILE = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">'
  + '<script>alert(2)</script>'
  + '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="alert(3)"></body></foreignObject>'
  + '<a href="javascript:alert(4)"><text>click</text></a>'
  + '<a href=\'data:text/html,<script>alert(5)</script>\'><text>x</text></a>'
  + '<style>@keyframes spin { to { transform: rotate(1turn) } }</style>'
  + '<circle r="5"><animate attributeName="r" values="5;10;5" dur="2s"/></circle>'
  + '</svg>';

out = sanitiseSVG(HOSTILE);
assert(!out.includes('<script'), 'sanitise removes script blocks');
assert(!out.includes('onload'), 'sanitise removes event handlers');
assert(!out.includes('onerror'), 'sanitise removes handlers inside foreignObject');
assert(!out.includes('foreignObject'), 'sanitise removes foreignObject');
assert(!out.includes('javascript:'), 'sanitise removes javascript: links');
assert(!out.includes('data:text/html'), 'sanitise removes data:text/html links');
assert(out.includes('@keyframes spin'), 'sanitise keeps CSS keyframes');
assert(out.includes('<animate'), 'sanitise keeps SMIL animation');

// The regex pass this replaced missed every one of these. Each must lose its
// script vector. (For 1.2.0 the same payloads, and more, were also loaded in
// Chromium inline and as .svg files after sanitising; none ran.)
const BYPASSES = [
  ['unquoted handler', '<svg onload=alert(1)><path d="M0"/></svg>', /onload/i],
  ['slash-separated handler', '<svg/onload=alert(1)>', /onload/i],
  ['mixed-case handler', "<svg><path ONLOAD='alert(1)'/></svg>", /onload/i],
  ['newline before =', '<svg><g onclick\n=alert(1)></g></svg>', /onclick/i],
  ['unquoted javascript: link', '<svg><a href=javascript:alert(1)><rect/></a></svg>', /javascript/i],
  ['entity-encoded scheme', '<svg><a href="&#x6A;avascript:alert(1)"><rect/></a></svg>', /avascript/i],
  ['named-entity scheme', '<svg><a href="java&Tab;script&colon;alert(1)"><rect/></a></svg>', /script&colon/i],
  ['SMIL set to javascript:', '<svg><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>', /javascript/i],
  ['SMIL values list', '<svg><a><animate attributeName="href" values="#;javascript:alert(1)"/></a></svg>', /javascript/i],
  ['prefixed script', '<svg><x:script xmlns:x="http://www.w3.org/2000/svg">alert(1)</x:script></svg>', /alert/],
  ['HTML breakout element', '<svg><p><img src=x onerror=alert(1)></p></svg>', /<img|<p/i],
  ['handler hidden in a style element', '<svg><style><img src=x onerror=alert(1)></style></svg>', /onerror|<img/i],
  ['XHTML namespace switch', '<svg><g xmlns="http://www.w3.org/1999/xhtml"><a href="#">x</a></g></svg>', /1999\/xhtml/],
  ['DOCTYPE entity expansion', '<!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]><svg>&x;</svg>', /ENTITY|<script/],
  ['data: document in <use>', '<svg><use href="data:image/svg+xml;base64,AAAA#x"/></svg>', /data:/],
];
BYPASSES.forEach(function (c) {
  assert(!c[2].test(sanitiseSVG(c[1])), 'sanitise closes: ' + c[0]);
  assert(sanitiseReport(c[1]).length > 0, 'report flags: ' + c[0]);
});

// Comment and attribute tricks that make HTML and XML disagree are written
// back in a form both read the same way
out = sanitiseSVG('<svg><!--><img src=x onerror=alert(1)>--></svg>');
assert(!/<img/.test(out) && /^<svg><!--[^<>]*--><\/svg>$/.test(out), 'comment cannot end early in HTML');
out = sanitiseSVG('<svg><text aria-label="</style><img src=x onerror=alert(1)>">x</text></svg>');
assert(!/<\/style><img/.test(out) && out.includes('&lt;/style&gt;'), 'angle brackets escaped inside values');

// Inline in a page, HTML parses whatever sits outside the root and inside
// <title>/<desc> as HTML: <image name="cookie"> there shadows document.cookie
out = sanitiseSVG('<svg><title><a href="#">t</a><image name="cookie"/></title></svg>');
assert(out === '<svg><title></title></svg>', 'title and desc keep text only');
assert(sanitiseReport('<svg><desc><style>body{}</style></desc></svg>').includes('elements inside title or desc'), 'report flags elements in desc');
out = sanitiseSVG('<a name="cookie">x</a><svg><path d="M0"/></svg><image name="cookie"/>');
assert(out === '<svg><path d="M0"/></svg>', 'nothing kept outside the one root svg');
assert(sanitiseReport('<svg></svg><a>x</a>').includes('content outside the root svg'), 'report flags content after the root');
assert(sanitiseSVG('<svg><title>Fish &amp; chips</title></svg>') === '<svg><title>Fish &amp; chips</title></svg>', 'title text kept');

// data: URLs load documents; only an image may take one, as an image
out = sanitiseSVG('<svg><a href="data:image/svg+xml,x"><rect/></a><image href="data:image/png;base64,AA"/></svg>');
assert(!out.includes('svg+xml') && out.includes('data:image/png'), 'data: kept on image only');
out = sanitiseSVG('<svg><set attributeName="onclick" to="x"/></svg>');
assert(!/attributeName/.test(out), 'SMIL cannot target a handler');

// XML well-formedness: bare & and form feeds
out = sanitiseSVG('<svg>\f<g\fid="a"\f>a & b</g></svg>');
assert(out === '<svg> <g id="a" >a &amp; b</g></svg>', 'bare & escaped, form feeds become spaces');

// Many declarations stay linear (this was quadratic: 7s at 1.6MB)
const started = Date.now();
sanitiseSVG('<!a>'.repeat(400000));
assert(Date.now() - started < 2000, 'declarations scan in linear time');
out = sanitiseSVG('<svg><style><![CDATA[a > b { fill: red }]]></style></svg>');
assert(out === '<svg><style>a &gt; b { fill: red }</style></svg>', 'CDATA becomes escaped text');

// Ordinary exports pass through: nothing reported, formatting kept
const EXPORT = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Adobe Illustrator -->\n'
  + '<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 10 10">\n'
  + '  <sodipodi:namedview pagecolor="#fff"/>\n'
  + "  <defs><linearGradient id='g'><stop offset='0'/></linearGradient></defs>\n"
  + '  <a href="#top"><path class="st0" d="M0 0h10v10H0z"/></a>\n'
  + '</svg>';
assert.strictEqual(sanitiseSVG(EXPORT), EXPORT, 'a clean export passes through unchanged');
assert.strictEqual(sanitiseReport(EXPORT).length, 0, 'a clean export reports nothing');
out = sanitiseSVG('<svg><g data-motion><path d="M0"/></g></svg>');
assert(out.includes('data-motion=""'), 'valueless attribute gets an empty value');
assert(sanitiseSVG('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd"><svg/>') === '<svg/>', 'plain DOCTYPE dropped silently');
assert(sanitiseReport('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd"><svg/>').length === 0, 'plain DOCTYPE not reported');

// sanitise runs inside processSVG when enabled, not otherwise
out = processSVG(HOSTILE, { sanitise: true });
assert(!out.includes('<script'), 'processSVG sanitises when enabled');
out = processSVG(HOSTILE, { sanitise: false });
assert(out.includes('<script'), 'processSVG keeps content when sanitise off');

// report lists what would be removed, without modifying anything
const report = sanitiseReport(HOSTILE);
assert(report.includes('script blocks'), 'report flags scripts');
assert(report.includes('event handler attributes'), 'report flags handlers');
assert(sanitiseReport(BASIC).length === 0, 'clean SVG yields empty report');

//
//------- Core: optional passes -------//
//

out = processSVG('<svg viewBox="0 0 1 1"><path d="M0.123456 0.987654"/></svg>', { precision: 2 });
assert(out.includes('M0.12 0.99'), 'precision rounds decimals');

// out-of-range precision is clamped, not thrown
out = processSVG('<svg viewBox="0 0 1 1"><path d="M0.6 0"/></svg>', { precision: -1 });
assert(out.includes('M1 0'), 'negative precision clamps to 0');

out = processSVG('<svg viewBox="0 0 1 1">\n  <path d="M 0 0, L 10 10"/>\n</svg>', { minify: true });
assert(!out.includes('\n'), 'minify collapses to one line');
assert(out.includes('d="M0 0 L10 10"'), 'minify optimises path data');

out = processSVG('<svg viewBox="0 0 1 1"><!-- exported by illustrator --><path data-name="Layer 1" class="cls-1" d="M0 0"/></svg>', { stripComments: true, stripMetadata: true });
assert(!out.includes('<!--'), 'strips comments');
assert(!out.includes('data-name') && !out.includes('cls-1'), 'strips editor metadata');

// css mode: data URI with encoded hash, xmlns present
out = processSVG('<svg viewBox="0 0 1 1"><path fill="#f00" d="M0 0"/></svg>', { css: true, cssFormat: 'basic' });
assert(out.startsWith('background-image: url(\'data:image/svg+xml,'), 'css basic format');
assert(out.includes('%23f00'), 'css mode encodes hash characters');
assert(out.includes('xmlns'), 'css mode keeps xmlns (parsed as XML)');

assert(sanitiseName('Ärrow  Right / 2!') === 'rrow-right-2', 'sanitiseName collapses specials');
assert(svgToDataURI('<svg>#?</svg>').includes('%23%3F'), 'data URI encodes # and ?');

//
//------- CLI -------//
//

const BIN = path.join(__dirname, '..', 'bin', 'svg-cleaner.js');

function runCLI(args, input, cwd) {
  return execFileSync('node', [BIN].concat(args), { input, cwd, encoding: 'utf8' });
}

out = runCLI(['--current-color', '--icon', '--icon-name', 'arrow-right'], BASIC);
assert(out.includes('data-icon="arrow-right"') && out.includes('svg-icn'), 'CLI icon mode works');

// sanitise is on by default in the CLI
out = runCLI([], HOSTILE);
assert(!out.includes('<script'), 'CLI sanitises by default');
out = runCLI(['--no-sanitise'], HOSTILE);
assert(out.includes('<script'), 'CLI --no-sanitise keeps content');

// config file sets project conventions; flags still win
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-cleaner-'));
fs.writeFileSync(path.join(tmp, 'svg-cleaner.config.json'), JSON.stringify({ iconClass: 'brand-icon', iconAttr: 'data-glyph' }));
out = runCLI(['--icon', '--icon-name', 'star'], BASIC, tmp);
assert(out.includes('class="brand-icon"') && out.includes('data-glyph="star"'), 'config file conventions applied');
out = runCLI(['--icon', '--icon-name', 'star', '--icon-class', 'override'], BASIC, tmp);
assert(out.includes('class="override"'), 'flags override config file');
fs.rmSync(tmp, { recursive: true, force: true });

// mutually exclusive modes rejected
let failed = false;
try {
  runCLI(['--icon', '--logo'], BASIC, undefined);
} catch (e) {
  failed = true;
}
assert(failed, 'CLI rejects combined modes');

//
//------- Web tool -------//
//

// the vendored browser engine must be in lockstep with src/core.js
// (GitHub Pages serves the committed copy — there is no build step to sync it)
assert.strictEqual(
  fs.readFileSync(path.join(__dirname, '..', 'docs', 'assets', 'js', 'svg-cleaner-core.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8'),
  'docs/assets/js/svg-cleaner-core.js is out of sync with src/core.js — run npm install'
);

console.log('All checks passed.');
