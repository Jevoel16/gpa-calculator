// Grading systems as data, plus the GPA math that reads them.
// Shared by the dashboard (browser global) and the server (CommonJS) so both always agree.
//
// A shipped scale's grade -> points mapping must never change: saved terms are recomputed from it.
// Fix a scale by shipping a new id instead.
(function (root) {
  const DEFAULT_SCALE_ID = 'msu-iit';

  // Each band applies while the GPA is at or better than `limit`; the last band (limit null) catches the rest
  const SCALES = [
    {
      id: 'msu-iit',
      name: 'MSU-IIT (1.00–5.00)',
      better: 'lower',
      decimals: 5,
      input: 'select',
      grades: [
        { value: '1.00', points: 1.0, label: 'Excellent' },
        { value: '1.25', points: 1.25, label: 'Very good' },
        { value: '1.50', points: 1.5, label: 'Very good' },
        { value: '1.75', points: 1.75, label: 'Good' },
        { value: '2.00', points: 2.0, label: 'Good' },
        { value: '2.25', points: 2.25, label: 'Satisfactory' },
        { value: '2.50', points: 2.5, label: 'Satisfactory' },
        { value: '2.75', points: 2.75, label: 'Passing' },
        { value: '3.00', points: 3.0, label: 'Passing' },
        { value: '5.00', points: 5.0, label: 'Failed' },
        { value: 'P', points: null, credit: true, label: 'Passed · units credited' },
        { value: 'INC', points: null, label: 'Not counted' },
        { value: 'DROP', points: null, label: 'Not counted' }
      ],
      aliases: { DRP: 'DROP', DROPPED: 'DROP' },
      standings: [
        { limit: 1.5, label: 'Excellent standing' },
        { limit: 2.0, label: 'Very good standing' },
        { limit: 2.5, label: 'Good standing' },
        { limit: 3.0, label: 'Passing' },
        { limit: null, label: 'Below passing' }
      ],
      tones: [
        { limit: 1.75, tone: 'success' },
        { limit: 2.5, tone: 'primary' },
        { limit: 3.0, tone: 'warning' },
        { limit: null, tone: 'danger' }
      ]
    }
  ];

  const byId = new Map(SCALES.map(s => [s.id, s]));

  function getScale(id) {
    return byId.get(String(id ?? '')) || null;
  }

  function listScales() {
    return SCALES.map(s => ({ id: s.id, name: s.name }));
  }

  // Returns the scale's grade entry for a raw grade ("1", "1.5", "drop" ...), or null when it isn't on the scale
  function findGrade(scale, raw) {
    if (!scale) return null;
    let key = String(raw ?? '').trim().toUpperCase();
    if (!key) return null;
    if (scale.aliases && Object.hasOwn(scale.aliases, key)) key = scale.aliases[key];
    const exact = scale.grades.find(g => g.value === key);
    if (exact) return exact;
    // Numeric grades match by value so "1", "1.0" and "1.00" are the same grade
    if (/^\d+(\.\d+)?$/.test(key)) {
      const n = Number(key);
      return scale.grades.find(g => /^\d/.test(g.value) && Number(g.value) === n) || null;
    }
    return null;
  }

  function normalizeGrade(scale, raw) {
    const grade = findGrade(scale, raw);
    return grade ? grade.value : null;
  }

  function sumCourses(courses, scale) {
    let gradePointsTotal = 0;
    let units = 0;
    let creditedUnits = 0; // includes credit-only grades such as P, which are left out of the GPA
    for (const c of courses || []) {
      const u = Number(c.units ?? c.credits) || 0;
      const grade = findGrade(scale, c.grade);
      if (u <= 0 || !grade) continue;
      if (grade.points !== null) {
        gradePointsTotal += grade.points * u;
        units += u;
        creditedUnits += u;
      } else if (grade.credit) {
        creditedUnits += u;
      }
    }
    return { gradePointsTotal, units, creditedUnits };
  }

  function computeGpa(courses, scale) {
    const { gradePointsTotal, units } = sumCourses(courses, scale);
    return units > 0 ? Number((gradePointsTotal / units).toFixed(5)) : 0;
  }

  function band(scale, list, gpa) {
    if (!scale || !gpa) return null;
    const lower = scale.better === 'lower';
    return list.find(b => b.limit === null || (lower ? gpa <= b.limit : gpa >= b.limit)) || null;
  }

  function standing(scale, gpa) {
    const b = band(scale, scale ? scale.standings : [], gpa);
    return b ? b.label : '';
  }

  function tone(scale, gpa) {
    const b = band(scale, scale ? scale.tones : [], gpa);
    return b ? b.tone : '';
  }

  function formatGpa(scale, gpa) {
    return Number(gpa).toFixed(scale ? scale.decimals : 5);
  }

  const api = {
    DEFAULT_SCALE_ID, getScale, listScales, findGrade, normalizeGrade,
    sumCourses, computeGpa, standing, tone, formatGpa
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GradingScales = api;
})(typeof window !== 'undefined' ? window : globalThis);
