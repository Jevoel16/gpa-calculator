// Copies saved terms from an old mysqldump of gpa_records into an account in the database configured in .env.
// Usage: npm run db:import -- <gpa_records.sql> --from-user <old user id> --to-email <email> [--dry-run]
// The target account must already exist (sign in to the app with it once). Safe to run more than once.
const fs = require('fs');
const pool = require('../db/db');
const { sanitizeCourses, computeGpa } = require('../routes/gpa').helpers;

function parseArgs(argv) {
  const args = { file: null, fromUser: null, toEmail: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--from-user') args.fromUser = Number(argv[++i]);
    else if (arg === '--to-email') args.toEmail = String(argv[++i] || '').trim().toLowerCase();
    else if (arg === '--dry-run') args.dryRun = true;
    else if (!args.file) args.file = arg;
  }
  return args;
}

// Reads the tuples of every `INSERT INTO <table> VALUES (...),(...);` statement as arrays of JS values
function parseInsertRows(sql, table) {
  const rows = [];
  const marker = `INSERT INTO \`${table}\` VALUES `;
  let pos = sql.indexOf(marker);

  while (pos !== -1) {
    let i = pos + marker.length;
    let row = null;
    let value = '';
    let quoted = false;

    const pushValue = () => {
      if (quoted) row.push(value);
      else if (value.trim().toUpperCase() === 'NULL') row.push(null);
      else row.push(Number(value.trim()));
      value = '';
      quoted = false;
    };

    for (; i < sql.length; i++) {
      const ch = sql[i];
      if (row === null) {
        if (ch === '(') row = [];
        else if (ch === ';') break;
        continue;
      }
      if (ch === "'") {
        // Quoted string with MySQL backslash escapes
        quoted = true;
        for (i++; i < sql.length && sql[i] !== "'"; i++) {
          if (sql[i] === '\\') {
            const next = sql[++i];
            value += { n: '\n', r: '\r', t: '\t', '0': '\0', Z: '\x1a' }[next] ?? next;
          } else {
            value += sql[i];
          }
        }
      } else if (ch === ',') {
        pushValue();
      } else if (ch === ')') {
        pushValue();
        rows.push(row);
        row = null;
      } else {
        value += ch;
      }
    }
    pos = sql.indexOf(marker, i);
  }
  return rows;
}

async function main() {
  const { file, fromUser, toEmail, dryRun } = parseArgs(process.argv.slice(2));
  if (!file || !Number.isSafeInteger(fromUser) || !toEmail) {
    throw new Error('Usage: npm run db:import -- <gpa_records.sql> --from-user <id> --to-email <email> [--dry-run]');
  }

  // Columns as dumped: id, user_id, term_name, courses_json, gpa, created_at
  const terms = parseInsertRows(fs.readFileSync(file, 'utf8'), 'gpa_records')
    .filter(r => r[1] === fromUser)
    .map(([oldId, , termName, coursesJson, oldGpa, createdAt]) => ({ oldId, termName, coursesJson, oldGpa, createdAt }));
  if (!terms.length) throw new Error(`No terms for user ${fromUser} in ${file}`);

  // mysqldump writes timestamps in UTC, so this connection reads and writes them in UTC too
  const conn = await pool.getConnection();
  try {
    await conn.query("SET time_zone = '+00:00'");
    await importTerms(conn, terms, toEmail, dryRun);
  } finally {
    conn.release();
  }
}

async function importTerms(conn, terms, toEmail, dryRun) {
  const [users] = await conn.query('SELECT id FROM users WHERE email = ?', [toEmail]);
  if (!users.length) throw new Error(`No account for ${toEmail}. Sign in to the app once with that account first.`);
  const userId = users[0].id;

  let inserted = 0;
  let skipped = 0;
  for (const term of terms) {
    let courses = null;
    try { courses = sanitizeCourses(JSON.parse(term.coursesJson)); } catch {}
    if (!courses) {
      console.log(`SKIP  #${term.oldId} "${term.termName}" has invalid courses`);
      skipped++;
      continue;
    }
    const gpa = computeGpa(courses);

    const [existing] = await conn.query(
      'SELECT id FROM gpa_records WHERE user_id = ? AND term_name = ? AND created_at = ?',
      [userId, term.termName, term.createdAt]
    );
    if (existing.length) {
      console.log(`SKIP  "${term.termName}" is already imported`);
      skipped++;
      continue;
    }

    if (!dryRun) {
      await conn.query(
        'INSERT INTO gpa_records (user_id, term_name, courses_json, gpa, created_at) VALUES (?, ?, ?, ?, ?)',
        [userId, term.termName, JSON.stringify(courses), gpa, term.createdAt]
      );
    }
    console.log(`${dryRun ? 'WOULD' : 'ADD  '} "${term.termName}" (${courses.length} courses, GPA ${gpa.toFixed(5)}, was ${term.oldGpa})`);
    inserted++;
  }

  console.log(`${dryRun ? 'Dry run: ' : ''}${inserted} term(s) ${dryRun ? 'to import' : 'imported'} into ${toEmail}, ${skipped} skipped.`);
}

main()
  .catch(err => {
    console.error('Import failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
