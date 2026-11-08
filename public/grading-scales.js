// Never change a shipped scale's points (saved terms are recomputed); add a new id instead
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
    },
    {
      id: 'ph-1to5',
      name: 'PH 1.00–5.00 (with 4.00 conditional)',
      better: 'lower',
      decimals: 5,
      input: 'select',
      grades: [
        { value: '1.00', points: 1.0, label: 'Excellent' },
        { value: '1.25', points: 1.25, label: 'Excellent' },
        { value: '1.50', points: 1.5, label: 'Very good' },
        { value: '1.75', points: 1.75, label: 'Very good' },
        { value: '2.00', points: 2.0, label: 'Good' },
        { value: '2.25', points: 2.25, label: 'Good' },
        { value: '2.50', points: 2.5, label: 'Satisfactory' },
        { value: '2.75', points: 2.75, label: 'Satisfactory' },
        { value: '3.00', points: 3.0, label: 'Passing' },
        // A conditional grade becomes 3.00 or 5.00 after a removal exam, so it isn't counted until then
        { value: '4.00', points: null, label: 'Conditional · not counted' },
        { value: '5.00', points: 5.0, label: 'Failed' },
        { value: 'P', points: null, credit: true, label: 'Passed · units credited' },
        { value: 'INC', points: null, label: 'Not counted' },
        { value: 'DRP', points: null, label: 'Not counted' }
      ],
      aliases: { DROP: 'DRP', DROPPED: 'DRP' },
      standings: [
        { limit: 1.25, label: 'Excellent standing' },
        { limit: 1.75, label: 'Very good standing' },
        { limit: 2.25, label: 'Good standing' },
        { limit: 2.75, label: 'Satisfactory standing' },
        { limit: 3.0, label: 'Passing' },
        { limit: null, label: 'Below passing' }
      ],
      tones: [
        { limit: 1.75, tone: 'success' },
        { limit: 2.5, tone: 'primary' },
        { limit: 3.0, tone: 'warning' },
        { limit: null, tone: 'danger' }
      ]
    },
    {
      id: 'ph-percent',
      name: 'PH percentage (75 passing)',
      better: 'higher',
      decimals: 2,
      // Any number in the range is a grade worth its own value; `grades` holds only the special marks
      input: 'number',
      range: { min: 0, max: 100 },
      grades: [
        { value: 'P', points: null, credit: true, label: 'Passed · units credited' },
        { value: 'INC', points: null, label: 'Not counted' },
        { value: 'DROP', points: null, label: 'Not counted' }
      ],
      aliases: { DRP: 'DROP', DROPPED: 'DROP' },
      standings: [
        { limit: 95, label: 'Excellent standing' },
        { limit: 90, label: 'Very good standing' },
        { limit: 85, label: 'Good standing' },
        { limit: 80, label: 'Satisfactory standing' },
        { limit: 75, label: 'Passing' },
        { limit: null, label: 'Below passing' }
      ],
      tones: [
        { limit: 90, tone: 'success' },
        { limit: 80, tone: 'primary' },
        { limit: 75, tone: 'warning' },
        { limit: null, tone: 'danger' }
      ]
    },
    {
      id: 'ph-4pt',
      name: 'PH 4.0 (0.0–4.0)',
      better: 'higher',
      decimals: 3,
      input: 'select',
      grades: [
        { value: '4.0', points: 4.0, label: 'Excellent' },
        { value: '3.5', points: 3.5, label: 'Superior' },
        { value: '3.0', points: 3.0, label: 'Very good' },
        { value: '2.5', points: 2.5, label: 'Good' },
        { value: '2.0', points: 2.0, label: 'Satisfactory' },
        { value: '1.5', points: 1.5, label: 'Fair' },
        { value: '1.0', points: 1.0, label: 'Passing' },
        { value: '0.0', points: 0.0, label: 'Failed' },
        { value: 'P', points: null, credit: true, label: 'Passed · units credited' },
        { value: 'INC', points: null, label: 'Not counted' },
        { value: 'W', points: null, label: 'Withdrawn · not counted' }
      ],
      aliases: { DROP: 'W', DRP: 'W' },
      standings: [
        { limit: 3.5, label: 'Excellent standing' },
        { limit: 3.0, label: 'Very good standing' },
        { limit: 2.5, label: 'Good standing' },
        { limit: 2.0, label: 'Satisfactory standing' },
        { limit: 1.0, label: 'Passing' },
        { limit: null, label: 'Below passing' }
      ],
      tones: [
        { limit: 3.0, tone: 'success' },
        { limit: 2.0, tone: 'primary' },
        { limit: 1.0, tone: 'warning' },
        { limit: null, tone: 'danger' }
      ]
    },
    {
      id: 'us-4pt',
      name: 'US letter grades (A–F, 4.0)',
      better: 'higher',
      decimals: 3,
      input: 'select',
      grades: [
        { value: 'A+', points: 4.0, label: 'Excellent' },
        { value: 'A', points: 4.0, label: 'Excellent' },
        { value: 'A-', points: 3.7, label: 'Excellent' },
        { value: 'B+', points: 3.3, label: 'Good' },
        { value: 'B', points: 3.0, label: 'Good' },
        { value: 'B-', points: 2.7, label: 'Good' },
        { value: 'C+', points: 2.3, label: 'Satisfactory' },
        { value: 'C', points: 2.0, label: 'Satisfactory' },
        { value: 'C-', points: 1.7, label: 'Satisfactory' },
        { value: 'D+', points: 1.3, label: 'Poor · passing' },
        { value: 'D', points: 1.0, label: 'Poor · passing' },
        { value: 'D-', points: 0.7, label: 'Poor · passing' },
        { value: 'F', points: 0.0, label: 'Failed' },
        { value: 'P', points: null, credit: true, label: 'Passed · units credited' },
        { value: 'NP', points: null, label: 'Not passed · not counted' },
        { value: 'I', points: null, label: 'Incomplete · not counted' },
        { value: 'W', points: null, label: 'Withdrawn · not counted' }
      ],
      aliases: { INC: 'I', DROP: 'W', DRP: 'W' },
      standings: [
        { limit: 3.5, label: 'Excellent standing' },
        { limit: 3.0, label: 'Very good standing' },
        { limit: 2.0, label: 'Good standing' },
        { limit: 1.0, label: 'Passing' },
        { limit: null, label: 'Below passing' }
      ],
      tones: [
        { limit: 3.5, tone: 'success' },
        { limit: 2.5, tone: 'primary' },
        { limit: 2.0, tone: 'warning' },
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
    if (!/^\d+(\.\d+)?$/.test(key)) return null;
    const n = Number(key);
    // Percentage-style scales: any number in range is a grade worth its own value, kept to 2 decimals
    if (scale.input === 'number') {
      if (n < scale.range.min || n > scale.range.max) return null;
      const rounded = Math.round(n * 100) / 100;
      return { value: String(rounded), points: rounded, label: '' };
    }
    // Numeric grades match by value so "1", "1.0" and "1.00" are the same grade
    return scale.grades.find(g => /^\d/.test(g.value) && Number(g.value) === n) || null;
  }

  function normalizeGrade(scale, raw) {
    const grade = findGrade(scale, raw);
    return grade ? grade.value : null;
  }

  // Numbers carry over only between scales of the same kind; marks only if the new scale has them
  function carryGrade(from, to, raw) {
    const before = normalizeGrade(from, raw);
    const after = normalizeGrade(to, raw);
    if (!before || before !== after) return null;
    if (!/^\d/.test(after)) return after;
    const sameKind = from.better === to.better && from.input === to.input && to.input === 'select';
    return sameKind ? after : null;
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
    DEFAULT_SCALE_ID, getScale, listScales, findGrade, normalizeGrade, carryGrade,
    sumCourses, computeGpa, standing, tone, formatGpa
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GradingScales = api;
})(typeof window !== 'undefined' ? window : globalThis);
