const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');
const { ALIASES, TV_TRUE_VALUES } = require('./fieldAliases');
const { normalize, movieKey, seriesKey, seasonKey } = require('./keys');

// Collectorz doesn't publish a fixed XML schema, so instead of hardcoding
// tag names, this walks the parsed document looking for the largest
// repeating array of objects that has something matching "title". That
// array is treated as the movie/season list.
function findRecordArray(root) {
  let best = null;
  function walk(node) {
    if (Array.isArray(node)) {
      const objItems = node.filter((i) => i && typeof i === 'object');
      if (objItems.length > 0) {
        const hasTitle = objItems.some((i) => Object.keys(i).some((k) => k.toLowerCase() === 'title'));
        if (hasTitle && (!best || objItems.length > best.length)) best = objItems;
      }
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  }
  walk(root);
  return best;
}

function getField(obj, aliasList) {
  const keys = Object.keys(obj);
  for (const alias of aliasList) {
    const key = keys.find((k) => k.toLowerCase() === alias);
    if (key) return obj[key];
  }
  return null;
}

function textOf(val) {
  if (val == null) return null;
  if (typeof val === 'object') return '#text' in val ? String(val['#text']) : null;
  return String(val);
}

function splitList(rawVal) {
  if (rawVal == null) return [];
  if (Array.isArray(rawVal)) {
    return rawVal.map((v) => textOf(v && typeof v === 'object' && 'Genre' in v ? v.Genre : v)).filter(Boolean);
  }
  const text = textOf(rawVal);
  if (!text) return [];
  return text
    .split(/[;,|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseYear(yearRaw, dateRaw) {
  const y = textOf(yearRaw);
  if (y && /^\d{4}$/.test(y.trim())) return parseInt(y, 10);
  const d = textOf(dateRaw);
  if (d) {
    const m = d.match(/(\d{4})/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function isTvValue(raw) {
  if (!raw) return false;
  return TV_TRUE_VALUES.includes(raw.trim().toLowerCase());
}

const ORDINAL_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

// Same multi-pattern approach as parseCsv.js — see the comment there for why.
function extractSeasonNumber(title) {
  if (!title) return null;
  let m = title.match(/season\s*#?\s*(\d+)\b/i);
  if (m) return parseInt(m[1], 10);
  m = title.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
  if (m) return parseInt(m[1], 10);
  m = title.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*season/i);
  if (m) return ORDINAL_WORDS[m[1].toLowerCase()] || null;
  return null;
}

function deriveSeriesTitleFromTitle(title) {
  const m = title.match(/^(.*?)[:\-,]?\s*(?:season\s*#?\s*\d+|\d+(?:st|nd|rd|th)\s*season|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*season)/i);
  if (m && m[1].trim()) return m[1].trim();
  return null;
}

// Same collision-safe season resolution as parseCsv.js.
function resolveSeasonNumbers(tvRows) {
  const bySeries = new Map();
  for (const r of tvRows) {
    const k = normalize(r.seriesTitle);
    if (!bySeries.has(k)) bySeries.set(k, []);
    bySeries.get(k).push(r);
  }

  const resolved = [];
  let splitOffCount = 0;

  for (const rows of bySeries.values()) {
    if (rows.length === 1 && rows[0].seasonNumber == null) {
      rows[0].seasonNumber = 1;
      resolved.push(rows[0]);
      continue;
    }
    for (const r of rows) {
      if (r.seasonNumber == null) {
        splitOffCount += 1;
        console.warn(`"${r.title}" — couldn't determine its season number and "${r.seriesTitle}" has other seasons, so treating it as its own standalone one-off entry rather than guessing.`);
        r.seriesTitle = r.title;
        r.seasonNumber = 1;
        resolved.push(r);
        continue;
      }
      resolved.push(r);
    }
  }

  if (splitOffCount > 0) {
    console.warn(`${splitOffCount} TV row(s) with an ambiguous season number were split off as standalone entries.`);
  }

  return resolved;
}

function parseXml(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(raw);
  const nodes = findRecordArray(doc);

  if (!nodes) {
    throw new Error(
      'Could not locate a repeating movie/season element with a Title field in the XML. ' +
        'Inspect the export and adjust the logic in parseXml.js, or switch to a CSV export instead (see data/README.md).'
    );
  }

  const built = nodes
    .map((node) => {
      const title = textOf(getField(node, ALIASES.title));
      if (!title) return null;
      const releaseDateRaw = getField(node, ALIASES.releaseDate);
      const releaseDate = textOf(releaseDateRaw);
      const year = parseYear(getField(node, ALIASES.year), releaseDateRaw);
      const mpaaRating = textOf(getField(node, ALIASES.mpaaRating));
      const genres = splitList(getField(node, ALIASES.genres));
      const formats = splitList(getField(node, ALIASES.format));
      const runtimeText = textOf(getField(node, ALIASES.runtime));
      const runtimeMinutes = runtimeText ? parseInt(runtimeText, 10) : null;
      const isTv = isTvValue(textOf(getField(node, ALIASES.isTvSeries)));

      if (!isTv) {
        return {
          mediaType: 'movie',
          title,
          year,
          releaseDate,
          mpaaRating,
          genres,
          formats,
          runtimeMinutes: Number.isFinite(runtimeMinutes) ? runtimeMinutes : null,
          stableKey: movieKey(title, year, runtimeMinutes),
        };
      }

      const seriesTitleRaw = textOf(getField(node, ALIASES.seriesTitle));
      const seriesTitle = (seriesTitleRaw && seriesTitleRaw.trim()) || deriveSeriesTitleFromTitle(title) || title;

      let episodeCount = parseInt(textOf(getField(node, ALIASES.episodeCount)), 10);
      if (!Number.isFinite(episodeCount) || episodeCount <= 0) episodeCount = 1;

      return {
        mediaType: 'tv',
        title,
        seriesTitle,
        seasonNumber: extractSeasonNumber(title),
        episodeCount,
        year,
        releaseDate,
        mpaaRating,
        genres,
        formats,
        runtimeMinutes: Number.isFinite(runtimeMinutes) ? runtimeMinutes : null,
      };
    })
    .filter(Boolean);

  const movies = built.filter((r) => r.mediaType === 'movie');
  const tvRows = resolveSeasonNumbers(built.filter((r) => r.mediaType === 'tv'));
  for (const r of tvRows) {
    r.stableKey = seasonKey(r.seriesTitle, r.seasonNumber);
    r.seriesKey = seriesKey(r.seriesTitle);
  }

  return [...movies, ...tvRows];
}

module.exports = { parseXml };
