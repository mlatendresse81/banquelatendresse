async function me(){ const r = await fetch('/api/me'); if(!r.ok) { location.href = '/'; return; } return r.json(); }
function $(q){ return document.querySelector(q); }
function h(tag, attrs={}, ...children){ const el = document.createElement(tag); for(const [k,v] of Object.entries(attrs)){ if(k==='class') el.className=v; else if(k==='html') el.innerHTML=v; else el.setAttribute(k,v);} for(const c of children){ if(typeof c==='string') el.appendChild(document.createTextNode(c)); else if(c) el.appendChild(c);} return el; }

const SECTIONS = [
  { id:'view-account', label:'My Account', roles:['student','banker','teacher'] },
  { id:'rewards', label:'Rewards', roles:['banker','teacher'] },
  { id:'deductions', label:'Deductions', roles:['banker','teacher'] },
  { id:'bravo', label:'Bravo!', roles:['banker','teacher'] },
  { id:'selfeval', label:'Self Evals.', roles:['banker','teacher'] },
  { id:'jobs', label:'Jobs & Salaries', roles:['banker','teacher'] },
  { id:'store', label:'Store', roles:['banker','teacher'] },
  { id:'admin', label:'Admin', roles:['teacher'] }
];

let CURRENT_USER = null;
let STUDENTS = [];
let JOBS = [];

async function init(){
  const m = await me();
  CURRENT_USER = m.user;
  $('#userInfo').innerText = `${CURRENT_USER.name} (${CURRENT_USER.role})`;

  // Build nav
  const nav = document.getElementById('nav');
  SECTIONS.filter(s => s.roles.includes(CURRENT_USER.role)).forEach(s => {
    const a = h('a', { href:'#', 'data-id': s.id }, s.label);
    a.addEventListener('click', (e)=>{ e.preventDefault(); showSection(s.id); document.querySelectorAll('nav a').forEach(x=>x.classList.remove('active')); a.classList.add('active'); });
    nav.appendChild(a);
  });
  // Default section
  showSection('view-account');
  nav.querySelector('a').classList.add('active');

  if (CURRENT_USER.role !== 'student') {
    await loadStudents();
    await loadJobs();
  } else {
    renderViewAccount(CURRENT_USER.id);
  }
}

async function loadStudents(){
  const r = await fetch('/api/students');
  STUDENTS = await r.json();
  renderViewAccount(STUDENTS[0]?.id || CURRENT_USER.id);
}
async function loadJobs(){
  const r = await fetch('/api/jobs'); JOBS = await r.json();
}

function studentSelect(id){
  const sel = h('select', { id });
  (CURRENT_USER.role==='student' ? [{id: CURRENT_USER.id, name: CURRENT_USER.name}] : STUDENTS).forEach(s=> sel.appendChild(h('option', { value: s.id }, s.name)));
  return sel;
}

function showSection(id){
  document.querySelectorAll('.panel').forEach(p=>p.classList.add('hidden'));
  const panel = document.getElementById(id);
  panel.classList.remove('hidden');
  if (id==='view-account') buildViewAccount(panel);
  if (id==='rewards') buildRewards(panel);
  if (id==='deductions') buildDeductions(panel);
  if (id==='bravo') buildBravo(panel);
  if (id==='selfeval') buildSelfEval(panel);
  if (id==='jobs') buildJobs(panel);
  if (id==='store') buildStore(panel);
  if (id==='admin') buildAdmin(panel);
}

function buildViewAccount(panel){
  panel.innerHTML = '';
  panel.appendChild(h('h2',{},'View Accounts'));
  const row = h('div', { class:'flex' }, h('label',{},'Student:'), studentSelect('va_sel'), h('button', { class:'btn primary' }, 'View'));
  panel.appendChild(row);
  const info = h('div',{ id:'va_info', class:'card', style:'margin-top:12px;' }, '');
  panel.appendChild(info);
  row.querySelector('button').addEventListener('click', ()=>{
    const sid = document.getElementById('va_sel').value; renderViewAccount(sid);
  });
}

