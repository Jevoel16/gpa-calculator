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
  console.log('Database is ready.');
}

main()
  .catch(err => {
    console.error('Database setup failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
