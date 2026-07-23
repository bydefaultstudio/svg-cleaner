/**
 * app.js — SVG Cleaner web tool UI
 * UI wiring only — all SVG processing comes from the shared engine in
 * assets/js/svg-cleaner-core.js (window.SvgCleaner), synced from src/core.js.
 * Never add processing logic here; it belongs in the core.
 * @version 1.1.0
 */

(function () {
  'use strict';

  var SETTINGS_KEY = 'svg-cleaner-settings';
  var MODE_BUTTONS = null;

  function el(id) { return document.getElementById(id); }

  //
  //------- Wrapper Settings (localStorage) -------//
  //

  function loadSettings() {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { /* corrupt json — fall back to defaults */ }
    el('set-icon-class').value = stored.iconClass || SvgCleaner.DEFAULTS.iconClass;
    el('set-icon-attr').value = stored.iconAttr || SvgCleaner.DEFAULTS.iconAttr;
    el('set-logo-class').value = stored.logoClass || SvgCleaner.DEFAULTS.logoClass;
    el('set-logo-attr').value = stored.logoAttr || SvgCleaner.DEFAULTS.logoAttr;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        iconClass: el('set-icon-class').value.trim(),
        iconAttr: el('set-icon-attr').value.trim(),
        logoClass: el('set-logo-class').value.trim(),
        logoAttr: el('set-logo-attr').value.trim(),
      }));
    } catch (e) { /* private browsing — settings just don't persist */ }
  }

  //
  //------- Modes -------//
  //

  function getActiveMode() {
    var active = document.querySelector('#mode-selector .segmented-control-btn.is-active');
    return active ? active.getAttribute('data-mode') : null;
  }

  function updateContext() {
    var mode = getActiveMode();
    el('opt-icon-name').style.display = mode === 'icon' ? '' : 'none';
    el('opt-logo-name').style.display = mode === 'logo' ? '' : 'none';
    el('opt-image-filename').style.display = mode === 'image' ? '' : 'none';
    el('ctx-css').style.display = mode === 'css' ? '' : 'none';
  }

  function applyLocks() {
    var mode = getActiveMode();
    var size = el('opt-size');
    var color = el('opt-current-color');
    var comments = el('opt-strip-comments');
    var sizeW = el('toggle-size');
    var colorW = el('toggle-color');
    var commentsW = el('toggle-strip-comments');

    size.disabled = false; color.disabled = false; comments.disabled = false;
    sizeW.classList.remove('is-disabled');
    colorW.classList.remove('is-disabled');
    commentsW.classList.remove('is-disabled');

    if (mode === 'icon' || mode === 'logo') {
      size.checked = true; size.disabled = true; sizeW.classList.add('is-disabled');
      color.checked = true; color.disabled = true; colorW.classList.add('is-disabled');
      comments.checked = true; comments.disabled = true; commentsW.classList.add('is-disabled');
    } else if (mode === 'image') {
      color.checked = false; color.disabled = true; colorW.classList.add('is-disabled');
      size.checked = false; size.disabled = true; sizeW.classList.add('is-disabled');
    } else if (mode === 'css') {
      color.checked = false; color.disabled = true; colorW.classList.add('is-disabled');
    } else {
      color.checked = true;
      comments.checked = true;
    }
  }

  function updateUI() {
    var mode = getActiveMode();
    el('save-group').style.display = mode === 'image' ? '' : 'none';
    el('output-group').style.display = mode === 'image' ? 'none' : '';
    el('copy-group').style.display = mode === 'image' ? 'none' : '';
  }

  //
  //------- Processing -------//
  //

  function buildOptions(mode) {
    var fmt = document.querySelector('input[name="css-format"]:checked');
    return {
      sanitise: el('opt-sanitise').checked,
      currentColor: el('opt-current-color').checked,
      icon: mode === 'icon',
      iconName: el('opt-icon-name').value.trim() || null,
      logo: mode === 'logo',
      logoName: el('opt-logo-name').value.trim() || null,
      size: el('opt-size').checked,
      standalone: mode === 'image',
      css: mode === 'css',
      cssFormat: fmt ? fmt.value : 'url',
      stripComments: el('opt-strip-comments').checked,
      stripMetadata: el('opt-strip-metadata').checked,
      precision: el('opt-round-decimals').checked ? 2 : null,
      minify: el('opt-minify').checked,
      iconClass: el('set-icon-class').value.trim() || undefined,
      iconAttr: el('set-icon-attr').value.trim() || undefined,
      logoClass: el('set-logo-class').value.trim() || undefined,
      logoAttr: el('set-logo-attr').value.trim() || undefined,
    };
  }

  // Surface what sanitising removed — never strip silently
  function updateStatus(input) {
    var status = el('tool-status');
    if (!input || !el('opt-sanitise').checked) { status.textContent = ''; return; }
    var removed = SvgCleaner.sanitiseReport(input);
    status.textContent = removed.length ? 'Sanitised: removed ' + removed.join(', ') + '.' : '';
  }

  function inputTooLarge(input) {
    return new Blob([input]).size > SvgCleaner.MAX_INPUT_BYTES;
  }

  // Auto-clean: process SVG and update output (skips Image mode — that needs a button click)
  function autoClean() {
    var mode = getActiveMode();
    if (mode === 'image') { updateStatus(el('svg-input').value); return; }

    var input = el('svg-input').value;
    var output = el('svg-output');
    var copyBtn = el('copy-btn');
    resetCopyBtn();

    if (!input.trim()) {
      output.value = '';
      copyBtn.disabled = true;
      el('tool-status').textContent = '';
      return;
    }

    if (inputTooLarge(input)) {
      output.value = '';
      copyBtn.disabled = true;
      el('tool-status').textContent = 'Input is over 2MB — this tool targets hand-authored SVGs.';
      return;
    }

    output.value = SvgCleaner.processSVG(input, buildOptions(mode));
    copyBtn.disabled = false;
    updateStatus(input);
  }

  // Save Image (Image mode only — triggered by button click)
  function handleSaveImage() {
    var input = el('svg-input').value;
    if (!input.trim() || inputTooLarge(input)) return;

    var result = SvgCleaner.processSVG(input, buildOptions('image'));
    updateStatus(input);
    var fn = SvgCleaner.sanitiseName(el('opt-image-filename').value.trim() || 'image') || 'image';
    var blob = new Blob([result], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fn + '.svg'; a.click();
    URL.revokeObjectURL(url);
  }

  //
  //------- Copy Button -------//
  //

  function resetCopyBtn() {
    el('copy-btn').textContent = 'Copy';
  }

  function copyDone() {
    el('copy-btn').textContent = 'Copied!';
    setTimeout(resetCopyBtn, 2000);
  }

  function fallbackCopy(textarea) {
    textarea.select();
    try {
      if (document.execCommand('copy')) { copyDone(); return; }
    } catch (e) { /* fall through to the manual message */ }
    el('tool-status').textContent = 'Copy failed — select the output and copy manually.';
  }

  function handleCopy() {
    var output = el('svg-output');
    if (!output.value) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(output.value).then(copyDone, function () { fallbackCopy(output); });
    } else {
      fallbackCopy(output);
    }
  }

  function handleModeClick(btn) {
    var wasActive = btn.classList.contains('is-active');
    MODE_BUTTONS.forEach(function (b) { b.classList.remove('is-active'); });
    if (!wasActive) btn.classList.add('is-active');
    updateContext();
    applyLocks();
    updateUI();
    autoClean();
  }

  //
  //------- Init -------//
  //

  function init() {
    if (typeof window.SvgCleaner === 'undefined') {
      console.error('[SVG Cleaner] engine missing — assets/js/svg-cleaner-core.js must load before app.js');
      return;
    }

    MODE_BUTTONS = document.querySelectorAll('#mode-selector .segmented-control-btn');
    MODE_BUTTONS.forEach(function (btn) {
      btn.addEventListener('click', function () { handleModeClick(btn); });
    });

    el('save-btn').addEventListener('click', handleSaveImage);
    el('copy-btn').addEventListener('click', handleCopy);
    el('svg-input').addEventListener('input', autoClean);

    document.querySelectorAll('.form-toggle input[type="checkbox"]').forEach(function (toggle) {
      toggle.addEventListener('change', autoClean);
    });

    document.querySelectorAll('input[name="css-format"]').forEach(function (radio) {
      radio.addEventListener('change', autoClean);
    });

    ['opt-icon-name', 'opt-logo-name'].forEach(function (id) {
      el(id).addEventListener('input', autoClean);
    });

    ['set-icon-class', 'set-icon-attr', 'set-logo-class', 'set-logo-attr'].forEach(function (id) {
      el(id).addEventListener('input', function () { saveSettings(); autoClean(); });
    });

    loadSettings();
    console.log('[SVG Cleaner] web tool init (core v' + SvgCleaner.VERSION + ')');
  }

  // Both scripts are deferred, so the DOM is parsed by the time this runs
  init();
})();
