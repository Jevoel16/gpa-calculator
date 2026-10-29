// Creates the tables in the database configured in .env (DATABASE_URL or DB_*). Safe to run more than once.
// Usage: npm run db:setup
const fs = require('fs');
const path = require('path');
const pool = require('../db/db');

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
  const [cols] = await pool.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'"
  );
  if (!cols.length) {
    await pool.query('ALTER TABLE users ADD COLUMN username VARCHAR(30) NULL AFTER email');
    console.log('OK   ALTER TABLE users ADD COLUMN username');
  }
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
