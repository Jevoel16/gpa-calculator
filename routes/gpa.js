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

function computeGpa(courses) {
  let numerator = 0;
  let totalUnits = 0;
  for (const c of courses) {
    const units = Number(c.units ?? c.credits) || 0;
    const gp = gradePoints[String(c.grade ?? '').toUpperCase()] ?? null;
    if (units > 0 && gp !== null) {
      numerator += gp * units;
      totalUnits += units;
    }
  }
  const gpa = totalUnits > 0 ? numerator / totalUnits : 0;
  return Number(gpa.toFixed(5));
}

function validateCourseData(courses) {
  if (!Array.isArray(courses)) return false;
  return courses.every(c => 
    c.name && 
    typeof c.name === 'string' && 
    (c.units || c.credits) && 
    c.grade
  );
}

// Save a new term with courses
router.post('/save', requireAuth, async (req, res) => {
  try {
    const { termName, courses } = req.body;
    
    // Validation
    if (!termName || typeof termName !== 'string' || termName.trim().length === 0) {
      return res.status(400).json({ error: 'Valid term name is required' });
    }
    
    if (!validateCourseData(courses)) {
      return res.status(400).json({ error: 'Each course must have name, units, and grade' });
    }

    const gpa = computeGpa(courses);
    const coursesJson = JSON.stringify(courses);
    
    const [result] = await pool.query(
      'INSERT INTO gpa_records (user_id, term_name, courses_json, gpa) VALUES (?, ?, ?, ?)',
      [req.session.userId, termName.trim(), coursesJson, gpa]
    );

    res.json({ 
      id: result.insertId, 
      termName: termName.trim(), 
      gpa, 
      courses, 
      createdAt: new Date().toISOString() 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save term' });
  }
});

// Update an existing term with courses
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { termName, courses } = req.body;
    
    // Validation
    if (!termName || typeof termName !== 'string' || termName.trim().length === 0) {
      return res.status(400).json({ error: 'Valid term name is required' });
    }
    
    if (!validateCourseData(courses)) {
      return res.status(400).json({ error: 'Each course must have name, units, and grade' });
    }

    // Verify the record belongs to the user
    const [check] = await pool.query(
      'SELECT id FROM gpa_records WHERE id = ? AND user_id = ?',
      [id, req.session.userId]
    );
    
    if (check.length === 0) {
      return res.status(404).json({ error: 'Term not found' });
    }

    const gpa = computeGpa(courses);
    const coursesJson = JSON.stringify(courses);
    
    await pool.query(
      'UPDATE gpa_records SET term_name = ?, courses_json = ?, gpa = ? WHERE id = ?',
      [termName.trim(), coursesJson, gpa, id]
    );

    res.json({ 
      id: parseInt(id), 
      termName: termName.trim(), 
      gpa, 
      courses, 
      createdAt: new Date().toISOString() 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update term' });
  }
});

// Get all terms for a user
router.get('/history', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, term_name AS termName, courses_json AS coursesJson, gpa, created_at AS createdAt FROM gpa_records WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );

    const data = rows.map(r => {
      let courses = [];
      
      // Handle both string and already-parsed JSON
      const coursesData = typeof r.coursesJson === 'string' ? r.coursesJson : JSON.stringify(r.coursesJson);
      
      try {
        courses = JSON.parse(coursesData);
        if (!Array.isArray(courses)) {
          courses = [];
        }
      } catch (parseErr) {
        courses = [];
      }
      
      return {
        id: r.id,
        termName: r.termName,
        gpa: Number(r.gpa),
        courses: courses,
        createdAt: r.createdAt
      };
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

// Calculate cumulative GPA from selected terms and additional subjects
router.post('/calculate-cumulative', requireAuth, async (req, res) => {
  try {
    const { termIds, additionalSubjects } = req.body;
    
    // Validate additional subjects if provided
    let validAdditionalSubjects = [];
    if (Array.isArray(additionalSubjects)) {
      validAdditionalSubjects = additionalSubjects.filter(s => 
        s.name && 
        (s.units || s.credits) && 
        s.grade
      );
    }

    // Check if at least some data is provided
    const hasTerms = Array.isArray(termIds) && termIds.length > 0;
    const hasAdditionalSubjects = validAdditionalSubjects.length > 0;

    if (!hasTerms && !hasAdditionalSubjects) {
      return res.status(400).json({ error: 'Select at least one term or add additional subjects' });
    }

    let totalGradePoints = 0;
    let totalUnits = 0;
    const termsData = [];

    // Fetch only the user's selected terms if any
    if (hasTerms) {
      const placeholders = termIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT id, term_name AS termName, courses_json AS coursesJson, gpa 
         FROM gpa_records 
         WHERE user_id = ? AND id IN (${placeholders}) 
         ORDER BY created_at DESC`,
        [req.session.userId, ...termIds]
      );

      for (const row of rows) {
        let courses = [];
        const coursesData = typeof row.coursesJson === 'string' ? row.coursesJson : JSON.stringify(row.coursesJson);
        
        try {
          courses = JSON.parse(coursesData);
          if (!Array.isArray(courses)) {
            courses = [];
          }
        } catch (parseErr) {
          courses = [];
        }

        // Calculate contribution to cumulative GPA
        for (const course of courses) {
          const units = Number(course.units ?? course.credits) || 0;
          const gp = gradePoints[String(course.grade ?? '').toUpperCase()] ?? null;
          
          if (units > 0 && gp !== null) {
            totalGradePoints += gp * units;
            totalUnits += units;
          }
        }

        termsData.push({
          id: row.id,
          termName: row.termName,
          gpa: Number(row.gpa),
          courseCount: courses.length
        });
      }
    }

    // Process additional subjects
    for (const subject of validAdditionalSubjects) {
      const units = Number(subject.units ?? subject.credits) || 0;
      const gp = gradePoints[String(subject.grade ?? '').toUpperCase()] ?? null;
      
      if (units > 0 && gp !== null) {
        totalGradePoints += gp * units;
        totalUnits += units;
      }
    }

    const cumulativeGpa = totalUnits > 0 ? Number((totalGradePoints / totalUnits).toFixed(5)) : 0;

    res.json({
      cumulativeGpa,
      totalUnits,
      totalGradePoints: Number(totalGradePoints.toFixed(2)),
      termsIncluded: termsData,
      termCount: termsData.length,
      additionalSubjectsIncluded: validAdditionalSubjects
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate cumulative GPA' });
  }
});

// Save a cumulative GPA record
router.post('/save-cgpa', requireAuth, async (req, res) => {
  try {
    const { recordName, cumulativeGpa, totalUnits, totalGradePoints, termsIncluded, additionalSubjectsIncluded } = req.body;
    
    // Validation
    if (!recordName || typeof recordName !== 'string' || recordName.trim().length === 0) {
      return res.status(400).json({ error: 'Valid record name is required' });
    }
    
    if (!cumulativeGpa || cumulativeGpa <= 0) {
      return res.status(400).json({ error: 'Valid CGPA value is required' });
    }

    const recordData = {
      recordName: recordName.trim(),
      cumulativeGpa,
      totalUnits,
      totalGradePoints,
      termsIncluded: termsIncluded || [],
      additionalSubjectsIncluded: additionalSubjectsIncluded || []
    };

    const recordDataJson = JSON.stringify(recordData);
    
    const [result] = await pool.query(
      'INSERT INTO cgpa_records (user_id, record_name, cgpa_data, cgpa) VALUES (?, ?, ?, ?)',
      [req.session.userId, recordName.trim(), recordDataJson, cumulativeGpa]
    );

    res.json({ 
      id: result.insertId, 
      recordName: recordName.trim(), 
      cumulativeGpa, 
      totalUnits,
      totalGradePoints,
      createdAt: new Date().toISOString() 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save CGPA record' });
  }
});

// Delete a CGPA record
router.delete('/cgpa/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify the record belongs to the user
    const [check] = await pool.query(
      'SELECT id FROM cgpa_records WHERE id = ? AND user_id = ?',
      [id, req.session.userId]
    );
    
    if (check.length === 0) {
      return res.status(404).json({ error: 'CGPA record not found' });
    }

    await pool.query('DELETE FROM cgpa_records WHERE id = ?', [id]);
    
    res.json({ success: true, message: 'CGPA record deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete CGPA record' });
  }
});

// Delete a term
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify the term belongs to the user
    const [check] = await pool.query(
      'SELECT id FROM gpa_records WHERE id = ? AND user_id = ?',
      [id, req.session.userId]
    );
    
    if (check.length === 0) {
      return res.status(404).json({ error: 'Term not found' });
    }

    await pool.query('DELETE FROM gpa_records WHERE id = ?', [id]);
    
    res.json({ success: true, message: 'Term deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete term' });
  }
});

module.exports = router;