async function renderViewAccount(student_id){
  const info = $('#va_info'); if (!info) return;
  const r1 = await fetch(`/api/students/${student_id}`); const student = await r1.json();
  const r2 = await fetch(`/api/transactions?student_id=${student_id}`); const txs = await r2.json();
  info.innerHTML = '';
  info.appendChild(h('div', { class:'flex' }, h('div', { class:'badge' }, student.name), h('div', { class:'tag' }, `Balance: $${student.balance.toFixed(2)}`)));
  const table = h('table', { class:'table', style:'margin-top:10px;' });
  table.appendChild(h('tr',{}, h('th',{},'Date'), h('th',{},'Type'), h('th',{},'Reason'), h('th',{},'Amount')));
  txs.forEach(t=>{
    const amt = (t.amount>=0?'+':'') + '$' + t.amount.toFixed(2);
    table.appendChild(h('tr',{}, h('td',{}, new Date(t.created_at).toLocaleString()), h('td',{}, t.category), h('td',{}, t.reason||''), h('td',{}, amt)));
  });
  info.appendChild(table);
  // Teacher can override transactions; Teacher/Banker can change passwords
  if (CURRENT_USER.role !== 'student') {
    // Add Change Password button
    const pwBtn = h('button', { class:'btn' }, 'Change Password');
    pwBtn.addEventListener('click', async ()=>{
      const newpw = prompt('Enter new password for ' + student.name);
      if (!newpw) return;
      const r = await fetch(`/api/users/${student.id}/password`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ new_password: newpw })});
      const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
      alert('Password updated.');
    });
    info.appendChild(h('div', { class:'flex' }, pwBtn));

    if (CURRENT_USER.role === 'teacher') {
      // Add override buttons for each transaction row
      const rows = table.querySelectorAll('tr');
      rows.forEach((tr, idx)=>{
        if (idx===0) { tr.appendChild(h('th',{},'Admin')); return; }
        const td = h('td',{});
        const btn = h('button', { class:'btn warn' }, 'Override');
        btn.addEventListener('click', async ()=>{
          const t = txs[idx-1];
          const amt = prompt('New amount for this transaction (current '+t.amount+')');
          if (amt===null) return;
          const note = prompt('Reason for override (note)') || '';
          const r = await fetch(`/api/transactions/${t.id}/override`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ new_amount: parseFloat(amt), note })});
          const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
          alert('Transaction overridden. New balance: $'+d.balance.toFixed(2));
          renderViewAccount(student_id);
        });
        td.appendChild(btn); tr.appendChild(td);
      });
    }
  }

}

function buildRewards(panel){
  panel.innerHTML = '<h2>Rewards</h2>';
  const sel = studentSelect('rw_sel');
  const buttons = [
    ['French', 15], ['Focused', 10], ['Helping', 5], ['Kindness', 5], ['Challenge', 30]
  ];
  const grid = h('div', { class:'grid' });
  buttons.forEach(([name, amt])=>{
    const card = h('div', { class:'card' }, h('div', { class:'flex' }, h('div', { class:'badge' }, name), h('div', { class:'tag' }, `$${amt}`)), h('button', { class:'btn primary' }, `Add ${name}`));
    card.querySelector('button').addEventListener('click', ()=> addTransaction(sel.value, amt, 'reward', name));
    grid.appendChild(card);
  });
  panel.appendChild(h('div', { class:'flex' }, h('label',{},'Student:'), sel));
  panel.appendChild(grid);
}

function buildDeductions(panel){
  panel.innerHTML = '<h2>Deductions</h2>';
  const sel = studentSelect('dd_sel');
  const items = [
    ['Additional pass', -20], ['English', -25], ['Unfocused', -15], ['Distracting', -15], ['Disrespectful', -10], ['Parking ticket', -10]
  ];
  const grid = h('div', { class:'grid' });
  items.forEach(([name, amt])=>{
    const card = h('div', { class:'card' }, h('div', { class:'flex' }, h('div', { class:'badge' }, name), h('div', { class:'tag' }, `$${amt}`)), h('button', { class:'btn warn' }, `Deduct ${name}`));
    card.querySelector('button').addEventListener('click', ()=> addTransaction(sel.value, amt, 'deduction', name));
    grid.appendChild(card);
  });
  const misc = h('div', { class:'card' }, h('h3',{},'Misc.'), h('input',{ type:'number', id:'misc_amt', placeholder:'Custom amount (use negative for deduction)'}), h('input',{ id:'misc_reason', placeholder:'Reason'}), h('button', { class:'btn warn' }, 'Apply'));
  misc.querySelector('button').addEventListener('click', ()=>{
    const a = parseFloat(document.getElementById('misc_amt').value||'0'); const r = document.getElementById('misc_reason').value || 'Misc.';
    if (!a) return alert('Enter an amount');
    addTransaction(sel.value, a, a>=0?'reward':'deduction', r);
  });
  panel.appendChild(h('div', { class:'flex' }, h('label',{},'Student:'), sel));
  panel.appendChild(grid);
  panel.appendChild(misc);
}

function buildBravo(panel){
  panel.innerHTML = '<h2>Bravo!</h2>';
  const sel = studentSelect('br_sel');
  const qty = h('input', { id:'br_qty', type:'number', min:'1', value:'1' });
  const btn = h('button', { class:'btn primary' }, 'Add Bravo');
  btn.addEventListener('click', ()=>{
    const q = parseInt(qty.value||'0'); if (!q || q<1) return alert('Enter a quantity');
    addTransaction(sel.value, 5*q, 'bravo', `Bravo x${q}`);
  });
  panel.appendChild(h('div', { class:'flex' }, h('label',{},'Student:'), sel, h('label',{},'Quantity:'), qty, btn));
}

