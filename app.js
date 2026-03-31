/**
 * app.js — Video Specialist Renamer V3
 * ─────────────────────────────────────────────────────────────────
 * UI controller / event wiring. Depends on:
 *   • parser.js  (window.VSRParser)
 *   • jszip.min.js (window.JSZip)
 *   • styles.css
 *
 * Architecture:
 *   State → render() → DOM
 *   All mutations go through setState() which triggers re-render.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/* ================================================================
   1. APP STATE
   ================================================================ */
let state = {
  files:       [],      // Array of FileEntry objects (see below)
  showOld:     false,   // Toggle old name column visibility
  epOffset:    0,       // Global episode offset applied to all detections
  sortDir:     'asc',   // 'asc' | 'desc'
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

/**
 * FileEntry shape:
 * {
 *   id:        string    – unique key
 *   file:      File
 *   oldName:   string    – original filename
 *   newName:   string    – computed output name
 *   size:      number    – bytes
 *   detected:  bool      – was episode auto-detected
 *   ep:        number|null
 *   season:    number|null
 * }
 */

/* ================================================================
   2. DOM REFS
   ================================================================ */
const $ = id => document.getElementById(id);

const DOM = {
  fileInput:        $('fileInput'),
  dropZone:         $('dropZone'),
  fsaRow:           $('fsaRow'),
  fsaOpenBtn:       $('fsaOpenBtn'),
  fsaSaveBtn:       $('fsaSaveBtn'),

  statsPanel:       $('statsPanel'),
  statTotal:        $('statTotal'),
  statSize:         $('statSize'),
  statDetected:     $('statDetected'),
  statStatus:       $('statStatus'),

  fileListPanel:    $('fileListPanel'),
  fileList:         $('fileList'),
  fileListHeader:   $('fileListHeader'),
  fileCountBadge:   $('fileCountBadge'),
  togglePreviewBtn: $('togglePreviewBtn'),
  clearAllBtn:      $('clearAllBtn'),

  exportPanel:      $('exportPanel'),
  emptyState:       $('emptyState'),
  progressWrap:     $('progressWrap'),
  progressFill:     $('progressFill'),
  progressLabel:    $('progressLabel'),
  zipSizeEstimate:  $('zipSizeEstimate'),
  toastContainer:   $('toastContainer'),
  offlineBadge:     $('offlineBadge'),

  // Settings inputs
  animeName:        $('animeName'),
  season:           $('season'),
  startEpisode:     $('startEpisode'),
  padWidth:         $('padWidth'),
  pattern:          $('pattern'),
  customPatternGroup: $('customPatternGroup'),
  customPattern:    $('customPattern'),
  smartClean:       $('smartClean'),
  autoDetect:       $('autoDetect'),
  epOffset:         $('epOffset'),

  // Export
  downloadZipBtn:   $('downloadZipBtn'),
  downloadScriptBtn:$('downloadScriptBtn'),
  downloadCsvBtn:   $('downloadCsvBtn'),

  // Sort / offset
  applyOffsetBtn:   $('applyOffsetBtn'),
  sortAscBtn:       $('sortAscBtn'),
  sortDescBtn:      $('sortDescBtn'),
};

/* ================================================================
   3. STATE MUTATIONS
   ================================================================ */
function setState(patch) {
  if (patch.settings) {
    state.settings = { ...state.settings, ...patch.settings };
  }
  Object.assign(state, patch);
  render();
}

/* ================================================================
   4. FILE PROCESSING
   ================================================================ */
function processFiles(rawFiles) {
  if (!rawFiles || rawFiles.length === 0) return;

  const { Parser } = getParser();
  let sorted = Parser.smartSort(Array.from(rawFiles));

  const entries = sorted.map((file, idx) => {
    const info = Parser.extractEpisodeInfo(file.name);
    const entry = buildEntry(file, info, idx);
    return entry;
  });

  setState({ files: entries });
  showToast(`Loaded ${entries.length} file${entries.length !== 1 ? 's' : ''}`, 'success');
}

function buildEntry(file, info, seqIdx) {
  const s     = state.settings;
  const ep    = s.autoDetect && info.episode !== null
                  ? info.episode + state.epOffset
                  : (s.startEp - 1) + seqIdx + 1 + state.epOffset;
  const season = info.season ?? parseInt(s.season, 10) || 1;

  const cleanedTitle = s.smartClean
    ? VSRParser.smartClean(file.name)
    : (s.seriesName || 'Show');

  const baseName = s.seriesName.trim() || cleanedTitle || 'Show';

  const newName = VSRParser.generateNewName({
    pattern:    getPattern(),
    seriesName: baseName,
    season:     season,
    episode:    Math.max(0, ep),
    padWidth:   s.padWidth,
    extension:  VSRParser.getExtension(file.name),
  });

  return {
    id:       `${file.name}-${file.size}-${file.lastModified}`,
    file,
    oldName:  file.name,
    newName,
    size:     file.size,
    detected: info.detected,
    ep:       ep,
    season,
  };
}

function rebuildNames() {
  if (state.files.length === 0) return;
  const updated = state.files.map((entry, idx) => {
    const info = VSRParser.extractEpisodeInfo(entry.oldName);
    return buildEntry(entry.file, info, idx);
  });
  setState({ files: updated });
}

function getPattern() {
  const s = state.settings;
  return s.pattern === 'custom' ? (s.customPat || '{name} - S{season}E{episode}') : s.pattern;
}

function getParser() {
  return { Parser: window.VSRParser };
}

/* ================================================================
   5. RENDER
   ================================================================ */
function render() {
  const hasFiles = state.files.length > 0;

  // Visibility toggles
  toggle(DOM.emptyState,    !hasFiles);
  toggle(DOM.statsPanel,     hasFiles);
  toggle(DOM.fileListPanel,  hasFiles);
  toggle(DOM.exportPanel,    hasFiles);

  if (hasFiles) {
    renderStats();
    renderFileList();
    updateZipEstimate();
  }
}

function toggle(el, show) {
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

function renderStats() {
  const files    = state.files;
  const total    = files.length;
  const bytes    = files.reduce((s, f) => s + f.size, 0);
  const detected = files.filter(f => f.detected).length;

  DOM.statTotal.textContent    = total;
  DOM.statSize.textContent     = VSRParser.formatFileSize(bytes);
  DOM.statDetected.textContent = detected;
  DOM.fileCountBadge.textContent = total;

  const GB = bytes / (1024 ** 3);
  let status = 'good', symbol = '✓';
  if      (GB > 2)   { status = 'danger';  symbol = '✗'; }
  else if (GB > 0.8) { status = 'warning'; symbol = '⚠'; }

  DOM.statStatus.textContent       = symbol;
  DOM.statStatus.dataset.status    = status;
}

function renderFileList() {
  const frag = document.createDocumentFragment();
  const list = state.sortDir === 'desc' ? [...state.files].reverse() : state.files;

  list.forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.setAttribute('role', 'listitem');
    item.style.animationDelay = `${Math.min(i * 20, 300)}ms`;

    const epClass = entry.detected ? 'file-item__ep' : 'file-item__ep file-item__ep--undetected';
    const epText  = entry.ep !== null ? entry.ep : '?';

    item.innerHTML = `
      <span class="file-item__index">${i + 1}</span>
      <span class="file-item__old" title="${escHtml(entry.oldName)}">${escHtml(truncate(entry.oldName, 45))}</span>
      <span class="file-item__arrow">→</span>
      <span class="file-item__new" title="${escHtml(entry.newName)}">${escHtml(entry.newName)}</span>
      <span class="file-item__size">${VSRParser.formatFileSize(entry.size)}</span>
      <span class="${epClass}" title="${entry.detected ? 'Auto-detected' : 'Not detected / fallback'}">${epText}</span>
    `;
    frag.appendChild(item);
  });

  DOM.fileList.innerHTML = '';
  DOM.fileList.appendChild(frag);
}

