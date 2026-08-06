const path = require('path');
const express = require('express');
const { getCatalogDb } = require('./lib/catalogDb');
const { getStateDb } = require('./lib/stateDb');
const { checkAppPin } = require('./lib/appGate');
const {
  queryMovieCandidates,
  queryTvSeriesCandidates,
  computeNextEpisode,
  catchUpPointer,
  getSeasonMetadata,
} = require('./lib/picker');

const app = express();
app.use(express.json());

// Public endpoint the PIN screen calls to check a candidate PIN — must be
// registered before the requireAppPin gate below, since it can't require
// itself.
app.post('/api/app-gate/verify-pin', (req, res) => {
  const { pin } = req.body || {};
  const result = checkAppPin(pin);
  if (!result.ok) {
    const status = result.reason === 'not_configured' ? 503 : 401;
    return res.status(status).json({
      ok: false,
      error: result.reason === 'not_configured' ? 'App PIN is not configured on the server (set APP_PIN).' : 'Incorrect PIN.',
    });
  }
  res.json({ ok: true });
});

function requireAppPin(req, res, next) {
  const result = checkAppPin(req.header('X-App-Pin'));
  if (!result.ok) {
    const status = result.reason === 'not_configured' ? 503 : 401;
    return res.status(status).json({
      error: result.reason === 'not_configured' ? 'App PIN is not configured on the server (set APP_PIN).' : 'Incorrect PIN.',
      lockedOut: true,
    });
  }
  next();
}

// Everything else under /api/* requires the PIN.
app.use('/api', requireAppPin);

function parseFormats(stored) {
  return stored ? stored.split(';').map((s) => s.trim()).filter(Boolean) : [];
}

function nowIso() {
  return new Date().toISOString();
}

