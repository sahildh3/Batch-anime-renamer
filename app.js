/**
 * app.js — Video Specialist Renamer V3
 * ─────────────────────────────────────────────────────────────────
 * UI controller / event wiring. Depends on:
 *   • parser.js     (window.VSRParser)   — must load before this file
 *   • jszip.min.js  (window.JSZip)       — must load before this file
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  CRITICAL: ALL document.getElementById() calls live inside  │
 * │  init(). The DOM object is built there, after the browser   │
 * │  has fully parsed the HTML. Building it at the top level    │
 * │  (parse time) returns null for every element.               │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Architecture:
 *   State → render() → DOM
 *   All mutations go through setState() which triggers re-render.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/* ================================================================
   1. APP STATE  (safe to define at parse time — no DOM access)
   ================================================================ */
let state = {
  files:    [],
  showOld:  true,
  epOffset: 0,
  sortDir:  'asc',
  settings: {
    seriesName: '',
    season:     '01',
    startEp:    1,
    padWidth:   2,
    pattern:    '{name} - S{season}E{episode}',
    customPat:  '',
    smartClean: true,
    autoDetect: true,
  },
};

// DOM refs — populated inside init() AFTER DOMContentLoaded
let DOM = {};

/* ================================================================
   2. STATE MUTATIONS
   ================================================================ */
function setState(patch) {
  if (patch.settings) {
    state.settings = { ...state.settings, ...patch.settings };
  }
  const { settings: _s, ...rest } = patch;
  Object.assign(state, rest);
  render();
}

/* ================================================================
   3. FILE PROCESSING
   ================================================================ */
function processFiles(rawFiles) {
  if (!rawFiles || rawFiles.length === 0) return;
  const sorted  = VSRParser.smartSort(Array.from(rawFiles));
  const entries = sorted.map((file, idx) => {
    return buildEntry(file, VSRParser.extractEpisodeInfo(file.name), idx);
  });
  setState({ files: entries });
  showToast('Loaded ' + entries.length + ' file' + (entries.length !== 1 ? 's' : ''), 'success');
}

function buildEntry(file, info, seqIdx) {
  const s      = state.settings;
  const rawEp  = (s.autoDetect && info.episode !== null) ? info.episode : (s.startEp + seqIdx);
  const ep     = Math.max(0, rawEp + state.epOffset);
  const season = info.season ?? (parseInt(s.season, 10) || 1);
  const clean  = s.smartClean ? VSRParser.smartClean(file.name) : 'Show';
  const base   = s.seriesName.trim() || clean || 'Show';
  const newName = VSRParser.generateNewName({
    pattern:    getActivePattern(),
    seriesName: base,
    season, episode: ep, padWidth: s.padWidth,
    extension:  VSRParser.getExtension(file.name),
  });
  return { id: file.name + '-' + file.size, file, oldName: file.name, newName,
           size: file.size, detected: info.detected, ep, season };
}

function rebuildNames() {
  if (state.files.length === 0) return;
  state.files = state.files.map((entry, idx) =>
    buildEntry(entry.file, VSRParser.extractEpisodeInfo(entry.oldName), idx)
  );
  render();
}

function getActivePattern() {
  const s = state.settings;
  return s.pattern === 'custom'
    ? (s.customPat.trim() || '{name} - S{season}E{episode}')
    : s.pattern;
}

/* ================================================================
   4. RENDER
   ================================================================ */
function render() {
  const has = state.files.length > 0;
  setVisible(DOM.emptyState,   !has);
  setVisible(DOM.statsPanel,    has);
  setVisible(DOM.fileListPanel, has);
  setVisible(DOM.exportPanel,   has);
  if (has) { renderStats(); renderFileList(); renderZipEstimate(); }
}

function setVisible(el, show) {
  if (!el) return;
  if (show) { el.classList.remove('hidden'); }
  else      { el.classList.add('hidden');    }
}

function renderStats() {
  const files    = state.files;
  const bytes    = files.reduce((s, f) => s + f.size, 0);
  const detected = files.filter(f => f.detected).length;
  DOM.statTotal.textContent      = files.length;
  DOM.statSize.textContent       = VSRParser.formatFileSize(bytes);
  DOM.statDetected.textContent   = detected;
  DOM.fileCountBadge.textContent = files.length;
  const GB = bytes / Math.pow(1024, 3);
  let status = 'good', symbol = '✓';
  if (GB > 2)   { status = 'danger';  symbol = '✗ Risk'; }
  else if (GB > 0.8) { status = 'warning'; symbol = '⚠ High'; }
  DOM.statStatus.textContent    = symbol;
  DOM.statStatus.dataset.status = status;
}