function updateZipEstimate() {
  const bytes = state.files.reduce((s, f) => s + f.size, 0);
  DOM.zipSizeEstimate.textContent = `~${VSRParser.formatFileSize(bytes)} (video files are stored uncompressed)`;
}

/* ================================================================
   6. EXPORT FUNCTIONS
   ================================================================ */

async function downloadZip() {
  if (state.files.length === 0) return;

  const btn = DOM.downloadZipBtn;
  btn.disabled = true;
  toggle(DOM.progressWrap, true);

  try {
    const zip = new JSZip();
    const total = state.files.length;

    for (let i = 0; i < total; i++) {
      const entry = state.files[i];
      setProgress(Math.round((i / total) * 90), `Adding ${i + 1}/${total}…`);

      // Small yield to keep UI responsive
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));

      const buf = await entry.file.arrayBuffer();
      zip.file(entry.newName, buf);
    }

    setProgress(90, 'Generating ZIP…');
    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE' },
      meta => setProgress(90 + Math.round(meta.percent * 0.1), 'Compressing…')
    );

    setProgress(100, 'Done!');
    triggerDownload(blob, (state.settings.seriesName || 'Renamed_Videos') + '.zip');
    showToast('ZIP downloaded successfully!', 'success');
  } catch (err) {
    console.error('ZIP error:', err);
    showToast('ZIP failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    setTimeout(() => { toggle(DOM.progressWrap, false); setProgress(0, ''); }, 1500);
  }
}

