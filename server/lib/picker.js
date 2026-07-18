// Shared logic for candidate queries and TV episode-progress math. Used by
// server/index.js route handlers.

function resolvedMovieKeys(stateDb) {
  return new Set(
    stateDb
      .prepare(`SELECT key FROM title_status WHERE media_type = 'movie' AND status IN ('watched','seen','ignored')`)
      .all()
      .map((r) => r.key)
  );
}

// Series excluded from a *fresh* random pick: already resolved (seen/ignored/
// completed), or already in progress (should be resumed, not re-picked).
function excludedSeriesKeysForFreshPick(stateDb) {
  return new Set(
    stateDb
      .prepare(`SELECT key FROM title_status WHERE media_type = 'tv' AND status IN ('seen','ignored','completed','in_progress')`)
      .all()
      .map((r) => r.key)
  );
}

function queryMovieCandidates(catalogDb, stateDb, { genres = [], ratings = [], formats = [], yearFrom = null, yearTo = null, excludeKey = null }) {
  const excluded = resolvedMovieKeys(stateDb);
  if (excludeKey) excluded.add(excludeKey);

  let sql = `SELECT DISTINCT t.id, t.stable_key, t.title, t.year, t.mpaa_rating, t.runtime_minutes, t.formats
             FROM titles t`;
  const params = [];
  const where = [`t.media_type = 'movie'`];

  if (genres.length > 0) {
    sql += ` JOIN title_genres tg ON tg.title_id = t.id JOIN genres g ON g.id = tg.genre_id`;
    where.push(`g.name IN (${genres.map(() => '?').join(',')})`);
    params.push(...genres);
  }
  if (formats.length > 0) {
    sql += ` JOIN title_formats tf ON tf.title_id = t.id JOIN formats f ON f.id = tf.format_id`;
    where.push(`f.name IN (${formats.map(() => '?').join(',')})`);
    params.push(...formats);
  }
  if (ratings.length > 0) {
    where.push(`t.mpaa_rating IN (${ratings.map(() => '?').join(',')})`);
    params.push(...ratings);
  }
  if (yearFrom) {
    where.push('t.year >= ?');
    params.push(yearFrom);
  }
  if (yearTo) {
    where.push('t.year <= ?');
    params.push(yearTo);
  }
  sql += ' WHERE ' + where.join(' AND ');

  const rows = db_all(catalogDb, sql, params);
  return rows.filter((r) => !excluded.has(r.stable_key));
}

// Fresh TV pick: candidates are Season 1 rows of series not yet started/
// resolved. Filters (genre/rating/format/year) are evaluated against Season
// 1's own metadata, since that's what would actually start playing.
function queryTvSeriesCandidates(catalogDb, stateDb, { genres = [], ratings = [], formats = [], yearFrom = null, yearTo = null, excludeKey = null }) {
  const excluded = excludedSeriesKeysForFreshPick(stateDb);
  if (excludeKey) excluded.add(excludeKey);

  let sql = `SELECT DISTINCT t.id, t.series_key, t.series_title, t.year, t.mpaa_rating, t.formats
             FROM titles t`;
  const params = [];
  const where = [`t.media_type = 'tv'`, `t.season_number = 1`];

  if (genres.length > 0) {
    sql += ` JOIN title_genres tg ON tg.title_id = t.id JOIN genres g ON g.id = tg.genre_id`;
    where.push(`g.name IN (${genres.map(() => '?').join(',')})`);
    params.push(...genres);
  }
  if (formats.length > 0) {
    sql += ` JOIN title_formats tf ON tf.title_id = t.id JOIN formats f ON f.id = tf.format_id`;
    where.push(`f.name IN (${formats.map(() => '?').join(',')})`);
    params.push(...formats);
  }
  if (ratings.length > 0) {
    where.push(`t.mpaa_rating IN (${ratings.map(() => '?').join(',')})`);
    params.push(...ratings);
  }
  if (yearFrom) {
    where.push('t.year >= ?');
    params.push(yearFrom);
  }
  if (yearTo) {
    where.push('t.year <= ?');
    params.push(yearTo);
  }
  sql += ' WHERE ' + where.join(' AND ');

  const rows = db_all(catalogDb, sql, params);
  return rows.filter((r) => !excluded.has(r.series_key));
}

function db_all(db, sql, params) {
  return db.prepare(sql).all(...params);
}

function getSeasonEpisodeCount(catalogDb, seriesKey, seasonNumber) {
  const row = catalogDb
    .prepare(`SELECT episode_count FROM titles WHERE media_type = 'tv' AND series_key = ? AND season_number = ?`)
    .get(seriesKey, seasonNumber);
  return row ? row.episode_count : null;
}

function getNextSeasonNumber(catalogDb, seriesKey, afterSeason) {
  const row = catalogDb
    .prepare(`SELECT MIN(season_number) as n FROM titles WHERE media_type = 'tv' AND series_key = ? AND season_number > ?`)
    .get(seriesKey, afterSeason);
  return row && row.n != null ? row.n : null;
}

// Given the last-watched (season, episode) pointer (0,0 means nothing
// watched yet), compute the next episode to watch. Returns null if every
// owned season/episode has been watched (series complete).
function computeNextEpisode(catalogDb, seriesKey, lastWatchedSeason, lastWatchedEpisode) {
  if (!lastWatchedSeason || lastWatchedSeason < 1) {
    return { season: 1, episode: 1 };
  }
  const episodeCount = getSeasonEpisodeCount(catalogDb, seriesKey, lastWatchedSeason);
  if (episodeCount && lastWatchedEpisode < episodeCount) {
    return { season: lastWatchedSeason, episode: lastWatchedEpisode + 1 };
  }
  const nextSeason = getNextSeasonNumber(catalogDb, seriesKey, lastWatchedSeason);
  if (nextSeason) {
    return { season: nextSeason, episode: 1 };
  }
  return null; // fully watched through everything owned
}

// "What episode are you on?" (statedSeason/statedEpisode) means that
// episode has NOT been watched yet — it's next up. Converts that into a
// last-watched pointer (everything strictly before it).
function catchUpPointer(catalogDb, seriesKey, statedSeason, statedEpisode) {
  if (statedEpisode > 1) {
    return { lastWatchedSeason: statedSeason, lastWatchedEpisode: statedEpisode - 1 };
  }
  if (statedSeason <= 1) {
    return { lastWatchedSeason: 0, lastWatchedEpisode: 0 };
  }
  const prevSeason = statedSeason - 1;
  const prevEpisodeCount = getSeasonEpisodeCount(catalogDb, seriesKey, prevSeason) || 0;
  return { lastWatchedSeason: prevSeason, lastWatchedEpisode: prevEpisodeCount };
}

function getSeasonMetadata(catalogDb, seriesKey, seasonNumber) {
  return catalogDb
    .prepare(`SELECT id, mpaa_rating, formats FROM titles WHERE media_type = 'tv' AND series_key = ? AND season_number = ?`)
    .get(seriesKey, seasonNumber);
}

module.exports = {
  queryMovieCandidates,
  queryTvSeriesCandidates,
  computeNextEpisode,
  catchUpPointer,
  getSeasonEpisodeCount,
  getSeasonMetadata,
};