function buildSelfEval(panel){
  panel.innerHTML = '<h2>Self Evals.</h2>';
  const sel = studentSelect('se_sel');
  const levels = [ ['Level 1', 10], ['Level 2', 20], ['Level 3', 30], ['Level 4', 40], ['No eval', 0] ];
  const grid = h('div', { class:'grid' });
  levels.forEach(([name, amt])=>{
    const card = h('div', { class:'card' }, h('div', { class:'flex' }, h('div', { class:'badge' }, name), h('div', { class:'tag' }, `$${amt}`)), h('button', { class:'btn primary' }, `Apply ${name}`));
    card.querySelector('button').addEventListener('click', ()=> addTransaction(sel.value, amt, 'self_eval', name));
    grid.appendChild(card);
  });
  panel.appendChild(h('div', { class:'flex' }, h('label',{},'Student:'), sel));
  panel.appendChild(grid);
}

function buildJobs(panel){
  panel.innerHTML = '<h2>Jobs & Salaries</h2>';
  const sel = studentSelect('j_sel');
  // Assign job
  const jobSel = h('select', { id:'job_sel' });
  JOBS.forEach(j=> jobSel.appendChild(h('option',{ value:j.id }, `${j.name} ($${j.salary})`)));
  const start = h('input', { type:'date', id:'job_start' });
  const end = h('input', { type:'date', id:'job_end' });
  const assignBtn = h('button', { class:'btn primary' }, 'Assign Job');
  assignBtn.addEventListener('click', async ()=>{
    const body = { user_id: sel.value, job_id: jobSel.value, start_date: start.value, end_date: end.value||null };
    const r = await fetch('/api/jobs/assign', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const d = await r.json();
    if (!r.ok) return alert(d.error||'Error');
    alert('Assigned');
  });

  const absUser = studentSelect('abs_user');
  const absJob = h('select', { id:'abs_job' }); JOBS.forEach(j=> absJob.appendChild(h('option',{ value:j.id }, j.name)));
  const absDate = h('input', { type:'date', id:'abs_date' });
  const absRepl = studentSelect('abs_repl');
  const absBtn = h('button', { class:'btn warn' }, 'Log Absence');
  absBtn.addEventListener('click', async ()=>{
    const body = { user_id: absUser.value, job_id: absJob.value, date: absDate.value, replacement_user_id: absRepl.value || null };
    const r = await fetch('/api/jobs/absence', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
    alert('Absence logged');
  });

  const prStart = h('input', { type:'date', id:'pr_start' });
  const prEnd = h('input', { type:'date', id:'pr_end' });
  const prBtn = h('button', { class:'btn primary' }, 'Run Payroll');
  const prOut = h('div', { class:'card' });
  prBtn.addEventListener('click', async ()=>{
    const body = { start_date: prStart.value, end_date: prEnd.value };
    const r = await fetch('/api/payroll/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
    prOut.innerHTML = '<strong>Payroll Summary</strong><br>' + d.summary.map(s=> `${s.user_id} – ${s.job}: $${s.pay} (${s.absences} absence(s))`).join('<br>');
  });

  panel.appendChild(h('div', { class:'card' }, h('h3',{}, 'Assign Job'), h('div', { class:'flex' }, h('label',{},'Student:'), sel, h('label',{},'Job:'), jobSel, h('label',{},'Start:'), start, h('label',{},'End:'), end, assignBtn)));
  panel.appendChild(h('div', { class:'card' }, h('h3',{}, 'Log Absence & Replacement'), h('div', { class:'flex' }, h('label',{},'Student:'), absUser, h('label',{},'Job:'), absJob, h('label',{},'Date:'), absDate, h('label',{},'Replacement:'), absRepl, absBtn)));
  panel.appendChild(h('div', { class:'card' }, h('h3',{}, 'Run Payroll (bi-weekly)'), h('div', { class:'flex' }, h('label',{},'Start:'), prStart, h('label',{},'End:'), prEnd, prBtn), prOut));
}

function buildStore(panel){
  panel.innerHTML = '<h2>Store</h2>';
  const sel = studentSelect('st_sel');
  const items = [ ['Stickers', 25], ['Candy', 40], ['Toys/Supplies', 50], ['Privileges', 100], ['Special Privileges', 200], ['Elite Privileges', 300] ];
  const grid = h('div', { class:'grid' });
  items.forEach(([name, price])=>{
    const card = h('div', { class:'card' }, h('div', { class:'flex' }, h('div', { class:'badge' }, name), h('div', { class:'tag' }, `$${price}`)), h('button', { class:'btn primary' }, 'Buy')));
    card.querySelector('button').addEventListener('click', async ()=>{
      const r = await fetch('/api/store/purchase', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: sel.value, item_name: name, price })});
      const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
      alert(`${name} purchased. New balance: $${d.balance.toFixed(2)}`);
    });
    grid.appendChild(card);
  });
  panel.appendChild(h('div', { class:'flex' }, h('label',{},'Student:'), sel));
  panel.appendChild(grid);
}