async function fsaSaveFolder() {
  if (!('showDirectoryPicker' in window)) return;
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const total = state.files.length;

    toggle(DOM.progressWrap, true);
    for (let i = 0; i < total; i++) {
      const entry = state.files[i];
      setProgress(Math.round((i / total) * 100), `Saving ${i + 1}/${total}…`);

      const fileHandle = await dirHandle.getFileHandle(entry.newName, { create: true });
      const writable   = await fileHandle.createWritable();
      await writable.write(entry.file);
      await writable.close();
    }
    showToast(`Saved ${total} files to folder!`, 'success');
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Save failed: ' + err.message, 'error');
  } finally {
    toggle(DOM.progressWrap, false);
    setProgress(0, '');
  }
}

function downloadScript() {
  if (state.files.length === 0) return;

  // Bash script
  const bashLines = [
    '#!/usr/bin/env bash',
    '# Generated by Video Specialist Renamer V3',
    '# Run in the folder containing your video files.',
    '',
    ...state.files.map(e =>
      `mv -v "${e.oldName.replace(/"/g, '\\"')}" "${e.newName.replace(/"/g, '\\"')}"`
    ),
  ];

  // Windows batch script
  const batLines = [
    '@echo off',
    'REM Generated by Video Specialist Renamer V3',
    '',
    ...state.files.map(e =>
      `rename "${e.oldName.replace(/"/g, '""')}" "${e.newName.replace(/"/g, '""')}"`
    ),
  ];

  const combined = bashLines.join('\n') + '\n\n\n' + batLines.join('\r\n');
  const blob = new Blob([combined], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, 'rename_script.sh');
  showToast('Rename script downloaded!', 'info');
}

function downloadCsv() {
  if (state.files.length === 0) return;

  const rows = [
    ['Index', 'Original Filename', 'New Filename', 'Size (bytes)', 'Detected Episode', 'Auto-detected'],
    ...state.files.map((e, i) => [
      i + 1, e.oldName, e.newName, e.size, e.ep ?? '', e.detected ? 'Yes' : 'No',
    ]),
  ];

  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, 'rename_log.csv');
  showToast('CSV log downloaded!', 'info');
}

/* ================================================================
   7. HELPERS
   ================================================================ */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function setProgress(pct, label) {
  DOM.progressFill.style.width  = `${pct}%`;
  DOM.progressLabel.textContent = label;
}

