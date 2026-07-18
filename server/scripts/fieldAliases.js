// Column/field mapping for the Collectorz export.
//
// Your actual export has NO header row and always uses this fixed column
// order (confirmed from a real sample):
//   Title, Year, Runtime, Genres, Is TV Series, Series, Episode Count, Format, Rating
//
// If you ever re-export with a header row instead (or in a different
// order), the importer detects that automatically — column 2 (Year) being
// a 4-digit number is what signals "this is data, not a header" — and
// falls back to matching by header name using ALIASES below.

module.exports = {
  // Position-based column order (0-indexed), used when the export has no header row.
  CSV_COLUMNS: ['title', 'year', 'runtime', 'genres', 'isTvSeries', 'seriesTitle', 'episodeCount', 'format', 'mpaaRating'],

  // Header-name aliases, used only as a fallback if a header row is detected.
  ALIASES: {
    title: ['title'],
    year: ['year'],
    releaseDate: ['release date', 'releasedate'],
    mpaaRating: ['certification', 'mpaa', 'mpaa rating', 'audience rating', 'rating'],
    genres: ['genres', 'genre'],
    runtime: ['running time', 'runtime', 'runtime (min)', 'runtime minutes'],
    isTvSeries: ['is tv series', 'tv series', 'is tv'],
    seriesTitle: ['series', 'series title', 'show title', 'show', 'show name'],
    seasonNumber: ['season', 'season number', 'season #', 'season no'],
    episodeCount: ['episodes', 'episode', 'episode count', 'number of episodes', '# episodes'],
    format: ['format', 'formats', 'media format', 'source'],
  },

  // Values that mean "true" in the Is TV Series column (case-insensitive).
  TV_TRUE_VALUES: ['yes', 'true', '1'],

  // The export has no explicit season-number column — it has to be parsed
  // out of the Title (e.g. "12 Monkeys: Season 1"). Rows whose title doesn't
  // match this pattern (e.g. a single-episode special) are treated as season 1.
  TITLE_SEASON_PATTERN: /^(.*?)[:\-]\s*season\s*(\d+)\s*$/i,
};
