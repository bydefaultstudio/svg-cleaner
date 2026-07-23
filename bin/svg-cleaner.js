#!/usr/bin/env node

/**
 * Script Purpose: CLI for the SVG Cleaner — reads SVG from stdin, writes cleaned output
 * Author: By Default Studio
 * Created: 2026-07-23
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');
const cleaner = require('../src/core.js');

console.error(`svg-cleaner v${cleaner.VERSION}`);

//
//------- Config -------//
//

// Option keys a config file may set (project conventions + default passes)
const CONFIG_KEYS = [
  'iconClass', 'iconAttr', 'logoClass', 'logoAttr',
  'sanitise', 'currentColor', 'stripComments', 'stripMetadata', 'precision', 'minify',
];

// Load Config File (explicit --config path, or ./svg-cleaner.config.json when present)
function loadConfig(argv) {
  const idx = argv.indexOf('--config');
  const explicit = idx !== -1 ? argv[idx + 1] : null;
  const file = explicit || 'svg-cleaner.config.json';
  const resolved = path.resolve(process.cwd(), file);

  if (!fs.existsSync(resolved)) {
    if (explicit) {
      console.error(`Error: Config file not found: ${explicit}`);
      process.exit(1);
    }
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const config = {};
    for (const key of CONFIG_KEYS) {
      if (key in parsed) config[key] = parsed[key];
    }
    return config;
  } catch (err) {
    console.error(`Error: Could not parse ${file}: ${err.message}`);
    process.exit(1);
  }
}

//
//------- CLI Arguments -------//
//

// Parse CLI Arguments (config values act as defaults; flags override)
function parseArgs(argv, config) {
  const args = argv.slice(2);
  const options = {
    sanitise: true,
    currentColor: false,
    icon: false,
    iconName: null,
    logo: false,
    logoName: null,
    size: null,
    standalone: false,
    css: false,
    cssFormat: 'url',
    stripComments: false,
    stripMetadata: false,
    precision: null,
    minify: false,
    output: null,
    ...config,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--current-color':
        options.currentColor = true;
        break;
      case '--icon':
        options.icon = true;
        break;
      case '--icon-name':
        options.iconName = args[++i];
        break;
      case '--icon-class':
        options.iconClass = args[++i];
        break;
      case '--icon-attr':
        options.iconAttr = args[++i];
        break;
      case '--logo':
        options.logo = true;
        break;
      case '--logo-name':
        options.logoName = args[++i];
        break;
      case '--logo-class':
        options.logoClass = args[++i];
        break;
      case '--logo-attr':
        options.logoAttr = args[++i];
        break;
      case '--size':
        options.size = true;
        break;
      case '--keep-size':
        options.size = false;
        break;
      case '--standalone':
        options.standalone = true;
        break;
      case '--css':
        options.css = true;
        break;
      case '--css-format':
        options.cssFormat = args[++i];
        break;
      case '--sanitise':
      case '--sanitize':
        options.sanitise = true;
        break;
      case '--no-sanitise':
      case '--no-sanitize':
        options.sanitise = false;
        break;
      case '--strip-comments':
        options.stripComments = true;
        break;
      case '--strip-metadata':
        options.stripMetadata = true;
        break;
      case '--precision':
        options.precision = parseInt(args[++i], 10);
        break;
      case '--minify':
        options.minify = true;
        break;
      case '--config':
        i++; // already consumed by loadConfig
        break;
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown flag: ${args[i]}`);
        process.exit(1);
    }
  }

  // Modes are mutually exclusive
  const modes = [options.icon, options.logo, options.css].filter(Boolean).length;
  if (modes > 1 || (options.standalone && (options.icon || options.logo || options.css))) {
    console.error('Error: --icon, --logo, --css and --standalone are mutually exclusive.');
    process.exit(1);
  }

  // Resolve --size default based on context:
  // - --standalone (file for <img> use): keep original dimensions
  // - inline (default): apply width="100%" height="100%"
  // Explicit --size or --keep-size always wins over the default
  if (options.size === null) {
    options.size = !options.standalone;
  }

  return options;
}

// Read All Data From stdin
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// Print Help Text
function printHelp() {
  console.log(`
Usage: echo '<svg>...</svg>' | svg-cleaner [OPTIONS]

Modes (mutually exclusive):
  Default (inline)   Strips xmlns, applies width="100%" height="100%"
                     Ready to paste directly into HTML
  --icon             Wrap output in an icon div (default <div class="svg-icn">)
  --logo             Wrap in a logo div with aspect-ratio (default <div class="svg-logo">)
  --standalone       Re-adds xmlns + XML declaration, keeps original dimensions
                     For .svg files used via <img src="...">
  --css              Output as a CSS data-URI (see --css-format)

Options:
  --current-color    Set all shape fills to currentColor (for theme support)
  --size             Force width="100%" height="100%" (default for inline mode)
  --keep-size        Keep original width/height (default for --standalone mode)
  --icon-name NAME   Icon name (added as attribute, use with --icon)
  --logo-name NAME   Logo name (added as attribute, use with --logo)
  --css-format F     url | basic | advanced | bullets | class (default: url)
  --no-sanitise      Keep scripts, event handlers and javascript: links.
                     Sanitising is ON by default; disable only for trusted
                     interactive/scripted SVGs (declarative animation — CSS
                     keyframes, SMIL — survives sanitising untouched).
  --strip-comments   Remove XML/HTML comments
  --strip-metadata   Remove data-* attributes and editor class names
  --precision N      Round decimal values to N decimal places
  --minify           Collapse whitespace and optimise path data
  -o, --output PATH  Write result to file instead of stdout
  --config PATH      Config file (default: ./svg-cleaner.config.json if present)
  -h, --help         Show this help message

Config file (svg-cleaner.config.json) — project conventions, overridden by flags:
  { "iconClass": "svg-icn", "iconAttr": "data-icon",
    "logoClass": "svg-logo", "logoAttr": "data-logo" }

Examples:
  # Inline SVG (strips xmlns, 100% sizing, currentColor)
  cat logo.svg | svg-cleaner --current-color

  # Standalone .svg file (keeps colors and dimensions, adds xmlns)
  cat logo.svg | svg-cleaner --standalone -o assets/images/logos/logo-primary.svg

  # Icon for inline use
  cat icon.svg | svg-cleaner --current-color --icon --icon-name "arrow-right"
`);
}

//
//------- Initialize -------//
//

// Run CLI
async function run() {
  const config = loadConfig(process.argv.slice(2));
  const options = parseArgs(process.argv, config);
  const input = await readStdin();

  if (!input.trim()) {
    console.error('Error: No SVG input received. Pipe SVG content via stdin.');
    process.exit(1);
  }

  if (Buffer.byteLength(input, 'utf8') > cleaner.MAX_INPUT_BYTES) {
    console.error(`Error: Input exceeds ${cleaner.MAX_INPUT_BYTES / 1024 / 1024}MB. This tool targets hand-authored SVGs, not large exports.`);
    process.exit(1);
  }

  // Surface what sanitising will remove — never strip silently
  if (options.sanitise) {
    const removed = cleaner.sanitiseReport(input);
    if (removed.length) {
      console.error(`sanitise: removing ${removed.join(', ')} (use --no-sanitise to keep)`);
    }
  }

  const result = cleaner.processSVG(input, options);

  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, result);
    console.error(`Saved: ${options.output}`);
  } else {
    process.stdout.write(result);
  }
}

run().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
