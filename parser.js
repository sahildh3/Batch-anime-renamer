/**
 * parser.js — Video Specialist Renamer V3
 * ─────────────────────────────────────────────────────────────────
 * Responsibilities:
 *   • extractEpisodeInfo(filename)  → { season, episode, detected }
 *   • smartClean(filename)          → cleaned title string
 *   • generateNewName(opts)         → formatted output filename
 *   • smartSort(fileArray)          → sorted File[] by detected ep
 *   • formatFileSize(bytes)         → human-readable string
 *
 * No external dependencies. Pure functions only.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/* ================================================================
   1. JUNK TAG PATTERNS — for Smart Clean
   ================================================================ */

/** Tags to strip from filenames before producing a clean title. */
const JUNK_PATTERNS = [
  // Release groups: [HorribleSubs], [SubsPlease], [EMBER], (GJM)
  /\[[\w\s\-&.]+\]/g,
  /\([\w\s\-&.]+\)/g,

  // Video quality/resolution: 1080p, 720p, 480p, 4K, 2160p
  /\b(?:4K|2160p?|1080p?|720p?|540p?|480p?|360p?|240p?)\b/gi,

  // Codecs: x264, x265, HEVC, AVC, H.264, H.265, XviD, DivX
  /\b(?:x26[45]|[Hh]\.?26[45]|HEVC|AVC|XviD|DivX|VP9|AV1|MPEG[-\s]?[24])\b/gi,

  // Audio: AAC, AC3, DTS, Flac, MP3, EAC3, TrueHD, Atmos
  /\b(?:AAC|AC3|DTS(?:-HD)?|FLAC|MP3|EAC3|TrueHD|Atmos|5\.1|7\.1|2\.0)\b/gi,

  // Source tags: BluRay, BDRip, WEBRip, WEB-DL, HDTV, DVDRip, AMZN, NF, CR
  /\b(?:BluRay|BDRip|BDRemux|WEBRip|WEB[-\s]?DL|HDTV|DVDRip|DVDScr|CAM|AMZN|NF|CR|Funimation|HiDive)\b/gi,

  // Checksum hashes: [A1B2C3D4]
  /\[[0-9A-Fa-f]{6,8}\]/g,

  // CRC32 in parens: (A1B2C3D4)
  /\([0-9A-Fa-f]{8}\)/g,

  // Subtitle tags: [Multi-Sub], [Dual-Audio], [Eng Sub]
  /\b(?:Multi[-\s]?Sub|Dual[-\s]?Audio|Eng(?:lish)?[-\s]?Sub(?:bed)?|Subbed|Dubbed|Uncensored|Remastered)\b/gi,

  // Consecutive dots/underscores/dashes (separator cleanup, applied after above)
  // Handled separately in smartClean() below.
];

/* ================================================================
   2. EPISODE / SEASON DETECTION PATTERNS (priority order)
   ================================================================ */

/**
 * Each entry: { regex, season: fn(m)|null, episode: fn(m) }
 * Tried in order; first match wins.
 */
const DETECT_PATTERNS = [
  // ── S01E01 / S1E1 / s01e01 ──
  {
    re: /[Ss](\d{1,2})[Ee](\d{1,3})/,
    season:  m => parseInt(m[1], 10),
    episode: m => parseInt(m[2], 10),
    label: 'SxxExx',
  },

  // ── 1x01 / 01x01 / 1X01 ──
  {
    re: /\b(\d{1,2})[xX](\d{1,3})\b/,
    season:  m => parseInt(m[1], 10),
    episode: m => parseInt(m[2], 10),
    label: 'NxNN',
  },

  // ── EP01 / Ep 01 / ep01 / EP.01 ──
  {
    re: /\b[Ee][Pp]?[.\s_-]*(\d{1,3})\b/,
    season:  null,
    episode: m => parseInt(m[1], 10),
    label: 'EP##',
  },

  // ── Episode 01 / EPISODE01 ──
  {
    re: /\b[Ee]pisode[.\s_-]*(\d{1,3})\b/i,
    season:  null,
    episode: m => parseInt(m[1], 10),
    label: 'Episode ##',
  },

  // ── E01 at word boundary (avoid year false positives) ──
  {
    re: /\bE(\d{2,3})\b/,
    season:  null,
    episode: m => parseInt(m[1], 10),
    label: 'E##',
  },

  // ── Standalone 2–3 digit numbers surrounded by separators ──
  // e.g. "Show.Name.05.mkv" or "Show_Name_-_12_[tag].mkv"
  // Avoid matching years (1900–2099) and 4-digit numbers.
  {
    re: /(?:^|[.\s_\-\[])(\d{2,3})(?:[.\s_\-\]|]|$)/,
    season:  null,
    episode: m => {
      const n = parseInt(m[1], 10);
      // Reject plausible years
      if (n >= 1900 && n <= 2099) return null;
      return n;
    },
    label: 'Standalone ##',
  },

  // ── Single digit at end "Show - 5.mkv" (last-resort) ──
  {
    re: /[.\s_\-](\d{1})(?:\s*[-._]?\s*(?:\[.*\])?\s*\.[a-z0-9]+)?$/i,
    season:  null,
    episode: m => parseInt(m[1], 10),
    label: 'Single digit',
  },
];

