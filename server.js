const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const { db, run, all, get } = require('./db');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, '..', 'data') }),
  secret: process.env.SESSION_SECRET || 'classbank-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000*60*60*8 } // 8 hours
}));

app.use(express.static(path.join(__dirname, '..', 'public')));

const ROLES = { STUDENT: 'student', BANKER: 'banker', TEACHER: 'teacher' };

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    const roles = Array.isArray(role) ? role : [role];
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  }
}

app.get('/api/health', (req,res)=>res.json({ ok: true }));

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid username or password' });
    req.session.user = { id: user.id, name: user.name, role: user.role, class_id: user.class_id };
    res.json({ message: 'Logged in', user: req.session.user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/logout', (req,res)=>{
  req.session.destroy(()=>res.json({ message: 'Logged out' }));
});

app.get('/api/me', requireAuth, (req,res)=>{
  res.json({ user: req.session.user });
});

// Forgot password creates a ticket; teacher can resolve by setting a new password
app.post('/api/forgot-password', async (req, res) => {
  const { username } = req.body;
  const user = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (!user) return res.status(200).json({ message: 'If the account exists, your teacher will help you reset.'});
  await run('INSERT INTO password_resets(user_id, created_at, status) VALUES(?, datetime("now"), ?)', [user.id, 'open']);
  res.json({ message: 'Request sent. Please let your teacher know.'});
});

// Teacher can list and resolve password resets
app.get('/api/admin/password-resets', requireRole(ROLES.TEACHER), async (req,res)=>{
  const rows = await all('SELECT pr.id, u.name, u.username, pr.created_at, pr.status FROM password_resets pr JOIN users u ON u.id = pr.user_id WHERE pr.status = "open" ORDER BY pr.created_at');
  res.json(rows);
});
app.post('/api/admin/set-password', requireRole(ROLES.TEACHER), async (req,res)=>{
  const { user_id, new_password } = req.body;
  const hash = await bcrypt.hash(new_password, 10);
  await run('UPDATE users SET password_hash=? WHERE id=?', [hash, user_id]);
  await run('UPDATE password_resets SET status="closed", closed_at = datetime("now") WHERE user_id=? AND status="open"', [user_id]);
  res.json({ message: 'Password updated' });
});

// Classes and students
app.get('/api/classes', requireAuth, async (req,res)=>{
  const rows = await all('SELECT * FROM classes ORDER BY name');
  res.json(rows);
});

app.get('/api/students', requireAuth, async (req,res)=>{
  const class_id = req.query.class_id || req.session.user.class_id;
  let rows;
  if (req.session.user.role === ROLES.TEACHER) {
    rows = await all('SELECT id, name, class_id, role FROM users WHERE role IN ("student","banker") AND class_id = ? ORDER BY name', [class_id]);
  } else if (req.session.user.role === ROLES.BANKER) {
    rows = await all('SELECT id, name, class_id, role FROM users WHERE role IN ("student","banker") AND class_id = ? ORDER BY name', [req.session.user.class_id]);
  } else {
    // student can only see themselves
    rows = await all('SELECT id, name, class_id, role FROM users WHERE id = ?', [req.session.user.id]);
  }
  res.json(rows);
});

app.get('/api/students/:id', requireAuth, async (req,res)=>{
  const id = req.params.id;
  const user = req.session.user;
  const target = await get('SELECT id, name, class_id, role FROM users WHERE id=?', [id]);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (user.role === ROLES.STUDENT && user.id !== target.id) return res.status(403).json({ error: 'Forbidden' });
  if (user.role === ROLES.BANKER && user.class_id !== target.class_id) return res.status(403).json({ error: 'Forbidden' });
  const account = await get('SELECT balance FROM accounts WHERE user_id=?', [id]);
  res.json({ ...target, balance: account ? account.balance : 0 });
});

