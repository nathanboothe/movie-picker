// Stable keys let us reference a specific movie or TV series across catalog
// rebuilds, since the catalog's SQLite auto-increment IDs are NOT stable
// (they're regenerated fresh every deploy from whatever order the export
// happens to be in). Watch-status and TV progress are stored keyed by these
// strings instead of by row ID.

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Two different movies can share a title and year (e.g. a 1998 animated
// Mulan and an entirely different catalog entry also labeled "Mulan" 1998
// with a different runtime). Including runtime in the key keeps those
// distinct, while true duplicate rows (identical title/year/runtime) still
// collapse into one entry as intended.
function movieKey(title, year, runtimeMinutes) {
  return `movie|${normalize(title)}|${year || ''}|${runtimeMinutes || ''}`;
}

function seriesKey(seriesTitle) {
  return `tvseries|${normalize(seriesTitle)}`;
}

function seasonKey(seriesTitle, seasonNumber) {
  return `tv|${normalize(seriesTitle)}|s${seasonNumber}`;
}

module.exports = { normalize, movieKey, seriesKey, seasonKey };
