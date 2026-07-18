const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Watch status and TV episode progress must survive deploys and restarts,
// which the catalog DB does not need to (it's rebuilt from the export every
// deploy). This file lives on the Render persistent disk, whose mount path
// is provided via DATA_DIR. Locally (no disk attached), it falls back to
// server/data so `npm start` still works for testing.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'state.db');

let db = null;

function getStateDb() {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS title_status (
        key TEXT PRIMARY KEY,
        media_type TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tv_progress (
        series_key TEXT PRIMARY KEY,
        series_title TEXT NOT NULL,
        last_watched_season INTEGER NOT NULL DEFAULT 0,
        last_watched_episode INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
  return db;
}

module.exports = { getStateDb, DB_PATH };