function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast--exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function truncate(str, max) {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

/* ================================================================
   8. EVENT WIRING
   ================================================================ */
function init() {
  // ── File input (click-to-browse) ──────────────────────────────
  DOM.dropZone.addEventListener('click', () => DOM.fileInput.click());
  DOM.dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); DOM.fileInput.click(); }
  });

  DOM.fileInput.addEventListener('change', e => {
    processFiles(e.target.files);
    e.target.value = ''; // Reset so same files can be re-selected
  });

  // ── Drag and drop ─────────────────────────────────────────────
  DOM.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    DOM.dropZone.classList.add('drag-over');
  });

  ['dragleave', 'dragend'].forEach(evt =>
    DOM.dropZone.addEventListener(evt, () => DOM.dropZone.classList.remove('drag-over'))
  );

  DOM.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    DOM.dropZone.classList.remove('drag-over');
    processFiles(e.dataTransfer.files);
  });

  // Also accept drops on the whole page
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  });

  // ── File System Access API ────────────────────────────────────
  if ('showOpenFilePicker' in window) {
    DOM.fsaRow.style.display = 'flex';
    DOM.fsaOpenBtn.addEventListener('click', async () => {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Video files',
            accept: { 'video/*': ['.mkv','.mp4','.avi','.mov','.wmv','.flv','.webm','.m4v'] },
          }],
        });
        const files = await Promise.all(handles.map(h => h.getFile()));
        processFiles(files);
      } catch (err) {
        if (err.name !== 'AbortError') showToast('Could not open files: ' + err.message, 'error');
      }
    });
  }

  if ('showDirectoryPicker' in window) {
    DOM.fsaSaveBtn.classList.remove('hidden');
    DOM.fsaSaveBtn.addEventListener('click', fsaSaveFolder);
  }

  // ── Settings change handlers ──────────────────────────────────
  DOM.animeName.addEventListener('input', () => {
    state.settings.seriesName = DOM.animeName.value;
    rebuildNames();
  });

  DOM.season.addEventListener('input', () => {
    state.settings.season = DOM.season.value;
    rebuildNames();
  });

  DOM.startEpisode.addEventListener('input', () => {
    state.settings.startEp = parseInt(DOM.startEpisode.value, 10) || 1;
    rebuildNames();
  });

  DOM.padWidth.addEventListener('change', () => {
    state.settings.padWidth = parseInt(DOM.padWidth.value, 10) || 2;
    rebuildNames();
  });

  DOM.pattern.addEventListener('change', () => {
    const val = DOM.pattern.value;
    state.settings.pattern = val;
    toggle(DOM.customPatternGroup, val === 'custom');
    rebuildNames();
  });

  DOM.customPattern.addEventListener('input', () => {
    state.settings.customPat = DOM.customPattern.value;
    rebuildNames();
  });

  DOM.smartClean.addEventListener('change', () => {
    state.settings.smartClean = DOM.smartClean.checked;
    rebuildNames();
  });

  DOM.autoDetect.addEventListener('change', () => {
    state.settings.autoDetect = DOM.autoDetect.checked;
    rebuildNames();
  });

  // ── File list controls ────────────────────────────────────────
  DOM.togglePreviewBtn.addEventListener('click', () => {
    state.showOld = !state.showOld;
    // Toggle header column visibility
    DOM.fileListHeader.querySelector('.col--old').style.display = state.showOld ? '' : '';
    renderFileList();
  });

  DOM.clearAllBtn.addEventListener('click', () => {
    if (state.files.length === 0) return;
    if (confirm(`Clear all ${state.files.length} loaded files?`)) {
      setState({ files: [] });
      showToast('Cleared all files', 'info');
    }
  });

  // ── Offset & Sort ─────────────────────────────────────────────
  DOM.applyOffsetBtn.addEventListener('click', () => {
    state.epOffset = parseInt(DOM.epOffset.value, 10) || 0;
    rebuildNames();
    showToast(`Offset ${state.epOffset >= 0 ? '+' : ''}${state.epOffset} applied`, 'info');
  });

  DOM.sortAscBtn.addEventListener('click', () => {
    state.sortDir = 'asc';
    renderFileList();
  });

  DOM.sortDescBtn.addEventListener('click', () => {
    state.sortDir = 'desc';
    renderFileList();
  });

  // ── Export ────────────────────────────────────────────────────
  DOM.downloadZipBtn.addEventListener('click', downloadZip);
  DOM.downloadScriptBtn.addEventListener('click', downloadScript);
  DOM.downloadCsvBtn.addEventListener('click', downloadCsv);

  // ── PWA / Service Worker ──────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      console.log('[VSR] SW registered, scope:', reg.scope);
    }).catch(err => {
      console.warn('[VSR] SW registration failed:', err);
    });
  }

  // ── Offline badge ─────────────────────────────────────────────
  function updateOnlineStatus() {
    const online = navigator.onLine;
    DOM.offlineBadge.style.opacity = online ? '1' : '0.5';
    DOM.offlineBadge.title = online ? 'Online — app works fully offline too' : 'Offline — app still works!';
  }
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // ── Initial render ────────────────────────────────────────────
  render();
  console.log('[VSR] App initialised. Parser:', window.VSRParser);
}

/* ================================================================
   9. BOOTSTRAP
   ================================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