function renderFileList() {
  const list = state.sortDir === 'desc' ? [...state.files].reverse() : state.files;
  const frag = document.createDocumentFragment();
  list.forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.setAttribute('role', 'listitem');
    item.style.animationDelay = Math.min(i * 18, 260) + 'ms';
    const epCls = 'file-item__ep' + (entry.detected ? '' : ' file-item__ep--undetected');
    const oldHtml = state.showOld
      ? '<span class="file-item__old" title="' + escHtml(entry.oldName) + '">' + escHtml(truncate(entry.oldName, 40)) + '</span><span class="file-item__arrow">→</span>'
      : '<span class="file-item__old"></span><span class="file-item__arrow"></span>';
    item.innerHTML = '<span class="file-item__index">' + (i + 1) + '</span>' +
      oldHtml +
      '<span class="file-item__new" title="' + escHtml(entry.newName) + '">' + escHtml(entry.newName) + '</span>' +
      '<span class="file-item__size">' + VSRParser.formatFileSize(entry.size) + '</span>' +
      '<span class="' + epCls + '">' + (entry.ep !== null ? entry.ep : '?') + '</span>';
    frag.appendChild(item);
  });
  DOM.fileList.innerHTML = '';
  DOM.fileList.appendChild(frag);
}

function renderZipEstimate() {
  if (!DOM.zipSizeEstimate) return;
  const bytes = state.files.reduce((s, f) => s + f.size, 0);
  DOM.zipSizeEstimate.textContent = '~' + VSRParser.formatFileSize(bytes) + ' · stored uncompressed';
}

/* ================================================================
   5. EXPORT
   ================================================================ */
async function downloadZip() {
  if (state.files.length === 0) return;
  DOM.downloadZipBtn.disabled = true;
  setVisible(DOM.progressWrap, true);
  try {
    const zip = new JSZip();
    const total = state.files.length;
    for (let i = 0; i < total; i++) {
      setProgress(Math.round((i / total) * 88), 'Queuing ' + (i + 1) + ' / ' + total + '…');
      if (i % 4 === 0) await new Promise(r => setTimeout(r, 0));
      zip.file(state.files[i].newName, await state.files[i].file.arrayBuffer());
    }
    setProgress(90, 'Building ZIP…');
    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE' },
      function(meta) { setProgress(90 + Math.round(meta.percent * 0.1), 'Finalising…'); }
    );
    setProgress(100, 'Done!');
    triggerDownload(blob, (state.settings.seriesName || 'Renamed_Videos') + '.zip');
    showToast('ZIP downloaded!', 'success');
  } catch (err) {
    console.error('[VSR] ZIP error:', err);
    showToast('ZIP failed: ' + err.message, 'error');
  } finally {
    DOM.downloadZipBtn.disabled = false;
    setTimeout(function() { setVisible(DOM.progressWrap, false); }, 1800);
  }
}

async function fsaSaveFolder() {
  if (!('showDirectoryPicker' in window)) return;
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    const total = state.files.length;
    setVisible(DOM.progressWrap, true);
    for (let i = 0; i < total; i++) {
      setProgress(Math.round((i / total) * 100), 'Saving ' + (i + 1) + ' / ' + total + '…');
      const fh = await dir.getFileHandle(state.files[i].newName, { create: true });
      const wr = await fh.createWritable();
      await wr.write(state.files[i].file);
      await wr.close();
    }
    showToast('Saved ' + total + ' files!', 'success');
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Save error: ' + err.message, 'error');
  } finally {
    setVisible(DOM.progressWrap, false);
    setProgress(0, '');
  }
}

