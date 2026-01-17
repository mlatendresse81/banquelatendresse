const { run } = require('./db');
const bcrypt = require('bcrypt');

(async () => {
  try {
    // Create tables
    await run(`CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`);
    await run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('student','banker','teacher')),
      class_id INTEGER,
      password_hash TEXT NOT NULL,
      FOREIGN KEY(class_id) REFERENCES classes(id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS accounts (
      user_id INTEGER PRIMARY KEY,
      balance REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      reason TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      overridden_by INTEGER,
      overridden_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      salary REAL NOT NULL
    )`);
    await run(`CREATE TABLE IF NOT EXISTS job_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      job_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(job_id) REFERENCES jobs(id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS absences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      job_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      replacement_user_id INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(job_id) REFERENCES jobs(id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      closed_at TEXT
    )`);
    await run(`CREATE TABLE IF NOT EXISTS admin_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      info TEXT,
      created_at TEXT NOT NULL,
      created_by INTEGER
    )`);

    // Seed classes
    await run('INSERT OR IGNORE INTO classes(name) VALUES (?), (?)', ['Matin', 'Midi']);

    // Seed jobs
    const jobs = [
      ['Assistant', 90],
      ['Facteur', 65],
      ['Concièrge', 80],
      ['Technicien', 30],
      ['Présences', 40],
      ['Banquier', 90]
    ];
    for (const [name, salary] of jobs) {
      await run('INSERT OR IGNORE INTO jobs(name, salary) VALUES (?,?)', [name, salary]);
    }

    // Create teacher
    const teacherHash = await bcrypt.hash('ChangeMe123!', 10);
    await run('INSERT OR IGNORE INTO users(name, username, role, class_id, password_hash) VALUES (?,?,?,?,?)', ['Mme Latendresse', 'MmeLatendresse', 'teacher', null, teacherHash]);

    // Create bankers for Class #1 Matin
    const bankerPw = await bcrypt.hash('Banker123!', 10);
    const matinId = 1; // assuming inserted first
    const midiId = 2;
    const matinBankers = ['Rowynn', 'Sophie', 'Carter', 'Parker'];
    for (const name of matinBankers) {
      const username = name.toLowerCase() + '.matin';
      await run('INSERT OR IGNORE INTO users(name, username, role, class_id, password_hash) VALUES (?,?,?,?,?)', [name, username, 'banker', matinId, bankerPw]);
    }
    // Create bankers for Class #2 Midi
    const midiBankers = ['Haja', 'Caeden', 'Naomi', 'Brycen'];
    for (const name of midiBankers) {
      const username = name.toLowerCase() + '.midi';
      await run('INSERT OR IGNORE INTO users(name, username, role, class_id, password_hash) VALUES (?,?,?,?,?)', [name, username, 'banker', midiId, bankerPw]);
    }

    // Create accounts for all users except teacher
    const users = [
      ['Rowynn', 1], ['Sophie', 1], ['Carter', 1], ['Parker', 1],
      ['Haja', 2], ['Caeden', 2], ['Naomi', 2], ['Brycen', 2]
    ];
    for (const [name, cid] of users) {
      const u = await new Promise((resolve, reject)=>{
        const sqlite3 = require('sqlite3').verbose();
        const path = require('path');
        const DB_PATH = path.join(__dirname, '..', 'data', 'classbank.sqlite');
        const conn = new sqlite3.Database(DB_PATH);
        conn.get('SELECT id FROM users WHERE name=? AND class_id=?', [name, cid], (err, row)=>{
          if (err) reject(err); else resolve(row);
        });
      });
      if (u) await run('INSERT OR IGNORE INTO accounts(user_id, balance) VALUES(?, 0)', [u.id]);
    }

    console.log('Database initialized.');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