/* ================================================================
   3. PUBLIC API
   ================================================================ */

/**
 * extractEpisodeInfo(filename)
 * Returns: { season: number|null, episode: number|null, detected: bool, label: string }
 */
function extractEpisodeInfo(filename) {
  // Strip extension for detection
  const name = filename.replace(/\.[^/.]+$/, '');

  for (const p of DETECT_PATTERNS) {
    const m = name.match(p.re);
    if (!m) continue;

    const season  = p.season  ? p.season(m)  : null;
    const episode = p.episode ? p.episode(m) : null;

    // episode() can return null to signal a false-positive (e.g. year)
    if (episode === null) continue;

    return {
      season:   season,
      episode:  episode,
      detected: true,
      label:    p.label,
    };
  }

  // Fallback: pull any number found
  const numbers = name.match(/\d+/g);
  if (numbers) {
    for (const n of numbers) {
      const v = parseInt(n, 10);
      if (v >= 1900 && v <= 2099) continue; // skip years
      if (v >= 0 && v <= 9999) {
        return { season: null, episode: v, detected: false, label: 'fallback' };
      }
    }
  }

  return { season: null, episode: null, detected: false, label: 'none' };
}

/**
 * smartClean(filename)
 * Strips junk tags and normalises separators to spaces.
 * Returns a clean title string (without extension).
 */
function smartClean(filename) {
  // Remove extension
  let name = filename.replace(/\.[^/.]+$/, '');

  // Apply all junk patterns
  for (const pat of JUNK_PATTERNS) {
    name = name.replace(pat, ' ');
  }

  // Replace separator characters (dots, underscores, multiple dashes) with spaces
  name = name.replace(/[._]+/g, ' ');
  name = name.replace(/\s*-\s*/g, ' - ');

  // Collapse multiple spaces
  name = name.replace(/\s{2,}/g, ' ');

  // Trim
  name = name.trim();

  // Title-case (basic: capitalise after spaces/hyphens)
  name = name.replace(/(^|[\s-])(\S)/g, (_, sep, ch) => sep + ch.toUpperCase());

  return name;
}

/**
 * generateNewName(opts)
 * opts: {
 *   pattern:    string    – e.g. "{name} - S{season}E{episode}"
 *   seriesName: string
 *   season:     number|string
 *   episode:    number
 *   padWidth:   number    – how many digits to zero-pad episode (default 2)
 *   extension:  string    – e.g. ".mkv"
 * }
 * Returns: final filename string
 */
function generateNewName({ pattern, seriesName, season, episode, padWidth = 2, extension }) {
  const ep  = String(episode).padStart(padWidth, '0');
  const sea = String(season  ?? 1).padStart(2, '0');

  let result = pattern
    .replace(/\{name\}/gi,    seriesName || 'Show')
    .replace(/\{season\}/gi,  sea)
    .replace(/\{episode\}/gi, ep)
    .replace(/\{quality\}/gi, '') // placeholder for future
    .trim();

  // Sanitise: remove characters illegal on Windows/macOS/Linux
  result = result.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');

  // Collapse any double spaces introduced by replacements
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result + extension;
}

/**
 * smartSort(fileArray)
 * Sorts an array of File objects by detected episode number ascending.
 * Falls back to natural string sort.
 */
function smartSort(fileArray) {
  return [...fileArray].sort((a, b) => {
    const ia = extractEpisodeInfo(a.name);
    const ib = extractEpisodeInfo(b.name);

    const ea = ia.episode ?? Infinity;
    const eb = ib.episode ?? Infinity;

    if (ea !== eb) return ea - eb;

    // Secondary: natural locale sort
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * formatFileSize(bytes)
 * Returns human-readable size: "12.3 MB", "1.1 GB", etc.
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = (bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0);
  return `${value} ${units[i]}`;
}

/**
 * getExtension(filename)
 * Returns lowercase extension including dot, e.g. ".mkv"
 */
function getExtension(filename) {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

/* ================================================================
   4. EXPORT (global, since this is a plain script, not a module)
   ================================================================ */
/* eslint-disable no-unused-vars */
window.VSRParser = {
  extractEpisodeInfo,
  smartClean,
  generateNewName,
  smartSort,
  formatFileSize,
  getExtension,
};
