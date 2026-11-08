// Failed-attempt counter in MySQL (shared by all instances), with an in-memory fallback
const crypto = require('crypto');
const pool = require('../db/db');

const memory = new Map();
let tableReady = null;

// Created on first use so existing deployments get the table without a manual migration
function ensureTable() {
  tableReady = tableReady || pool.query(
    `CREATE TABLE IF NOT EXISTS auth_attempts (
       attempt_key CHAR(64) NOT NULL PRIMARY KEY,
       count INT UNSIGNED NOT NULL,
       reset_at BIGINT UNSIGNED NOT NULL
     ) ENGINE=InnoDB`
  ).catch(err => { tableReady = null; throw err; });
  return tableReady;
}

// Keys can contain usernames and IPs, so only a hash is stored
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function memoryCount(key, now) {
  const entry = memory.get(key);
  if (!entry || entry.resetAt < now) return 0;
  return entry.count;
}

function memoryRecord(key, now, windowMs) {
  if (memory.size > 10000) {
    for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
  }
  const entry = memory.get(key);
  if (entry && entry.resetAt >= now) entry.count++;
  else memory.set(key, { count: 1, resetAt: now + windowMs });
}

async function getCount(key) {
  const now = Date.now();
  const id = hashKey(key);
  try {
    await ensureTable();
    const [rows] = await pool.query('SELECT count, reset_at FROM auth_attempts WHERE attempt_key = ?', [id]);
    if (!rows.length || Number(rows[0].reset_at) < now) return 0;
    return Number(rows[0].count);
  } catch (err) {
    console.error('rate-limit: database unavailable, using memory', err.code || err.message);
    return memoryCount(id, now);
  }
}

async function recordFailure(key, windowMs) {
  const now = Date.now();
  const id = hashKey(key);
  try {
    await ensureTable();
    // One atomic statement so concurrent failures on different instances are all counted
    await pool.query(
      `INSERT INTO auth_attempts (attempt_key, count, reset_at) VALUES (?, 1, ?)
       ON DUPLICATE KEY UPDATE
         count = IF(reset_at < ?, 1, count + 1),
         reset_at = IF(reset_at < ?, VALUES(reset_at), reset_at)`,
      [id, now + windowMs, now, now]
    );
    // Occasional cleanup keeps the table small without a scheduled job
    if (Math.random() < 0.02) await pool.query('DELETE FROM auth_attempts WHERE reset_at < ?', [now]);
  } catch (err) {
    console.error('rate-limit: database unavailable, using memory', err.code || err.message);
    memoryRecord(id, now, windowMs);
  }
}

async function clear(key) {
  const id = hashKey(key);
  memory.delete(id);
  try {
    await ensureTable();
    await pool.query('DELETE FROM auth_attempts WHERE attempt_key = ?', [id]);
  } catch (err) {
    console.error('rate-limit: could not clear attempts', err.code || err.message);
  }
}

module.exports = { getCount, recordFailure, clear };