function upsertTitleStatus(stateDb, key, mediaType, status) {
  stateDb
    .prepare(
      `INSERT INTO title_status (key, media_type, status, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
    )
    .run(key, mediaType, status, nowIso());
}

function upsertProgress(stateDb, seriesKey, seriesTitle, season, episode) {
  const now = nowIso();
  stateDb
    .prepare(
      `INSERT INTO tv_progress (series_key, series_title, last_watched_season, last_watched_episode, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(series_key) DO UPDATE SET
         series_title = excluded.series_title,
         last_watched_season = excluded.last_watched_season,
         last_watched_episode = excluded.last_watched_episode,
         updated_at = excluded.updated_at`
    )
    .run(seriesKey, seriesTitle, season, episode, now, now);
}

function titleGenres(catalogDb, titleId) {
  return catalogDb
    .prepare(`SELECT g.name FROM genres g JOIN title_genres tg ON tg.genre_id = g.id WHERE tg.title_id = ? ORDER BY g.name`)
    .all(titleId)
    .map((r) => r.name);
}

// ---- Filters ----

app.get('/api/filters', (req, res) => {
  try {
    const mediaType = req.query.type === 'tv' ? 'tv' : 'movie';
    const db = getCatalogDb();
    const seasonClause = mediaType === 'tv' ? 'AND season_number = 1' : '';

    const genres = db
      .prepare(
        `SELECT DISTINCT g.name FROM genres g
         JOIN title_genres tg ON tg.genre_id = g.id
         JOIN titles t ON t.id = tg.title_id
         WHERE t.media_type = ? ${seasonClause}
         ORDER BY g.name`
      )
      .all(mediaType)
      .map((r) => r.name);

    const ratings = db
      .prepare(
        `SELECT DISTINCT mpaa_rating FROM titles
         WHERE media_type = ? ${seasonClause} AND mpaa_rating IS NOT NULL AND mpaa_rating != ''
         ORDER BY mpaa_rating`
      )
      .all(mediaType)
      .map((r) => r.mpaa_rating);

    const formats = db
      .prepare(
        `SELECT DISTINCT f.name FROM formats f
         JOIN title_formats tf ON tf.format_id = f.id
         JOIN titles t ON t.id = tf.title_id
         WHERE t.media_type = ? ${seasonClause}
         ORDER BY f.name`
      )
      .all(mediaType)
      .map((r) => r.name);

    const yearRow = db
      .prepare(`SELECT MIN(year) as minYear, MAX(year) as maxYear FROM titles WHERE media_type = ? ${seasonClause} AND year IS NOT NULL`)
      .get(mediaType);

    res.json({ genres, ratings, formats, minYear: yearRow.minYear, maxYear: yearRow.maxYear });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load filters. Check server logs (catalog.db may be missing — did the build step run?).' });
  }
});

// ---- In-progress TV series ----

app.get('/api/tv/in-progress', (req, res) => {
  try {
    const catalogDb = getCatalogDb();
    const stateDb = getStateDb();

    const rows = stateDb
      .prepare(`SELECT key FROM title_status WHERE media_type = 'tv' AND status = 'in_progress'`)
      .all();

    const results = rows
      .map(({ key }) => {
        const progress = stateDb.prepare(`SELECT * FROM tv_progress WHERE series_key = ?`).get(key);
        if (!progress) return null;
        const nextUp = computeNextEpisode(catalogDb, key, progress.last_watched_season, progress.last_watched_episode);
        return {
          seriesKey: key,
          seriesTitle: progress.series_title,
          lastWatchedSeason: progress.last_watched_season,
          lastWatchedEpisode: progress.last_watched_episode,
          nextUp,
        };
      })
      .filter(Boolean);

    res.json({ series: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load in-progress series.' });
  }
});

// ---- Fresh random pick (movie or new TV series) ----

app.post('/api/pick', (req, res) => {
  try {
    const { mediaType, genres = [], excludeGenres = [], ratings = [], formats = [], yearFrom = null, yearTo = null, excludeKey = null } = req.body || {};
    const catalogDb = getCatalogDb();
    const stateDb = getStateDb();
    const filterArgs = { genres, excludeGenres, ratings, formats, yearFrom, yearTo, excludeKey };

    if (mediaType === 'movie') {
      let candidates = queryMovieCandidates(catalogDb, stateDb, filterArgs);
      if (candidates.length === 0 && excludeKey) {
        candidates = queryMovieCandidates(catalogDb, stateDb, { ...filterArgs, excludeKey: null });
      }
      if (candidates.length === 0) return res.json({ result: null, poolSize: 0 });

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      return res.json({
        poolSize: candidates.length,
        result: {
          mediaType: 'movie',
          key: chosen.stable_key,
          title: chosen.title,
          year: chosen.year,
          mpaaRating: chosen.mpaa_rating,
          runtimeMinutes: chosen.runtime_minutes,
          formats: parseFormats(chosen.formats),
          genres: titleGenres(catalogDb, chosen.id),
        },
      });
    }

    if (mediaType === 'tv') {
      let candidates = queryTvSeriesCandidates(catalogDb, stateDb, filterArgs);
      if (candidates.length === 0 && excludeKey) {
        candidates = queryTvSeriesCandidates(catalogDb, stateDb, { ...filterArgs, excludeKey: null });
      }
      if (candidates.length === 0) return res.json({ result: null, poolSize: 0 });

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      return res.json({
        poolSize: candidates.length,
        result: {
          mediaType: 'tv',
          seriesKey: chosen.series_key,
          seriesTitle: chosen.series_title,
          season: 1,
          episode: 1,
          year: chosen.year,
          mpaaRating: chosen.mpaa_rating,
          formats: parseFormats(chosen.formats),
          genres: titleGenres(catalogDb, chosen.id),
        },
      });
    }

    res.status(400).json({ error: 'mediaType must be "movie" or "tv".' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not pick a title. Check server logs.' });
  }
});

// ---- Resume an in-progress TV series ----

app.post('/api/tv/resume', (req, res) => {
  try {
    const { seriesKey, watchedMoreThanOne, season, episode } = req.body || {};
    const catalogDb = getCatalogDb();
    const stateDb = getStateDb();

    const progress = stateDb.prepare(`SELECT * FROM tv_progress WHERE series_key = ?`).get(seriesKey);
    if (!progress) return res.status(404).json({ error: 'No progress found for this series.' });

    if (watchedMoreThanOne) {
      if (!season || !episode) {
        return res.status(400).json({ error: 'season and episode are required when watchedMoreThanOne is true.' });
      }
      const pointer = catchUpPointer(catalogDb, seriesKey, season, episode);
      upsertProgress(stateDb, seriesKey, progress.series_title, pointer.lastWatchedSeason, pointer.lastWatchedEpisode);
    }

    const updated = stateDb.prepare(`SELECT * FROM tv_progress WHERE series_key = ?`).get(seriesKey);
    const nextUp = computeNextEpisode(catalogDb, seriesKey, updated.last_watched_season, updated.last_watched_episode);

    if (!nextUp) {
      upsertTitleStatus(stateDb, seriesKey, 'tv', 'completed');
      return res.json({ result: null, completed: true, seriesTitle: progress.series_title });
    }

    const seasonMeta = getSeasonMetadata(catalogDb, seriesKey, nextUp.season);

    res.json({
      result: {
        mediaType: 'tv',
        seriesKey,
        seriesTitle: progress.series_title,
        season: nextUp.season,
        episode: nextUp.episode,
        mpaaRating: seasonMeta ? seasonMeta.mpaa_rating : null,
        formats: seasonMeta ? parseFormats(seasonMeta.formats) : [],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not resume series. Check server logs.' });
  }
});

// ---- Mark a TV episode watched (advances progress) ----

app.post('/api/tv/watch', (req, res) => {
  try {
    const { seriesKey, seriesTitle, season, episode } = req.body || {};
    if (!seriesKey || !seriesTitle || !season || !episode) {
      return res.status(400).json({ error: 'seriesKey, seriesTitle, season, and episode are required.' });
    }
    const catalogDb = getCatalogDb();
    const stateDb = getStateDb();

    upsertProgress(stateDb, seriesKey, seriesTitle, season, episode);
    const nextUp = computeNextEpisode(catalogDb, seriesKey, season, episode);

    if (!nextUp) {
      upsertTitleStatus(stateDb, seriesKey, 'tv', 'completed');
      return res.json({ completed: true, nextUp: null });
    }

    upsertTitleStatus(stateDb, seriesKey, 'tv', 'in_progress');
    const seasonMeta = getSeasonMetadata(catalogDb, seriesKey, nextUp.season);
    res.json({
      completed: false,
      nextUp: {
        ...nextUp,
        mpaaRating: seasonMeta ? seasonMeta.mpaa_rating : null,
        formats: seasonMeta ? parseFormats(seasonMeta.formats) : [],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not mark episode watched. Check server logs.' });
  }
});

// ---- Resolve (Already Seen / Ignore) for TV series ----

app.post('/api/tv/resolve', (req, res) => {
  try {
    const { seriesKey, action } = req.body || {};
    if (!seriesKey || !['seen', 'ignore'].includes(action)) {
      return res.status(400).json({ error: 'seriesKey and a valid action ("seen" or "ignore") are required.' });
    }
    const stateDb = getStateDb();
    upsertTitleStatus(stateDb, seriesKey, 'tv', action === 'seen' ? 'seen' : 'ignored');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update series status. Check server logs.' });
  }
});

// ---- Resolve (Watch / Already Seen / Ignore) for movies ----

app.post('/api/resolve', (req, res) => {
  try {
    const { key, action } = req.body || {};
    const statusMap = { watch: 'watched', seen: 'seen', ignore: 'ignored' };
    if (!key || !statusMap[action]) {
      return res.status(400).json({ error: 'key and a valid action ("watch", "seen", or "ignore") are required.' });
    }
    const stateDb = getStateDb();
    upsertTitleStatus(stateDb, key, 'movie', statusMap[action]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update movie status. Check server logs.' });
  }
});

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`movie-picker listening on ${PORT}`));
