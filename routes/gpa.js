const express = require('express');
const pool = require('../db/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const gradePoints = {
  '1': 1.0, '1.00': 1.0, '1.25': 1.25, '1.50': 1.5, '1.75': 1.75,
  '2': 2.0, '2.00': 2.0, '2.25': 2.25, '2.50': 2.5, '2.75': 2.75,
  '3': 3.0, '3.00': 3.0,
  '5': 5.0, '5.00': 5.0,
  'INC': null, 'DROP': null
};

const MAX_NAME_LENGTH = 100; // matches the VARCHAR(100) name columns
const MAX_COURSES = 100;
const MAX_UNITS = 30;

function isValidName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_NAME_LENGTH;
}

function gradeKey(grade) {
  return String(grade ?? '').trim().toUpperCase();
}

// Returns a clean copy of the courses, or null when any course is malformed
function sanitizeCourses(courses) {
  if (!Array.isArray(courses) || courses.length === 0 || courses.length > MAX_COURSES) return null;
  const clean = [];
  for (const c of courses) {
    if (!c || typeof c !== 'object' || !isValidName(c.name)) return null;
    const units = Number(c.units ?? c.credits);
    if (!Number.isFinite(units) || units <= 0 || units > MAX_UNITS) return null;
    const grade = gradeKey(c.grade);
    if (!Object.prototype.hasOwnProperty.call(gradePoints, grade)) return null;
    clean.push({ name: c.name.trim(), units, grade: String(c.grade).trim() });
  }
  return clean;
}

function sumCourses(courses) {
  let gradePointsTotal = 0;
  let units = 0;
  for (const c of courses) {
    const u = Number(c.units ?? c.credits) || 0;
    const gp = gradePoints[gradeKey(c.grade)] ?? null;
    if (u > 0 && gp !== null) {
      gradePointsTotal += gp * u;
      units += u;
    }
  }
  return { gradePointsTotal, units };
}

function computeGpa(courses) {
  const { gradePointsTotal, units } = sumCourses(courses);
  return units > 0 ? Number((gradePointsTotal / units).toFixed(5)) : 0;
}

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

// Combines the user's chosen terms with extra subjects; both GPA endpoints share this so a saved CGPA is always recomputed on the server
async function computeCumulative(userId, termIds, additionalSubjects) {
  const ids = Array.isArray(termIds) ? [...new Set(termIds.map(parseId).filter(Boolean))].slice(0, 200) : [];
  const extras = Array.isArray(additionalSubjects) ? (sanitizeCourses(additionalSubjects) || []) : [];

  let totalGradePoints = 0;
  let totalUnits = 0;
  const termsData = [];

  if (ids.length) {
    const [rows] = await pool.query(
      `SELECT id, term_name AS termName, courses_json AS coursesJson, gpa
       FROM gpa_records
       WHERE user_id = ? AND id IN (?)
       ORDER BY created_at DESC`,
      [userId, ids]
    );
    for (const row of rows) {
      const courses = parseCourses(row.coursesJson);
      const sum = sumCourses(courses);
      totalGradePoints += sum.gradePointsTotal;
      totalUnits += sum.units;
      termsData.push({ id: row.id, termName: row.termName, gpa: Number(row.gpa), courseCount: courses.length });
    }
  }

  const extraSum = sumCourses(extras);
  totalGradePoints += extraSum.gradePointsTotal;
  totalUnits += extraSum.units;

  return {
    cumulativeGpa: totalUnits > 0 ? Number((totalGradePoints / totalUnits).toFixed(5)) : 0,
    totalUnits,
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
    const courses = sanitizeCourses(req.body.courses);
    if (!courses) {
      return res.status(400).json({ error: 'Each course needs a name, valid units and a valid grade' });
    }

    const gpa = computeGpa(courses);
    const [result] = await pool.query(
      'INSERT INTO gpa_records (user_id, term_name, courses_json, gpa) VALUES (?, ?, ?, ?)',
      [req.session.userId, termName.trim(), JSON.stringify(courses), gpa]
    );

    res.status(201).json({
      id: result.insertId,
      termName: termName.trim(),
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
      'SELECT id, term_name AS termName, courses_json AS coursesJson, gpa, created_at AS createdAt FROM gpa_records WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );

    res.json(rows.map(r => ({
      id: r.id,
      termName: r.termName,
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
    const result = await computeCumulative(req.session.userId, req.body.termIds, req.body.additionalSubjects);
    if (!result.termCount && !result.additionalSubjectsIncluded.length) {
      return res.status(400).json({ error: 'Select at least one term or add additional subjects' });
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate cumulative GPA' });
  }
});

// List saved cumulative GPA records
router.get('/cgpa', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, record_name AS recordName, cgpa_data AS cgpaData, cgpa, created_at AS createdAt FROM cgpa_records WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );
    res.json(rows.map(r => {
      let data = {};
      try { data = typeof r.cgpaData === 'string' ? JSON.parse(r.cgpaData) : (r.cgpaData || {}); } catch {}
      return {
        id: r.id,
        recordName: r.recordName,
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
    const result = await computeCumulative(req.session.userId, termIds, subjects);

    if (result.cumulativeGpa <= 0) {
      return res.status(400).json({ error: 'Select at least one term or subject with a counted grade' });
    }

    const recordData = { recordName: recordName.trim(), ...result };
    const [insert] = await pool.query(
      'INSERT INTO cgpa_records (user_id, record_name, cgpa_data, cgpa) VALUES (?, ?, ?, ?)',
      [req.session.userId, recordName.trim(), JSON.stringify(recordData), result.cumulativeGpa]
    );

    res.status(201).json({
      id: insert.insertId,
      recordName: recordName.trim(),
      cumulativeGpa: result.cumulativeGpa,
      totalUnits: result.totalUnits,
      totalGradePoints: result.totalGradePoints,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
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
    const courses = sanitizeCourses(req.body.courses);
    if (!courses) {
      return res.status(400).json({ error: 'Each course needs a name, valid units and a valid grade' });
    }

    const gpa = computeGpa(courses);
    const [result] = await pool.query(
      'UPDATE gpa_records SET term_name = ?, courses_json = ?, gpa = ? WHERE id = ? AND user_id = ?',
      [termName.trim(), JSON.stringify(courses), gpa, id, req.session.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Term not found' });
    }

    res.json({
      id,
      termName: termName.trim(),
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
