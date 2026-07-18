const path = require('path');
const Database = require('better-sqlite3');

// Rebuilt fresh on every deploy (see scripts/buildDb.js). Read-only at
// runtime — this file never needs to survive a restart, so it's fine that
// Render's free/ephemeral filesystem doesn't preserve it.
const DB_PATH = path.join(__dirname, '../data/catalog.db');

let db = null;

function getCatalogDb() {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  }
  return db;
}

module.exports = { getCatalogDb, DB_PATH };