// Admin: add/remove student, change password
app.post('/api/students', requireRole([ROLES.TEACHER, ROLES.BANKER]), async (req,res)=>{
  // Bankers can add students in their class only
  const actor = req.session.user;
  const { name, username, class_id, role } = req.body;
  const targetClassId = actor.role === ROLES.BANKER ? actor.class_id : class_id;
  const safeRole = (role === ROLES.BANKER && actor.role === ROLES.TEACHER) ? ROLES.BANKER : ROLES.STUDENT;
  const password_hash = await bcrypt.hash('Welcome123', 10);
  try {
    const result = await run('INSERT INTO users(name, username, role, class_id, password_hash) VALUES(?,?,?,?,?)', [name, username, safeRole, targetClassId, password_hash]);
    const uid = result.lastID;
    await run('INSERT INTO accounts(user_id, balance) VALUES(?, ?)', [uid, 0]);
    res.json({ id: uid, message: 'Student added with default password "Welcome123"' });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/students/:id', requireRole(ROLES.TEACHER), async (req,res)=>{
  const id = req.params.id;
  await run('DELETE FROM accounts WHERE user_id=?', [id]);
  await run('DELETE FROM users WHERE id=?', [id]);
  res.json({ message: 'Student removed' });
});

app.post('/api/users/:id/password', requireRole([ROLES.TEACHER, ROLES.BANKER]), async (req,res)=>{
  const { id } = req.params; const { new_password } = req.body;
  const actor = req.session.user;
  const target = await get('SELECT id, class_id FROM users WHERE id=?', [id]);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (actor.role === ROLES.BANKER && actor.class_id !== target.class_id) return res.status(403).json({ error: 'Forbidden' });
  const hash = await bcrypt.hash(new_password, 10);
  await run('UPDATE users SET password_hash=? WHERE id=?', [hash, id]);
  res.json({ message: 'Password updated' });
});

// Transactions
app.get('/api/transactions', requireAuth, async (req,res)=>{
  const student_id = req.query.student_id || req.session.user.id;
  const actor = req.session.user;
  const target = await get('SELECT id, class_id FROM users WHERE id=?', [student_id]);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (actor.role === ROLES.BANKER && actor.class_id !== target.class_id) return res.status(403).json({ error: 'Forbidden' });
  if (actor.role === ROLES.STUDENT && actor.id !== target.id) return res.status(403).json({ error: 'Forbidden' });
  const rows = await all('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC', [student_id]);
  res.json(rows);
});

app.post('/api/transactions', requireRole([ROLES.BANKER, ROLES.TEACHER]), async (req,res)=>{
  const { user_id, amount, category, reason } = req.body; // category: reward, deduction, bravo, self_eval, payroll, adjustment
  const actor = req.session.user;
  const target = await get('SELECT id, class_id FROM users WHERE id=?', [user_id]);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (actor.role === ROLES.BANKER && actor.class_id !== target.class_id) return res.status(403).json({ error: 'Forbidden' });
  const created_by = actor.id;
  await run('INSERT INTO transactions (user_id, amount, category, reason, created_by, created_at) VALUES (?,?,?,?,?, datetime("now"))', [user_id, amount, category, reason || null, created_by]);
  // Update balance (overdraft allowed here)
  await run('UPDATE accounts SET balance = balance + ? WHERE user_id=?', [amount, user_id]);
  const account = await get('SELECT balance FROM accounts WHERE user_id=?', [user_id]);
  res.json({ message: 'Transaction recorded', balance: account.balance });
});

// Override transactions (admin only)
app.post('/api/transactions/:id/override', requireRole(ROLES.TEACHER), async (req,res)=>{
  const { id } = req.params; const { new_amount, note } = req.body;
  const tx = await get('SELECT * FROM transactions WHERE id=?', [id]);
  if (!tx) return res.status(404).json({ error: 'Not found' });
  // revert previous amount then apply new
  await run('UPDATE accounts SET balance = balance - ? WHERE user_id=?', [tx.amount, tx.user_id]);
  await run('UPDATE transactions SET amount=?, reason=COALESCE(reason,"") || " | override: " || ?, overridden_by=?, overridden_at=datetime("now") WHERE id=?', [new_amount, note || '', req.session.user.id, id]);
  await run('UPDATE accounts SET balance = balance + ? WHERE user_id=?', [new_amount, tx.user_id]);
  const account = await get('SELECT balance FROM accounts WHERE user_id=?', [tx.user_id]);
  res.json({ message: 'Transaction overridden', balance: account.balance });
});

// Store purchases (no overdraft allowed)
app.post('/api/store/purchase', requireRole([ROLES.BANKER, ROLES.TEACHER]), async (req,res)=>{
  const { user_id, item_name, price } = req.body;
  const account = await get('SELECT balance FROM accounts WHERE user_id=?', [user_id]);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (account.balance < price) return res.status(400).json({ error: 'Insufficient funds for store purchase' });
  await run('INSERT INTO transactions (user_id, amount, category, reason, created_by, created_at) VALUES (?,?,?,?,?, datetime("now"))', [user_id, -Math.abs(price), 'store', item_name, req.session.user.id]);
  await run('UPDATE accounts SET balance = balance - ? WHERE user_id=?', [Math.abs(price), user_id]);
  const updated = await get('SELECT balance FROM accounts WHERE user_id=?', [user_id]);
  res.json({ message: 'Purchase complete', balance: updated.balance });
});

// Jobs
app.get('/api/jobs', requireAuth, async (req,res)=>{
  const rows = await all('SELECT * FROM jobs ORDER BY name');
  res.json(rows);
});

// Assign job
app.post('/api/jobs/assign', requireRole([ROLES.BANKER, ROLES.TEACHER]), async (req,res)=>{
  const { user_id, job_id, start_date, end_date } = req.body; // ISO dates
  const actor = req.session.user;
  const target = await get('SELECT id, class_id FROM users WHERE id=?', [user_id]);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (actor.role === ROLES.BANKER && actor.class_id !== target.class_id) return res.status(403).json({ error: 'Forbidden' });
  await run('INSERT INTO job_assignments(user_id, job_id, start_date, end_date) VALUES(?,?,?,?)', [user_id, job_id, start_date, end_date]);
  res.json({ message: 'Job assigned' });
});

// Log absence (with replacement)
app.post('/api/jobs/absence', requireRole([ROLES.BANKER, ROLES.TEACHER]), async (req,res)=>{
  const { user_id, date, job_id, replacement_user_id } = req.body; // date ISO
  await run('INSERT INTO absences(user_id, date, job_id, replacement_user_id) VALUES(?,?,?,?)', [user_id, date, job_id, replacement_user_id || null]);
  res.json({ message: 'Absence recorded' });
});

// Run payroll for a pay period [start_date, end_date]
app.post('/api/payroll/run', requireRole([ROLES.BANKER, ROLES.TEACHER]), async (req,res)=>{
  const { start_date, end_date } = req.body;
  // For each active assignment overlapping the period, pay salary once, minus 10% per absence day, and pay that 10% to replacement
  const assignments = await all('SELECT ja.*, u.class_id FROM job_assignments ja JOIN users u ON u.id = ja.user_id WHERE NOT (ja.end_date < ? OR ja.start_date > ?)', [start_date, end_date]);
  let summary = [];
  for (const asg of assignments) {
    // fetch job salary
    const job = await get('SELECT * FROM jobs WHERE id=?', [asg.job_id]);
    if (!job) continue;
    const salary = job.salary;
    // count absences for that user & job in range
    const abs = await all('SELECT * FROM absences WHERE user_id=? AND job_id=? AND date BETWEEN ? AND ?', [asg.user_id, asg.job_id, start_date, end_date]);
    const penaltyPerDay = salary * 0.10;
    const totalPenalty = penaltyPerDay * abs.length;
    const pay = Math.max(salary - totalPenalty, 0);
    // credit pay to user
    await run('INSERT INTO transactions (user_id, amount, category, reason, created_by, created_at) VALUES (?,?,?,?,?, datetime("now"))', [asg.user_id, pay, 'payroll', `Payroll ${job.name}`, req.session.user.id]);
    await run('UPDATE accounts SET balance = balance + ? WHERE user_id=?', [pay, asg.user_id]);
    // pay replacements
    for (const a of abs) {
      if (a.replacement_user_id) {
        await run('INSERT INTO transactions (user_id, amount, category, reason, created_by, created_at) VALUES (?,?,?,?,?, datetime("now"))', [a.replacement_user_id, penaltyPerDay, 'payroll', `Replacement for ${job.name} (${a.date})`, req.session.user.id]);
        await run('UPDATE accounts SET balance = balance + ? WHERE user_id=?', [penaltyPerDay, a.replacement_user_id]);
      }
    }
    summary.push({ user_id: asg.user_id, job: job.name, pay, absences: abs.length, penalties: totalPenalty });
  }
  res.json({ message: 'Payroll complete', summary });
});

// Admin: reset school year (zero balances, delete transactions, assignments, absences), archive optional
app.post('/api/admin/reset-school-year', requireRole(ROLES.TEACHER), async (req,res)=>{
  const year = new Date().getFullYear();
  // Archive not implemented to CSV in this simple version; just wipe
  await run('DELETE FROM transactions');
  await run('DELETE FROM job_assignments');
  await run('DELETE FROM absences');
  await run('UPDATE accounts SET balance = 0');
  await run('INSERT INTO admin_events(event_type, info, created_at, created_by) VALUES(?,?, datetime("now"), ?)', ['reset_school_year', `Reset ${year}`, req.session.user.id]);
  res.json({ message: 'School year reset complete' });
});

// Start server
app.listen(PORT, ()=>{
  console.log(`ClassBank running on http://localhost:${PORT}`);
});
