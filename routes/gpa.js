const express = require('express');
const pool = require('../db/db');
const requireAuth = require('../middleware/auth');
const scales = require('../public/grading-scales');
const { resolveScale, scaleForRequest } = require('../lib/scales');

const router = express.Router();

const MAX_NAME_LENGTH = 100; // matches the VARCHAR(100) name columns
const MAX_CODE_LENGTH = 20;
const MAX_COURSES = 100;
const MAX_UNITS = 30;

function isValidName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_NAME_LENGTH;
}

// Returns a clean copy of the courses, or null when any course is malformed
function sanitizeCourses(courses, scale = defaultScale()) {
  if (!Array.isArray(courses) || courses.length === 0 || courses.length > MAX_COURSES) return null;
  const clean = [];
  for (const c of courses) {
    if (!c || typeof c !== 'object' || !isValidName(c.name)) return null;
    const units = Number(c.units ?? c.credits);
    if (!Number.isFinite(units) || units <= 0 || units > MAX_UNITS) return null;
    const grade = scales.normalizeGrade(scale, c.grade);
    if (!grade) return null;
    // Course code is optional (e.g. "CCC100" from a MyIIT paste); stored only when given
    const code = c.code == null ? '' : c.code;
    if (typeof code !== 'string' || code.trim().length > MAX_CODE_LENGTH) return null;
    const course = { name: c.name.trim(), units, grade };
    if (code.trim()) course.code = code.trim();
    clean.push(course);
  }
  return clean;
}

// Helpers and the import script fall back to the app default; routes always pass the term's own scale
const defaultScale = () => scales.getScale(scales.DEFAULT_SCALE_ID);
const sumCourses = (courses, scale = defaultScale()) => scales.sumCourses(courses, scale);
const computeGpa = (courses, scale = defaultScale()) => scales.computeGpa(courses, scale);

