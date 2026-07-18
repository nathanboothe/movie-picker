const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { ALIASES, CSV_COLUMNS, TV_TRUE_VALUES } = require('./fieldAliases');
const { normalize, movieKey, seriesKey, seasonKey } = require('./keys');

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase();
}

function findHeaderIndex(headers, aliasList) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliasList) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return null;
}

function splitGenres(raw) {
  if (!raw) return [];
  return raw
    .split(/[;,|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseYear(yearRaw, releaseDateRaw) {
  if (yearRaw && /^\d{4}$/.test(String(yearRaw).trim())) return parseInt(yearRaw, 10);
  if (releaseDateRaw) {
    const m = String(releaseDateRaw).match(/(\d{4})/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function parseRuntime(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function isTvValue(raw) {
  if (!raw) return false;
  return TV_TRUE_VALUES.includes(String(raw).trim().toLowerCase());
}

const ORDINAL_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

// There's no dedicated season-number column — it has to come out of the
// title. Real Collectorz exports use several different conventions, so this
// tries a few patterns rather than one rigid one:
//   "Show: Season 3"        -> digit right after the word "Season", anywhere
//   "Show, Vol 1! Season 2" -> same, doesn't require punctuation before it
//   "Show: The Complete 2nd Season" -> ordinal digit before "Season"
//   "Show: The Complete Second Season" -> ordinal word before "Season"
// Returns null (not a guess) if nothing matches — the caller decides what to
// do with that, since guessing wrong silently overwrites a real season.
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

// Used only when the Series column itself is blank for a TV row (happens
// for a handful of real entries) — tries to pull a show name out of the
// title the same way extractSeasonNumber finds a season number.
function deriveSeriesTitleFromTitle(title) {
  const m = title.match(/^(.*?)[:\-,]?\s*(?:season\s*#?\s*\d+|\d+(?:st|nd|rd|th)\s*season|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*season)/i);
  if (m && m[1].trim()) return m[1].trim();
  return null;
}

function buildRawRow({ title, year, releaseDate, runtime, genresRaw, mpaaRating, isTv, seriesTitleRaw, episodeCountRaw, formatRaw }) {
  const genres = splitGenres(genresRaw);
  const formats = splitGenres(formatRaw); // same "semicolon-separated list" shape as genres
  const runtimeMinutes = parseRuntime(runtime);
  const parsedYear = parseYear(year, releaseDate);
  const mpaaRatingClean = mpaaRating ? String(mpaaRating).trim() || null : null;

  if (!isTv) {
    return {
      mediaType: 'movie',
      title,
      year: parsedYear,
      releaseDate: releaseDate || null,
      mpaaRating: mpaaRatingClean,
      genres,
      formats,
      runtimeMinutes,
      stableKey: movieKey(title, parsedYear, runtimeMinutes),
    };
  }

  // Series column is reliable almost everywhere, but a handful of real rows
  // leave it blank. Try to recover a show name from the title itself before
  // giving up and skipping the row.
  const seriesTitle = (seriesTitleRaw && String(seriesTitleRaw).trim()) || deriveSeriesTitleFromTitle(title) || title;

  let episodeCount = episodeCountRaw != null ? parseInt(episodeCountRaw, 10) : null;
  if (!Number.isFinite(episodeCount) || episodeCount <= 0) episodeCount = 1; // 0 means "single episode, not a full season"

  return {
    mediaType: 'tv',
    title,
    seriesTitle,
    seasonNumber: extractSeasonNumber(title), // may be null — resolved in a second pass
    episodeCount,
    year: parsedYear,
    releaseDate: releaseDate || null,
    mpaaRating: mpaaRatingClean,
    genres,
    formats,
    runtimeMinutes,
  };
}

// Rows where the title didn't yield a season number (specials, finales,
// bonus discs) are only safe to fold into the main series if they're the
// ONLY row for that series — otherwise treating them as "season 1" would
// silently collide with (and overwrite) a real season. Instead, these are
// split off as their own standalone one-off entry (keyed by their own
// title), so they're still trackable in the app without corrupting the
// real season's episode count.
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
        console.warn(`"${r.title}" — couldn't determine its season number and "${r.seriesTitle}" has other seasons, so treating it as its own standalone one-off entry rather than guessing (which could overwrite a real season).`);
        r.seriesTitle = r.title; // stand alone: its own series of one
        r.seasonNumber = 1;
        resolved.push(r);
        continue;
      }
      resolved.push(r);
    }
  }

  if (splitOffCount > 0) {
    console.warn(`${splitOffCount} TV row(s) with an ambiguous season number were split off as standalone entries (see above for which).`);
  }

  return resolved;
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parse(raw, { columns: false, skip_empty_lines: true, bom: true, relax_column_count: true });
  if (rows.length === 0) return [];

  // No-header export always has a 4-digit year in column index 1. If that's
  // not true of the first row, treat the first row as a header instead.
  const firstRowLooksLikeData = rows[0][1] && /^\d{4}$/.test(String(rows[0][1]).trim());

  let dataRows;
  let col; // field name -> column index

  if (firstRowLooksLikeData) {
    col = Object.fromEntries(CSV_COLUMNS.map((name, i) => [name, i]));
    dataRows = rows;
  } else {
    const headers = rows[0];
    col = {
      title: findHeaderIndex(headers, ALIASES.title),
      year: findHeaderIndex(headers, ALIASES.year),
      releaseDate: findHeaderIndex(headers, ALIASES.releaseDate),
      runtime: findHeaderIndex(headers, ALIASES.runtime),
      genres: findHeaderIndex(headers, ALIASES.genres),
      mpaaRating: findHeaderIndex(headers, ALIASES.mpaaRating),
      isTvSeries: findHeaderIndex(headers, ALIASES.isTvSeries),
      seriesTitle: findHeaderIndex(headers, ALIASES.seriesTitle),
      episodeCount: findHeaderIndex(headers, ALIASES.episodeCount),
      format: findHeaderIndex(headers, ALIASES.format),
    };
    dataRows = rows.slice(1);
    if (col.title == null) {
      throw new Error(
        `Could not find a Title column. Found headers: ${headers.join(', ')}. Add the exact header text to fieldAliases.js under "title".`
      );
    }
  }

  const get = (r, key) => (col[key] != null ? r[col[key]] : null);

  let skippedNoSeriesTitle = 0;

  const built = dataRows
    .map((r) => {
      const title = get(r, 'title');
      if (!title) return null;
      const row = buildRawRow({
        title,
        year: get(r, 'year'),
        releaseDate: get(r, 'releaseDate'),
        runtime: get(r, 'runtime'),
        genresRaw: get(r, 'genres'),
        mpaaRating: get(r, 'mpaaRating'),
        isTv: isTvValue(get(r, 'isTvSeries')),
        seriesTitleRaw: get(r, 'seriesTitle'),
        episodeCountRaw: get(r, 'episodeCount'),
        formatRaw: get(r, 'format'),
      });
      if (row.skipped) {
        skippedNoSeriesTitle += 1;
        return null;
      }
      return row;
    })
    .filter(Boolean);

  if (skippedNoSeriesTitle > 0) {
    console.warn(`${skippedNoSeriesTitle} TV row(s) had no derivable series title — skipped.`);
  }

  const movies = built.filter((r) => r.mediaType === 'movie');
  const tvRows = resolveSeasonNumbers(built.filter((r) => r.mediaType === 'tv'));
  for (const r of tvRows) {
    r.stableKey = seasonKey(r.seriesTitle, r.seasonNumber);
    r.seriesKey = seriesKey(r.seriesTitle);
  }

  return [...movies, ...tvRows];
}

module.exports = { parseCsv };
