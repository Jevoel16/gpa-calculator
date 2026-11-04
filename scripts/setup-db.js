// Creates the tables in the database configured in .env (DATABASE_URL or DB_*). Safe to run more than once.
// Usage: npm run db:setup
const fs = require('fs');
const path = require('path');
const pool = require('../db/db');

// Table and column names below are constants from this file, never user input
async function columnInfo(table, column) {
  const [rows] = await pool.query(
    `SELECT NUMERIC_PRECISION AS numericPrecision, NUMERIC_SCALE AS numericScale
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0] || null;
}

async function ensureColumn(table, column, definition) {
  if (await columnInfo(table, column)) return;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`OK   ALTER TABLE ${table} ADD COLUMN ${column}`);
}

async function ensureDecimal(table, column, precision, scale) {
  const info = await columnInfo(table, column);
  if (!info || Number(info.numericPrecision) >= precision) return;
  await pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} DECIMAL(${precision},${scale}) NOT NULL`);
  console.log(`OK   ALTER TABLE ${table} MODIFY COLUMN ${column} DECIMAL(${precision},${scale})`);
}

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

  // The connection already points at the right database, so skip the local-only CREATE DATABASE / USE lines
  const statements = schema
    .split(';')
    .map(s => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(s => s && !/^(CREATE DATABASE|USE)\b/i.test(s));

  for (const sql of statements) {
    await pool.query(sql);
    console.log('OK  ', sql.split('\n')[0]);
  }

  // CREATE TABLE IF NOT EXISTS leaves older tables alone, so add columns introduced later
  // (column and unique index are added separately because TiDB can't do both in one ALTER)
  await ensureColumn('users', 'username', 'VARCHAR(30) NULL AFTER email');
  await ensureColumn('users', 'default_scale', "VARCHAR(40) NOT NULL DEFAULT 'msu-iit' AFTER password_hash");
  await ensureColumn('gpa_records', 'scale_id', "VARCHAR(40) NOT NULL DEFAULT 'msu-iit' AFTER gpa");
  await ensureColumn('cgpa_records', 'scale_id', "VARCHAR(40) NOT NULL DEFAULT 'msu-iit' AFTER cgpa");
  // Percentage scales need GPAs up to 100.00000, which DECIMAL(6,5) can't hold
  await ensureDecimal('gpa_records', 'gpa', 8, 5);
  await ensureDecimal('cgpa_records', 'cgpa', 8, 5);

  const [indexes] = await pool.query(
    "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username' AND NON_UNIQUE = 0"
  );
  if (!indexes.length) {
    await pool.query('ALTER TABLE users ADD UNIQUE INDEX username (username)');
    console.log('OK   ALTER TABLE users ADD UNIQUE INDEX username');
  }
  console.log('Database is ready.');
}

main()
  .catch(err => {
    console.error('Database setup failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
