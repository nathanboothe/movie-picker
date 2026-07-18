const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '../data/movies.db');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  }
  return db;
}

module.exports = { getDb, DB_PATH };