function buildAdmin(panel){
  panel.innerHTML = '<h2>Admin</h2>';
  // Custom reward/deduction
  const sel = studentSelect('ad_sel');
  const amt = h('input', { type:'number', id:'ad_amt', placeholder:'Amount (use negative for deduction)' });
  const reason = h('input', { id:'ad_reason', placeholder:'Reason' });
  const apply = h('button', { class:'btn primary' }, 'Apply');
  apply.addEventListener('click', ()=>{
    const a = parseFloat(amt.value||'0'); if (!a) return alert('Enter amount');
    addTransaction(sel.value, a, a>=0?'reward':'deduction', reason.value||'Admin adjustment');
  });

  const addName = h('input', { id:'st_name', placeholder:'Student name' });
  const addUser = h('input', { id:'st_username', placeholder:'Username (unique)' });
  const addClass = h('select', { id:'st_class' });
  addClass.appendChild(h('option',{ value:1 }, 'Matin'));
  addClass.appendChild(h('option',{ value:2 }, 'Midi'));
  const addBtn = h('button', { class:'btn primary' }, 'Add student');
  addBtn.addEventListener('click', async()=>{
    const body = { name: addName.value, username: addUser.value, class_id: parseInt(addClass.value), role: 'student' };
    const r = await fetch('/api/students', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
    alert('Student added. Default password: Welcome123');
    await loadStudents();
  });

  const rmSel = studentSelect('rm_sel');
  const rmBtn = h('button', { class:'btn danger' }, 'Remove student');
  rmBtn.addEventListener('click', async()=>{
    if (!confirm('Remove selected student?')) return;
    const r = await fetch(`/api/students/${rmSel.value}`, { method:'DELETE' });
    const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
    alert('Removed'); await loadStudents();
  });

  const resetBtn = h('button', { class:'btn danger' }, 'Reset school year');
  resetBtn.addEventListener('click', async()=>{
    if (!confirm('This will clear all balances and transactions. Continue?')) return;
    const r = await fetch('/api/admin/reset-school-year', { method:'POST' });
    const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
    alert('School year reset complete');
  });

  const pwListBtn = h('button', { class:'btn' }, 'View password reset requests');
  const pwList = h('div', { class:'card' });
  pwListBtn.addEventListener('click', async()=>{
    const r = await fetch('/api/admin/password-resets');
    const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
    pwList.innerHTML = '<strong>Open requests</strong><br>' + d.map(x=> `${x.name} (${x.username}) – ${x.created_at} – <button data-id="${x.id}" data-user="${x.username}">Set new password</button>`).join('<br>');
    pwList.querySelectorAll('button').forEach(b=> b.addEventListener('click', async()=>{
      const newpw = prompt('Enter new password for ' + b.dataset.user);
      if (!newpw) return;
      // Need user_id; fetch by username quick hack
      const u = STUDENTS.find(s=> s && s.id && s.name && (s.name.toLowerCase()+'.matin'===b.dataset.user || s.name.toLowerCase()+'.midi'===b.dataset.user));
      // Instead call backend with user_id via additional fetch? For demo, ask teacher to change from View Accounts section.
      alert('Use the "Change Password" in View Accounts for now.');
    }));
  });

  panel.appendChild(h('div', { class:'card' }, h('h3',{},'Custom reward/deduction'), h('div',{ class:'flex' }, h('label',{},'Student:'), sel, h('label',{},'Amount:'), amt, h('label',{},'Reason:'), reason, apply)));
  panel.appendChild(h('div', { class:'card' }, h('h3',{},'Add/Remove students'), h('div',{ class:'flex' }, addName, addUser, addClass, addBtn), h('div',{ class:'flex' }, rmSel, rmBtn)));
  panel.appendChild(h('div', { class:'card' }, h('h3',{},'School year'), resetBtn));
  panel.appendChild(h('div', { class:'card' }, h('h3',{},'Password resets'), pwListBtn, pwList));
}

async function addTransaction(user_id, amount, category, reason){
  const r = await fetch('/api/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id, amount, category, reason })});
  const d = await r.json(); if (!r.ok) return alert(d.error||'Error');
  alert(`${category} saved. New balance: $${d.balance.toFixed(2)}`);
}

init();
