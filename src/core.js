/**
 * Script Purpose: SVG Cleaner core — shared processing engine for CLI and browser
 * Author: By Default Studio
 * Created: 2026-07-23
 * Version: 1.0.0
 *
 * Single source of truth for SVG cleaning. Consumed by:
 *   - bin/svg-cleaner.js (Node CLI, via require)
 *   - web/index.html and any browser UI (via <script>, exposes window.SvgCleaner)
 *
 * Regex-based by design: fast, dependency-free, and adequate for the trusted
 * "designer pastes an SVG" workflow. It is not a full XML parser — do not rely
 * on it as the only defence against hostile SVG in a security-critical context.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SvgCleaner = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0';

  // Refuse pathological inputs — protects the caller's own process/tab
  var MAX_INPUT_BYTES = 2 * 1024 * 1024;

  // Wrapper conventions — overridable per project via options
  var DEFAULTS = {
    iconClass: 'svg-icn',
    iconAttr: 'data-icon',
    logoClass: 'svg-logo',
    logoAttr: 'data-logo',
  };

  //
  //------- Utility Functions -------//
  //

  // Strip XML/HTML Comments
  function stripComments(svg) {
    return svg.replace(/<!--[\s\S]*?-->/g, '');
  }

  // Strip Editor Metadata (data-* attributes, Illustrator class names)
  function stripMetadata(svg) {
    var result = svg;
    result = result.replace(/\s+data-name="[^"]*"/g, '');
    result = result.replace(/\s+data-id="[^"]*"/g, '');
    result = result.replace(/\s+class="(?:cls|st)-?\d+"/g, '');
    return result;
  }

  // Round Decimal Values to N Places
  function roundDecimals(svg, precision) {
    return svg.replace(/(\d+\.\d+)/g, function (_match, num) {
      return parseFloat(parseFloat(num).toFixed(precision)).toString();
    });
  }

  // Optimise Path Data (remove unnecessary spaces and commas)
  function optimisePathData(svg) {
    return svg.replace(/\s+d="([^"]*)"/g, function (_match, pathData) {
      var optimised = pathData;
      optimised = optimised.replace(/,/g, ' ');
      optimised = optimised.replace(/\s{2,}/g, ' ');
      optimised = optimised.replace(/([A-Za-z])\s+/g, '$1');
      optimised = optimised.replace(/\s+(-)/g, '$1');
      return ' d="' + optimised.trim() + '"';
    });
  }

  // Minify SVG to Single Line
  function minifySVG(svg) {
    var result = optimisePathData(svg);
    result = result.replace(/\n/g, '').replace(/\s{2,}/g, ' ').replace(/>\s+</g, '><').trim();
    return result;
  }

  // Extract a Unitless Number From a Dimension Value (accepts "24", "24px";
  // rejects "%", "em" etc — CSS aspect-ratio takes unitless numbers only)
  function cssDimension(value) {
    var m = /^\s*([0-9]*\.?[0-9]+)\s*(?:px)?\s*$/i.exec(value || '');
    return m ? m[1] : null;
  }

  // Sanitise Name (replace spaces and special characters with hyphens)
  function sanitiseName(name) {
    return String(name)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  }

  //
  //------- Sanitise (security pass) -------//
  //

  // Patterns removed by the sanitise pass. Each entry: [label, regex, ...]
  // Exposed so callers (CLI/web) can warn about what will be removed.
  var SANITISE_PATTERNS = [
    { label: 'script blocks', regexes: [/<script[\s\S]*?<\/script\s*>/gi, /<script[^>]*\/>/gi] },
    { label: 'foreignObject blocks', regexes: [/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, /<foreignObject[^>]*\/>/gi] },
    { label: 'event handler attributes', regexes: [/\s+on[a-z]+\s*=\s*"[^"]*"/gi, /\s+on[a-z]+\s*=\s*'[^']*'/gi] },
    {
      label: 'javascript/data-html links',
      regexes: [
        /\s+(?:xlink:)?href\s*=\s*"\s*(?:javascript:|data:\s*text\/html)[^"]*"/gi,
        /\s+(?:xlink:)?href\s*=\s*'\s*(?:javascript:|data:\s*text\/html)[^']*'/gi,
      ],
    },
  ];

  // Strip Active Content (scripts, event handlers, javascript: links, foreignObject)
  // Leaves <style>, CSS keyframes, and SMIL <animate> elements untouched —
  // declarative animation survives; only script execution vectors are removed.
  function sanitiseSVG(svg) {
    var result = svg;
    SANITISE_PATTERNS.forEach(function (pattern) {
      pattern.regexes.forEach(function (re) {
        result = result.replace(re, '');
      });
    });
    return result;
  }

  // Report Which Sanitise Patterns Match (for caller warnings — does not modify)
  function sanitiseReport(svg) {
    var matched = [];
    SANITISE_PATTERNS.forEach(function (pattern) {
      var hits = pattern.regexes.some(function (re) {
        re.lastIndex = 0;
        return re.test(svg);
      });
      if (hits) matched.push(pattern.label);
    });
    return matched;
  }

  //
  //------- SVG-to-CSS -------//
  //

  function svgToDataURI(svg) {
    var encoded = svg.replace(/#/g, '%23').replace(/\?/g, '%3F').replace(/[\t\n\r]/gm, '')
      .replace(/\s\s+/g, ' ').replace(/'/g, '"').replace(/> </g, '><');
    return "url('data:image/svg+xml," + encoded + "')";
  }

  function wrapCSSHelper(dataURI, format) {
    switch (format) {
      case 'basic':
        return 'background-image: ' + dataURI + ';';
      case 'advanced':
        return '/* background-color: #FFFFFF; */\n'
          + 'background-image: ' + dataURI + ';\n'
          + '/* background-attachment: fixed | scroll; */\n'
          + '/* background-size: auto | cover | contain | 500px 250px; */\n'
          + '/* background-position: center | right 30px bottom 15px; */\n'
          + '/* background-repeat: no-repeat | repeat | repeat-x; */\n'
          + '/* background-origin: border-box | padding-box | content-box; */\n'
          + '/* background-clip: border-box | padding-box | content-box; */\n'
          + '/* background-blend-mode: multiply | screen | overlay; */';
      case 'bullets':
        return 'li {\n  list-style-image: ' + dataURI + ';\n}\nli::marker {\n  font-size: 1.5em;\n  line-height: 0.1em;\n}';
      case 'class':
        return '.your-class {\n  background-image: ' + dataURI + ';\n}';
      default:
        return dataURI;
    }
  }

  //
  //------- Core Processing -------//
  //

  /**
   * Process SVG code.
   *
   * options:
   *   sanitise      bool  strip scripts/handlers/js-links/foreignObject (recommended: true)
   *   currentColor  bool  set all shape fills to currentColor
   *   size          bool  force width="100%" height="100%" (icon/logo imply this)
   *   standalone    bool  re-add xmlns + XML declaration, for .svg files
   *   icon          bool  wrap in icon div; iconName adds the icon attribute
   *   logo          bool  wrap in logo div with aspect-ratio; logoName names it
   *   css           bool  output as CSS data-URI; cssFormat picks the wrapper
   *   stripComments, stripMetadata, minify  bool
   *   precision     number|null  round decimals to N places
   *   iconClass, iconAttr, logoClass, logoAttr  string  wrapper conventions
   */
  function processSVG(svgCode, options) {
    var opts = options || {};
    var iconClass = opts.iconClass || DEFAULTS.iconClass;
    var iconAttr = opts.iconAttr || DEFAULTS.iconAttr;
    var logoClass = opts.logoClass || DEFAULTS.logoClass;
    var logoAttr = opts.logoAttr || DEFAULTS.logoAttr;

    var code = svgCode;

    // Strip wrapping elements (e.g. pasted from HTML with icon/logo wrappers)
    var svgMatch = code.match(/<svg[\s\S]*<\/svg>/i);
    if (svgMatch) code = svgMatch[0];

    // Security pass first — nothing downstream should see active content
    if (opts.sanitise) code = sanitiseSVG(code);

    // Extract original dimensions before modifying (needed for logo aspect-ratio)
    var origW = null, origH = null;
    if (opts.logo) {
      var wm = code.match(/<svg[^>]*?\s+width=["']([^"']*?)["']/i);
      var hm = code.match(/<svg[^>]*?\s+height=["']([^"']*?)["']/i);
      origW = wm ? cssDimension(wm[1]) : null;
      origH = hm ? cssDimension(hm[1]) : null;

      // Fall back to viewBox when width/height are missing or not usable in
      // CSS aspect-ratio (percentages, units) — viewBox is always unitless
      if (!origW || !origH) {
        var vbm = code.match(/<svg[^>]*?\s+viewBox=["']([^"']*?)["']/i);
        if (vbm) {
          var vbParts = vbm[1].split(/[\s,]+/);
          if (vbParts.length >= 4) {
            origW = cssDimension(vbParts[2]);
            origH = cssDimension(vbParts[3]);
          }
        }
      }
    }

    // Remove xmlns attributes from root svg tag (run twice: xmlns + xmlns:xlink)
    code = code.replace(/<svg([^>]*?)\s+xmlns(?::xlink)?=(?:"[^"]*"|'[^']*')([^>]*?)>/g, '<svg$1$2>');
    code = code.replace(/<svg([^>]*?)\s+xmlns(?::xlink)?=(?:"[^"]*"|'[^']*')([^>]*?)>/g, '<svg$1$2>');

    // Tidy root <svg> attributes — icon/logo imply 100% sizing (SVG fills wrapper)
    var applySize = opts.size || opts.logo || opts.icon;
    code = code.replace(/<svg([^>]*?)>/, function (_m, attrs) {
      var a = attrs;
      if (applySize) {
        a = a.replace(/\s+width=(?:"[^"]*"|'[^']*')/gi, '').replace(/\s+height=(?:"[^"]*"|'[^']*')/gi, '');
        a += ' width="100%" height="100%"';
      } else {
        // Set explicit width/height from viewBox when missing
        var vbm = a.match(/viewBox=["']([^"']*?)["']/i);
        if (vbm) {
          var parts = vbm[1].split(/[\s,]+/);
          if (parts.length >= 4) {
            if (!/\s+width="/i.test(a)) a += ' width="' + parts[2] + '"';
            if (!/\s+height="/i.test(a)) a += ' height="' + parts[3] + '"';
          }
        }
      }
      // Standalone files and CSS data-URIs are parsed as XML — namespace required
      if (opts.standalone || opts.css) a += ' xmlns="http://www.w3.org/2000/svg"';
      return '<svg' + a + '>';
    });

    // Set fill to currentColor on all shape elements (attribute + inline style)
    if (opts.currentColor) {
      // Lookahead keeps the "line" alternative from matching <linearGradient>
      code = code.replace(/<(path|rect|circle|ellipse|polygon|polyline|line)(?=[\s/>])([^>]*?)(\/?)\s*>/g, function (_m, tag, attrs, selfClose) {
        if (attrs.includes('fill=')) attrs = attrs.replace(/fill=(?:"[^"]*"|'[^']*')/g, 'fill="currentColor"');
        else attrs += ' fill="currentColor"';
        if (attrs.includes('style=')) {
          attrs = attrs.replace(/style="([^"]*?)"/g, function (_sm, s) {
            var ns = s.replace(/fill\s*:\s*[^;]+/g, 'fill: currentColor');
            if (!s.includes('fill:')) return 'style="' + s + '; fill: currentColor"';
            return 'style="' + ns + '"';
          });
        }
        return '<' + tag + attrs + selfClose + '>';
      });
    }

    if (opts.stripComments) code = stripComments(code);
    if (opts.stripMetadata) code = stripMetadata(code);
    if (typeof opts.precision === 'number' && !isNaN(opts.precision)) {
      // toFixed throws outside [0, 100]
      code = roundDecimals(code, Math.min(100, Math.max(0, Math.floor(opts.precision))));
    }
    if (opts.minify) code = minifySVG(code);

    var result = code.trim();
    if (opts.standalone) result = '<?xml version="1.0" encoding="UTF-8"?>\n' + result;

    // Wrap in logo block (takes precedence over icon)
    if (opts.logo) {
      var ln = sanitiseName(opts.logoName || 'default');
      var as = (origW && origH) ? ' style="aspect-ratio: ' + origW + ' / ' + origH + '"' : '';
      result = result.replace(/<svg([^>]*)>/, '<svg ' + logoAttr + '="' + ln + '"$1>');
      result = '<div class="' + logoClass + '"' + as + '>\n  ' + result + '\n</div>';
    }

    // Wrap in icon block
    if (opts.icon && !opts.logo) {
      if (opts.iconName) {
        var icn = sanitiseName(opts.iconName);
        result = result.replace(/<svg([^>]*)>/, '<svg ' + iconAttr + '="' + icn + '"$1>');
      }
      result = '<div class="' + iconClass + '">\n  ' + result + '\n</div>';
    }

    // CSS output mode (modes are mutually exclusive — UI/CLI enforce that)
    if (opts.css) {
      var uri = svgToDataURI(result);
      result = wrapCSSHelper(uri, opts.cssFormat);
    }

    return result;
  }

  //
  //------- Exports -------//
  //

  return {
    VERSION: VERSION,
    MAX_INPUT_BYTES: MAX_INPUT_BYTES,
    DEFAULTS: DEFAULTS,
    processSVG: processSVG,
    sanitiseSVG: sanitiseSVG,
    sanitiseReport: sanitiseReport,
    sanitiseName: sanitiseName,
    svgToDataURI: svgToDataURI,
    wrapCSSHelper: wrapCSSHelper,
  };
});