function parseCourses(value) {
  try {
    const courses = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(courses) ? courses : [];
  } catch {
    return [];
  }
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Thrown for requests that can't be computed; routes turn it into a 400
class CumulativeError extends Error {}

// Combines the user's chosen terms with extra subjects; both GPA endpoints share this so a saved CGPA is always recomputed on the server.
// All terms must share one grading system: there is no official conversion between schools' scales.
async function computeCumulative(userId, requestedScaleId, termIds, additionalSubjects) {
  const ids = Array.isArray(termIds) ? [...new Set(termIds.map(parseId).filter(Boolean))].slice(0, 200) : [];

  let rows = [];
  if (ids.length) {
    [rows] = await pool.query(
      `SELECT id, term_name AS termName, courses_json AS coursesJson, gpa, scale_id AS scaleId
       FROM gpa_records
       WHERE user_id = ? AND id IN (?)
       ORDER BY created_at DESC`,
      [userId, ids]
    );
  }

  // Older clients send no scale; the terms' own scale (or the user's default) is used then
  const termScaleIds = [...new Set(rows.map(r => r.scaleId))];
  let scale;
  if (requestedScaleId != null && requestedScaleId !== '') {
    scale = await resolveScale(userId, requestedScaleId);
    if (!scale) throw new CumulativeError('Unknown grading system');
  } else {
    scale = termScaleIds.length === 1
      ? await resolveScale(userId, termScaleIds[0])
      : await scaleForRequest(userId, null);
  }
  if (!scale || termScaleIds.some(id => id !== scale.id)) {
    throw new CumulativeError('Selected terms use different grading systems. Pick terms from one grading system.');
  }

  const extras = Array.isArray(additionalSubjects) ? (sanitizeCourses(additionalSubjects, scale) || []) : [];

  let totalGradePoints = 0;
  let gpaUnits = 0;
  let totalUnits = 0; // includes Passed units, which are credited but not in the GPA
  const termsData = [];

  for (const row of rows) {
    const courses = parseCourses(row.coursesJson);
    const sum = sumCourses(courses, scale);
    totalGradePoints += sum.gradePointsTotal;
    gpaUnits += sum.units;
    totalUnits += sum.creditedUnits;
    termsData.push({ id: row.id, termName: row.termName, gpa: Number(row.gpa), courseCount: courses.length });
  }

  const extraSum = sumCourses(extras, scale);
  totalGradePoints += extraSum.gradePointsTotal;
  gpaUnits += extraSum.units;
  totalUnits += extraSum.creditedUnits;

  return {
    scaleId: scale.id,
    cumulativeGpa: gpaUnits > 0 ? Number((totalGradePoints / gpaUnits).toFixed(5)) : 0,
    totalUnits,
    gpaUnits,
    totalGradePoints: Number(totalGradePoints.toFixed(2)),
    termsIncluded: termsData,
    termCount: termsData.length,
    additionalSubjectsIncluded: extras
  };
}

// Save a new term with courses
router.post('/save', requireAuth, async (req, res) => {
  try {
    const { termName } = req.body;
    if (!isValidName(termName)) {
      return res.status(400).json({ error: `Term name is required (max ${MAX_NAME_LENGTH} characters)` });
    }
    const scale = await scaleForRequest(req.session.userId, req.body.scaleId);
    if (!scale) return res.status(400).json({ error: 'Unknown grading system' });
    const courses = sanitizeCourses(req.body.courses, scale);
    if (!courses) {
      return res.status(400).json({ error: `Each course needs a name, valid units and a grade on the ${scale.name} scale` });
    }

    const gpa = computeGpa(courses, scale);
    const [result] = await pool.query(
      'INSERT INTO gpa_records (user_id, term_name, courses_json, gpa, scale_id) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, termName.trim(), JSON.stringify(courses), gpa, scale.id]
    );

    res.status(201).json({
      id: result.insertId,
      termName: termName.trim(),
      scaleId: scale.id,
      gpa,
      courses,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save term' });
  }
});

// Get all terms for a user
router.get('/history', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, term_name AS termName, courses_json AS coursesJson, gpa, scale_id AS scaleId, created_at AS createdAt FROM gpa_records WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );

    res.json(rows.map(r => ({
      id: r.id,
      termName: r.termName,
      scaleId: r.scaleId,
      gpa: Number(r.gpa),
      courses: parseCourses(r.coursesJson),
      createdAt: r.createdAt
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

// Calculate cumulative GPA from selected terms and additional subjects
router.post('/calculate-cumulative', requireAuth, async (req, res) => {
  try {
    const result = await computeCumulative(req.session.userId, req.body.scaleId, req.body.termIds, req.body.additionalSubjects);
    if (!result.termCount && !result.additionalSubjectsIncluded.length) {
      return res.status(400).json({ error: 'Select at least one term or add additional subjects' });
    }
    res.json(result);
  } catch (err) {
    if (err instanceof CumulativeError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate cumulative GPA' });
  }
});

// List saved cumulative GPA records
router.get('/cgpa', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, record_name AS recordName, cgpa_data AS cgpaData, cgpa, scale_id AS scaleId, created_at AS createdAt FROM cgpa_records WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );
    res.json(rows.map(r => {
      let data = {};
      try { data = typeof r.cgpaData === 'string' ? JSON.parse(r.cgpaData) : (r.cgpaData || {}); } catch {}
      return {
        id: r.id,
        recordName: r.recordName,
        scaleId: r.scaleId,
        cumulativeGpa: Number(r.cgpa),
        totalUnits: Number(data.totalUnits) || 0,
        termCount: Array.isArray(data.termsIncluded) ? data.termsIncluded.length : 0,
        subjectCount: Array.isArray(data.additionalSubjectsIncluded) ? data.additionalSubjectsIncluded.length : 0,
        createdAt: r.createdAt
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve CGPA records' });
  }
});

// Save a cumulative GPA record. The numbers are recomputed here rather than trusted from the client.
router.post('/save-cgpa', requireAuth, async (req, res) => {
  try {
    const { recordName } = req.body;
    if (!isValidName(recordName)) {
      return res.status(400).json({ error: `Record name is required (max ${MAX_NAME_LENGTH} characters)` });
    }

    // Older clients send the previous calculation's termsIncluded/additionalSubjectsIncluded instead of the inputs
    const termIds = req.body.termIds ?? (Array.isArray(req.body.termsIncluded) ? req.body.termsIncluded.map(t => t && t.id) : []);
    const subjects = req.body.additionalSubjects ?? req.body.additionalSubjectsIncluded ?? [];
    const result = await computeCumulative(req.session.userId, req.body.scaleId, termIds, subjects);

    if (result.cumulativeGpa <= 0) {
      return res.status(400).json({ error: 'Select at least one term or subject with a counted grade' });
    }

    const recordData = { recordName: recordName.trim(), ...result };
    const [insert] = await pool.query(
      'INSERT INTO cgpa_records (user_id, record_name, cgpa_data, cgpa, scale_id) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, recordName.trim(), JSON.stringify(recordData), result.cumulativeGpa, result.scaleId]
    );

    res.status(201).json({
      id: insert.insertId,
      recordName: recordName.trim(),
      scaleId: result.scaleId,
      cumulativeGpa: result.cumulativeGpa,
      totalUnits: result.totalUnits,
      totalGradePoints: result.totalGradePoints,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    if (err instanceof CumulativeError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to save CGPA record' });
  }
});

// Delete a CGPA record
router.delete('/cgpa/:id', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'CGPA record not found' });

    const [result] = await pool.query(
      'DELETE FROM cgpa_records WHERE id = ? AND user_id = ?',
      [id, req.session.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'CGPA record not found' });
    }

    res.json({ success: true, message: 'CGPA record deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete CGPA record' });
  }
});

// Update an existing term with courses
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Term not found' });

    const { termName } = req.body;
    if (!isValidName(termName)) {
      return res.status(400).json({ error: `Term name is required (max ${MAX_NAME_LENGTH} characters)` });
    }
    // Older clients send no scale; an edit then keeps the term's own scale rather than the user's default
    let scaleId = req.body.scaleId;
    if (scaleId == null || scaleId === '') {
      const [existing] = await pool.query('SELECT scale_id AS scaleId FROM gpa_records WHERE id = ? AND user_id = ?', [id, req.session.userId]);
      if (!existing.length) return res.status(404).json({ error: 'Term not found' });
      scaleId = existing[0].scaleId;
    }
    const scale = await resolveScale(req.session.userId, scaleId);
    if (!scale) return res.status(400).json({ error: 'Unknown grading system' });
    const courses = sanitizeCourses(req.body.courses, scale);
    if (!courses) {
      return res.status(400).json({ error: `Each course needs a name, valid units and a grade on the ${scale.name} scale` });
    }

    const gpa = computeGpa(courses, scale);
    const [result] = await pool.query(
      'UPDATE gpa_records SET term_name = ?, courses_json = ?, gpa = ?, scale_id = ? WHERE id = ? AND user_id = ?',
      [termName.trim(), JSON.stringify(courses), gpa, scale.id, id, req.session.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Term not found' });
    }

    res.json({
      id,
      termName: termName.trim(),
      scaleId: scale.id,
      gpa,
      courses,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update term' });
  }
});

// Delete a term
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Term not found' });

    const [result] = await pool.query(
      'DELETE FROM gpa_records WHERE id = ? AND user_id = ?',
      [id, req.session.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Term not found' });
    }

    res.json({ success: true, message: 'Term deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete term' });
  }
});

module.exports = router;
// Shared with scripts/import-terms.js so imported terms follow the same rules as saved ones
module.exports.helpers = { sanitizeCourses, computeGpa, sumCourses };
