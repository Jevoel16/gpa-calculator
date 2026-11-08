// Single place routes resolve scale ids, so user-defined scales can plug in later
const pool = require('../db/db');
const Scales = require('../public/grading-scales');

const MAX_SCALE_ID_LENGTH = 40; // matches the VARCHAR(40) scale columns

// Returns the scale for an id the user may use, or null. _userId is unused until custom scales exist.
async function resolveScale(_userId, id) {
  if (typeof id !== 'string' || !id || id.length > MAX_SCALE_ID_LENGTH) return null;
  return Scales.getScale(id);
}

async function getDefaultScaleId(userId) {
  const [rows] = await pool.query('SELECT default_scale AS defaultScale FROM users WHERE id = ?', [userId]);
  const id = rows.length ? rows[0].defaultScale : null;
  // A stored id that no longer resolves falls back to the app default rather than failing the request
  return Scales.getScale(id) ? id : Scales.DEFAULT_SCALE_ID;
}

// Picks the requested scale, or the user's default when none was sent. Returns null for an invalid request.
async function scaleForRequest(userId, requestedId) {
  if (requestedId == null || requestedId === '') {
    return Scales.getScale(await getDefaultScaleId(userId));
  }
  return resolveScale(userId, requestedId);
}

module.exports = { resolveScale, getDefaultScaleId, scaleForRequest, MAX_SCALE_ID_LENGTH };
