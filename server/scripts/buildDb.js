#!/usr/bin/env node
/**
 * Build-time script (runs during `npm run build`, i.e. on Render's build
 * compute — never at runtime). Reads the Collectorz export from /data and
 * produces server/data/catalog.db, which the Express server reads
 * read-only at runtime.
 *
 * This file is rebuilt fresh on every deploy. It holds only catalog data
 * (titles, genres) — never watch-status or TV progress, which live in a
 * separate database on the persistent disk (see server/lib/stateDb.js) so
 * they survive rebuilds/restarts.
 *
 * IDs in this database (INTEGER PRIMARY KEY) are NOT stable across
 * rebuilds — row order can shift if your export changes. Anything that
 * needs to persist across rebuilds (watch status, progress) is keyed by
 * the stable_key / series_key strings instead (see scripts/keys.js).
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { parseCsv } = require('./parseCsv');
const { parseXml } = require('./parseXml');

const SOURCE_DIR = path.join(__dirname, '../../data');
const DB_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'catalog.db');

function findSourceFile() {
  const files = fs.readdirSync(SOURCE_DIR).filter((f) => /\.(csv|xml)$/i.test(f));
  if (files.length === 0) {
    throw new Error(
      `No .csv or .xml export found in ${SOURCE_DIR}. Export your collection from Collectorz and commit it there (see data/README.md).`
    );
  }
  if (files.length > 1) {
    console.warn(`Multiple export files found (${files.join(', ')}) — using ${files[0]}.`);
  }
  return path.join(SOURCE_DIR, files[0]);
}

function main() {
  const sourceFile = findSourceFile();
  console.log(`Reading export: ${sourceFile}`);
  const ext = path.extname(sourceFile).toLowerCase();
  const rows = ext === '.csv' ? parseCsv(sourceFile) : parseXml(sourceFile);

  if (rows.length === 0) {
    throw new Error('Parsed 0 titles from the export file. Check the field mapping in server/scripts/fieldAliases.js.');
  }
  const movieCount = rows.filter((r) => r.mediaType === 'movie').length;
  const tvCount = rows.filter((r) => r.mediaType === 'tv').length;
  console.log(`Parsed ${rows.length} rows (${movieCount} movies, ${tvCount} TV seasons).`);

  fs.mkdirSync(DB_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE titles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stable_key TEXT UNIQUE NOT NULL,
      series_key TEXT,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
      title TEXT NOT NULL,
      series_title TEXT,
      season_number INTEGER,
      episode_count INTEGER,
      year INTEGER,
      release_date TEXT,
      mpaa_rating TEXT,
      runtime_minutes INTEGER,
      formats TEXT
    );
    CREATE TABLE genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE title_genres (
      title_id INTEGER NOT NULL REFERENCES titles(id),
      genre_id INTEGER NOT NULL REFERENCES genres(id),
      PRIMARY KEY (title_id, genre_id)
    );
    CREATE TABLE formats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE title_formats (
      title_id INTEGER NOT NULL REFERENCES titles(id),
      format_id INTEGER NOT NULL REFERENCES formats(id),
      PRIMARY KEY (title_id, format_id)
    );
    CREATE INDEX idx_titles_media_type ON titles(media_type);
    CREATE INDEX idx_titles_year ON titles(year);
    CREATE INDEX idx_titles_rating ON titles(mpaa_rating);
    CREATE INDEX idx_titles_series_key ON titles(series_key);
  `);

  const insertTitle = db.prepare(`
    INSERT INTO titles (stable_key, series_key, media_type, title, series_title, season_number, episode_count, year, release_date, mpaa_rating, runtime_minutes, formats)
    VALUES (@stableKey, @seriesKey, @mediaType, @title, @seriesTitle, @seasonNumber, @episodeCount, @year, @releaseDate, @mpaaRating, @runtimeMinutes, @formats)
  `);
  const findGenre = db.prepare(`SELECT id FROM genres WHERE name = ?`);
  const insertGenre = db.prepare(`INSERT INTO genres (name) VALUES (?)`);
  const linkGenre = db.prepare(`INSERT OR IGNORE INTO title_genres (title_id, genre_id) VALUES (?, ?)`);
  const findFormat = db.prepare(`SELECT id FROM formats WHERE name = ?`);
  const insertFormat = db.prepare(`INSERT INTO formats (name) VALUES (?)`);
  const linkFormat = db.prepare(`INSERT OR IGNORE INTO title_formats (title_id, format_id) VALUES (?, ?)`);

  let skippedDuplicates = 0;

  const insertAll = db.transaction((allRows) => {
    for (const r of allRows) {
      let info;
      try {
        info = insertTitle.run({
          stableKey: r.stableKey,
          seriesKey: r.seriesKey || null,
          mediaType: r.mediaType,
          title: r.title,
          seriesTitle: r.seriesTitle || null,
          seasonNumber: r.seasonNumber ?? null,
          episodeCount: r.episodeCount ?? null,
          year: r.year || null,
          releaseDate: r.releaseDate || null,
          mpaaRating: r.mpaaRating || null,
          runtimeMinutes: r.runtimeMinutes || null,
          formats: r.formats && r.formats.length > 0 ? r.formats.join('; ') : null,
        });
      } catch (err) {
        if (String(err.message).includes('UNIQUE constraint failed')) {
          skippedDuplicates += 1;
          continue;
        }
        throw err;
      }
      const titleId = info.lastInsertRowid;
      for (const genreName of r.genres || []) {
        if (!genreName) continue;
        const existing = findGenre.get(genreName);
        const genreId = existing ? existing.id : insertGenre.run(genreName).lastInsertRowid;
        linkGenre.run(titleId, genreId);
      }
      for (const formatName of r.formats || []) {
        if (!formatName) continue;
        const existing = findFormat.get(formatName);
        const formatId = existing ? existing.id : insertFormat.run(formatName).lastInsertRowid;
        linkFormat.run(titleId, formatId);
      }
    }
  });
  insertAll(rows);

  if (skippedDuplicates > 0) {
    console.warn(`Skipped ${skippedDuplicates} duplicate row(s) (same title+year, or same series+season).`);
  }

  db.close();
  console.log(`Wrote ${DB_PATH}`);
}

main();
