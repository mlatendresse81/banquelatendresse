const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = path.join(__dirname, '..', 'data', 'classbank.sqlite');

const db = new sqlite3.Database(DB_PATH);

function run(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

function all(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function(err, rows) {
      if (err) reject(err); else resolve(rows);
    });
  });
}

function get(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function(err, row) {
      if (err) reject(err); else resolve(row);
    });
  });
}

module.exports = { db, run, all, get };