function downloadScript() {
  if (state.files.length === 0) return;
  const bash = ['#!/usr/bin/env bash', '# Video Specialist Renamer V3', '']
    .concat(state.files.map(function(e) {
      return "mv -v '" + e.oldName.replace(/'/g, "'\\''") + "' '" + e.newName.replace(/'/g, "'\\''") + "'";
    })).join('\n');
  const bat = ['@echo off', 'REM Video Specialist Renamer V3', '']
    .concat(state.files.map(function(e) {
      return 'ren "' + e.oldName.replace(/"/g, '""') + '" "' + e.newName.replace(/"/g, '""') + '"';
    })).join('\r\n');
  triggerDownload(new Blob([bash + '\n\n\n' + bat], { type: 'text/plain;charset=utf-8' }), 'rename_script.sh');
  showToast('Script downloaded!', 'info');
}

function downloadCsv() {
  if (state.files.length === 0) return;
  const rows = [['#', 'Original Name', 'New Name', 'Size (B)', 'Episode', 'Auto-detected']]
    .concat(state.files.map(function(e, i) {
      return [i + 1, e.oldName, e.newName, e.size, e.ep !== null ? e.ep : '', e.detected ? 'Yes' : 'No'];
    }));
  const csv = rows.map(function(r) {
    return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'rename_log.csv');
  showToast('CSV log downloaded!', 'info');
}

/* ================================================================
   6. HELPERS
   ================================================================ */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
}
function setProgress(pct, label) {
  if (DOM.progressFill)  DOM.progressFill.style.width    = pct + '%';
  if (DOM.progressLabel) DOM.progressLabel.textContent   = label;
}
function showToast(msg, type, duration) {
  type = type || 'info'; duration = duration || 3500;
  if (!DOM.toastContainer) return;
  const t = document.createElement('div');
  t.className = 'toast toast--' + type;
  t.textContent = msg;
  DOM.toastContainer.appendChild(t);
  setTimeout(function() {
    t.classList.add('toast--exit');
    t.addEventListener('animationend', function() { t.remove(); }, { once: true });
  }, duration);
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function truncate(str, max) {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

/* ================================================================
   7. INIT — runs after DOMContentLoaded
   ================================================================ */
function init() {

  /* Step 1 ─ Build DOM refs NOW (elements are in the document) */
  var get = function(id) {
    var el = document.getElementById(id);
    if (!el) console.warn('[VSR] Missing element: #' + id);
    return el;
  };

  DOM = {
    fileInput:          get('fileInput'),
    dropZone:           get('dropZone'),
    fsaRow:             get('fsaRow'),
    fsaOpenBtn:         get('fsaOpenBtn'),
    fsaSaveBtn:         get('fsaSaveBtn'),
    statsPanel:         get('statsPanel'),
    statTotal:          get('statTotal'),
    statSize:           get('statSize'),
    statDetected:       get('statDetected'),
    statStatus:         get('statStatus'),
    fileListPanel:      get('fileListPanel'),
    fileList:           get('fileList'),
    fileListHeader:     get('fileListHeader'),
    fileCountBadge:     get('fileCountBadge'),
    togglePreviewBtn:   get('togglePreviewBtn'),
    clearAllBtn:        get('clearAllBtn'),
    exportPanel:        get('exportPanel'),
    progressWrap:       get('progressWrap'),
    progressFill:       get('progressFill'),
    progressLabel:      get('progressLabel'),
    zipSizeEstimate:    get('zipSizeEstimate'),
    downloadZipBtn:     get('downloadZipBtn'),
    downloadScriptBtn:  get('downloadScriptBtn'),
    downloadCsvBtn:     get('downloadCsvBtn'),
    emptyState:         get('emptyState'),
    toastContainer:     get('toastContainer'),
    offlineBadge:       get('offlineBadge'),
    animeName:          get('animeName'),
    season:             get('season'),
    startEpisode:       get('startEpisode'),
    padWidth:           get('padWidth'),
    pattern:            get('pattern'),
    customPatternGroup: get('customPatternGroup'),
    customPattern:      get('customPattern'),
    smartClean:         get('smartClean'),
    autoDetect:         get('autoDetect'),
    epOffset:           get('epOffset'),
    applyOffsetBtn:     get('applyOffsetBtn'),
    sortAscBtn:         get('sortAscBtn'),
    sortDescBtn:        get('sortDescBtn'),
  };

  /* Step 2 ─ Guard: parser must be loaded */
  if (typeof window.VSRParser === 'undefined') {
    console.error('[VSR] parser.js not loaded!');
    showToast('Fatal: parser.js missing. Reload page.', 'error', 10000);
    return;
  }

  /* Step 3 ─ File input: drop zone click opens picker */
  DOM.dropZone.addEventListener('click', function() {
    DOM.fileInput.click();
  });
  DOM.dropZone.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); DOM.fileInput.click(); }
  });
  DOM.fileInput.addEventListener('change', function(e) {
    processFiles(e.target.files);
    e.target.value = '';
  });

  /* Step 4 ─ Drag and drop */
  DOM.dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    DOM.dropZone.classList.add('drag-over');
  });
  ['dragleave', 'dragend'].forEach(function(evt) {
    DOM.dropZone.addEventListener(evt, function() {
      DOM.dropZone.classList.remove('drag-over');
    });
  });
  DOM.dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    DOM.dropZone.classList.remove('drag-over');
    processFiles(e.dataTransfer.files);
  });
  document.addEventListener('dragover', function(e) { e.preventDefault(); });
  document.addEventListener('drop', function(e) {
    e.preventDefault();
    if (e.target !== DOM.dropZone && e.dataTransfer.files.length) {
      processFiles(e.dataTransfer.files);
    }
  });

  /* Step 5 ─ File System Access API (desktop only) */
  if ('showOpenFilePicker' in window && DOM.fsaRow) {
    DOM.fsaRow.style.display = 'flex';
    DOM.fsaOpenBtn.addEventListener('click', async function() {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [{ description: 'Video files',
            accept: { 'video/*': ['.mkv','.mp4','.avi','.mov','.wmv','.flv','.webm','.m4v','.ts'] } }],
        });
        processFiles(await Promise.all(handles.map(function(h) { return h.getFile(); })));
      } catch(err) {
        if (err.name !== 'AbortError') showToast('Open failed: ' + err.message, 'error');
      }
    });
  }
  if ('showDirectoryPicker' in window && DOM.fsaSaveBtn) {
    DOM.fsaSaveBtn.classList.remove('hidden');
    DOM.fsaSaveBtn.addEventListener('click', fsaSaveFolder);
  }

  /* Step 6 ─ Settings */
  DOM.animeName.addEventListener('input', function() {
    state.settings.seriesName = DOM.animeName.value; rebuildNames();
  });
  DOM.season.addEventListener('input', function() {
    state.settings.season = DOM.season.value; rebuildNames();
  });
  DOM.startEpisode.addEventListener('input', function() {
    state.settings.startEp = Math.max(0, parseInt(DOM.startEpisode.value, 10) || 1); rebuildNames();
  });
  DOM.padWidth.addEventListener('change', function() {
    state.settings.padWidth = parseInt(DOM.padWidth.value, 10) || 2; rebuildNames();
  });

  /* ── CUSTOM PATTERN FIX ──────────────────────────────────────
     Direct classList.remove/add — no helper wrapper, no ambiguity. */
  DOM.pattern.addEventListener('change', function() {
    var val = DOM.pattern.value;
    state.settings.pattern = val;
    if (val === 'custom') {
      DOM.customPatternGroup.classList.remove('hidden');
      DOM.customPattern.focus();
    } else {
      DOM.customPatternGroup.classList.add('hidden');
    }
    rebuildNames();
  });

  DOM.customPattern.addEventListener('input', function() {
    state.settings.customPat = DOM.customPattern.value; rebuildNames();
  });
  DOM.smartClean.addEventListener('change', function() {
    state.settings.smartClean = DOM.smartClean.checked; rebuildNames();
  });
  DOM.autoDetect.addEventListener('change', function() {
    state.settings.autoDetect = DOM.autoDetect.checked; rebuildNames();
  });

  /* Step 7 ─ File list controls */
  DOM.togglePreviewBtn.addEventListener('click', function() {
    state.showOld = !state.showOld; renderFileList();
  });
  DOM.clearAllBtn.addEventListener('click', function() {
    if (state.files.length === 0) return;
    if (!confirm('Remove all ' + state.files.length + ' loaded file(s)?')) return;
    setState({ files: [] });
    showToast('Cleared', 'info');
  });

  /* Step 8 ─ Offset & Sort */
  DOM.applyOffsetBtn.addEventListener('click', function() {
    state.epOffset = parseInt(DOM.epOffset.value, 10) || 0;
    rebuildNames();
    var sign = state.epOffset >= 0 ? '+' : '';
    showToast('Episode offset: ' + sign + state.epOffset, 'info');
  });
  DOM.epOffset.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') DOM.applyOffsetBtn.click();
  });
  DOM.sortAscBtn.addEventListener('click', function() { state.sortDir = 'asc';  renderFileList(); });
  DOM.sortDescBtn.addEventListener('click', function() { state.sortDir = 'desc'; renderFileList(); });

  /* Step 9 ─ Export */
  DOM.downloadZipBtn.addEventListener('click', downloadZip);
  DOM.downloadScriptBtn.addEventListener('click', downloadScript);
  DOM.downloadCsvBtn.addEventListener('click', downloadCsv);

  /* Step 10 ─ Service Worker (deferred until after load) */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('./sw.js')
        .then(function(r) { console.log('[VSR] SW registered, scope:', r.scope); })
        .catch(function(e) { console.warn('[VSR] SW failed:', e); });
    });
  }

  /* Step 11 ─ Online badge */
  function syncBadge() {
    if (!DOM.offlineBadge) return;
    DOM.offlineBadge.title = navigator.onLine
      ? 'Online — app also works fully offline'
      : 'Offline — all features still work!';
  }
  window.addEventListener('online',  syncBadge);
  window.addEventListener('offline', syncBadge);
  syncBadge();

  /* Step 12 ─ First render */
  render();
  console.log('[VSR] ✓ Ready — VSRParser:', !!window.VSRParser, '— JSZip:', !!window.JSZip);
}

/* ================================================================
   8. BOOTSTRAP
   ================================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
