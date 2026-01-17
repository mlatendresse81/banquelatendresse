
# Class Bank (Grade 5 – Matin & Midi)

A lightweight classroom economy website with roles for **Teacher (admin)**, **Student Bankers**, and **Students**.

## 🚀 Quick Start

1. **Install Node.js 18+**
2. In a terminal, run:
   ```bash
   cd classbank
   npm install
   npm run init-db
   npm start
   ```
3. Open http://localhost:3000 in a browser.

### Default Accounts
- **Teacher (Admin)**: username `MmeLatendresse` • password `ChangeMe123!`
- **Bankers – Matin**: `rowynn.matin`, `sophie.matin`, `carter.matin`, `parker.matin` • password `Banker123!`
- **Bankers – Midi**: `haja.midi`, `caeden.midi`, `naomi.midi`, `brycen.midi` • password `Banker123!`

> Change these passwords on first login (Admin → Change Password).

## ✨ Features
- Rewards, Deductions, Bravo!, Self Evals., Jobs & Salaries, Store, Admin
- Overdraft allowed **except** for Store purchases
- Jobs are reassigned bi-weekly (manual assign tool)
- Absences reduce salary by **10% per day**, paid to the replacement
- Full transaction history per student with audit trail
- "Forgot your password" opens a reset request for the teacher
- All other students can log in to **view-only** their balance & transactions

## 🗂 Data Model
- `users(id, name, username, role, class_id, password_hash)`
- `accounts(user_id, balance)`
- `transactions(id, user_id, amount, category, reason, created_by, created_at, overridden_by, overridden_at)`
- `classes(id, name)`
- `jobs(id, name, salary)`
- `job_assignments(id, user_id, job_id, start_date, end_date)`
- `absences(id, user_id, job_id, date, replacement_user_id)`

## 🛡 Roles
- **Teacher**: full access to both classes
- **Banker**: manage only their own class; can add students, record rewards/deductions, run payroll, log absences
- **Student**: view-only own account

## 🛍 Store Rules
Students cannot go into overdraft for Store items. The app blocks purchases when the balance is insufficient.

## 📅 Year-End Reset
Use Admin → *Reset school year* on **July 1**. This clears all transactions, assignments/absences, and sets all balances to $0.

## 🎨 Look & Feel
Simple, colourful, whimsical UI with big buttons and kid-friendly typography.

## 🔐 Notes
- Passwords are hashed with bcrypt.
- Sessions use server-side cookies. For classroom use only (no PII collected).

## 🧭 Tips
- Use Jobs & Salaries → *Run Payroll* for your bi-weekly periods.
- Use Admin → *Custom reward/deduction* for one-off corrections.

