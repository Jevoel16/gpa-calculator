// Parses grades copied from the MyIIT portal, e.g.
//   SY: 2023-2024 SEM: 1 (BSIT:BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY)
//   CCC100<TAB>Fundamentals of Computing<TAB>1.00
// Shared by the dashboard (browser global) and the tests (CommonJS).
(function (root) {
  const GRADES = ['1.00','1.25','1.50','1.75','2.00','2.25','2.50','2.75','3.00','5.00','P','INC','DROP'];
  const MAX_NAME = 100;
  const HEADER = /^SY:\s*\d{4}\s*-\s*\d{4}\b.*\bSEM:/i;
  const CODE = /^[A-Z]{2,5}\s?\d{2,4}[A-Z]?$/i;
  // Space-separated copies (no tabs). Units are not read here: a name like "Programming 1" would be ambiguous.
  const SPACED_LINE = /^([A-Z]{2,5}\s?\d{2,4}[A-Z]?)\s+(.+?)\s+(\d(?:\.\d{1,2})?|P|INC|DROP|DRP)$/i;

  function normalizeGrade(value){
    const raw = String(value ?? '').trim().toUpperCase();
    if (raw === 'DRP' || raw === 'DROPPED') return 'DROP';
    if (raw === 'P' || raw === 'INC' || raw === 'DROP') return raw;
    if (!/^\d(\.\d{1,2})?$/.test(raw)) return '';
    const fixed = Number(raw).toFixed(2);
    return GRADES.includes(fixed) ? fixed : '';
  }

  function isGradeToken(value){
    return /^(\d(\.\d{1,2})?|P|INC|DROP|DRP|DROPPED)$/i.test(String(value ?? '').trim());
  }

  function parseCourseLine(line){
    const fields = line.split('\t').map(f => f.trim()).filter(Boolean);
    if (fields.length >= 2 && CODE.test(fields[0])) {
      const code = fields[0].toUpperCase();
      const name = fields[1];
      let units = '';
      let grade = '';
      const rest = fields.slice(2);
      if (rest.length && isGradeToken(rest[rest.length - 1])) grade = normalizeGrade(rest.pop());
      // A remaining numeric column between title and grade is the units, when the copy includes it
      if (rest.length && /^\d+(\.\d+)?$/.test(rest[0])) units = rest[0];
      return { code, name: name.slice(0, MAX_NAME), units, grade };
    }
    const m = line.match(SPACED_LINE);
    if (m) return { code: m[1].toUpperCase(), name: m[2].trim().slice(0, MAX_NAME), units: '', grade: normalizeGrade(m[3]) };
    return null;
  }

  // Returns { termName, courses, moreTerms }; only the first term is read when several are copied at once
  function parseMyiitGrades(text){
    const result = { termName: '', courses: [], moreTerms: false };
    const lines = String(text ?? '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (HEADER.test(line)) {
        if (result.termName || result.courses.length) { result.moreTerms = true; break; }
        result.termName = line.replace(/\s+/g, ' ').slice(0, MAX_NAME);
        continue;
      }
      const course = parseCourseLine(line);
      if (course) result.courses.push(course);
    }
    return result;
  }

  const api = { parseMyiitGrades, normalizeGrade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MyiitPaste = api;
})(typeof window !== 'undefined' ? window : globalThis);
