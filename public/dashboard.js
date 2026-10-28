const gradeOptions = ['1.00','1.25','1.50','1.75','2.00','2.25','2.50','2.75','3.00','5.00','INC','DROP'];
const gradePoints = { '1.00':1.0,'1.25':1.25,'1.50':1.5,'1.75':1.75,'2.00':2.0,'2.25':2.25,'2.50':2.5,'2.75':2.75,'3.00':3.0,'5':5.0,'5.00':5.0 };
let allHistory = [];
let additionalSubjects = [];
let editingRecordId = null;

const icons = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/></svg>'
};

const views = {
  term: { section: 'newTermSection', title: 'New Term', subtitle: 'Add your courses and see your GPA update instantly.' },
  cumulative: { section: 'cumulativeSection', title: 'Cumulative GPA', subtitle: 'Combine saved terms and extra subjects into one CGPA.' },
  history: { section: 'historySection', title: 'History', subtitle: 'All your saved terms. Click a card to open it.' }
};

const $ = id => document.getElementById(id);

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function toast(message, type = 'success'){
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function gradeChipClass(gpa){
  if (!gpa) return 'chip';
  if (gpa <= 1.75) return 'chip chip-success';
  if (gpa <= 2.5) return 'chip chip-primary';
  if (gpa <= 3.0) return 'chip chip-warning';
  return 'chip chip-danger';
}

function standing(gpa){
  if (!gpa) return '';
  if (gpa <= 1.5) return 'Excellent standing';
  if (gpa <= 2.0) return 'Very good standing';
  if (gpa <= 2.5) return 'Good standing';
  if (gpa <= 3.0) return 'Passing';
  return 'Below passing';
}

async function api(path, opts={}){
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Signed out');
  }
  // A proxy or platform error page may not be JSON
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

async function loadMe(){
  const me = await api('/api/auth/me', { method: 'GET' });
  $('welcome').textContent = me.name;
  $('userEmail').textContent = me.email;
  $('avatar').textContent = (me.name || '?').trim().charAt(0).toUpperCase();
}

function showView(name){
  const view = views[name] || views.term;
  for (const [key, v] of Object.entries(views)) {
    $(v.section).classList.toggle('hidden', v !== view);
    const tab = document.querySelector(`.tab[data-view="${key}"]`);
    tab.classList.toggle('active', v === view);
    tab.setAttribute('aria-selected', String(v === view));
  }
  $('pageTitle').textContent = view.title;
  $('pageSubtitle').textContent = view.subtitle;
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

/* ---------- New term ---------- */

function gradeSelectHtml(selected = ''){
  return `<option value="">Grade</option>` +
    gradeOptions.map(g => `<option value="${g}" ${selected === g ? 'selected' : ''}>${g}</option>`).join('');
}

function renumberRows(){
  document.querySelectorAll('#coursesBody tr').forEach((tr, i) => {
    tr.querySelector('.course-row-index').textContent = i + 1;
  });
}

function addRow(values={}){
  const tbody = $('coursesBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="course-row-index"></td>
    <td><input type="text" placeholder="e.g. Calculus I" class="course-name" aria-label="Course name" value="${escapeHtml(values.name)}"/></td>
    <td><input type="number" min="0" step="0.5" placeholder="Units" class="course-units" aria-label="Units" value="${escapeHtml(values.units)}"/></td>
    <td><select class="course-grade" aria-label="Grade">${gradeSelectHtml(values.grade)}</select></td>
    <td><button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Remove course" title="Remove">${icons.trash}</button></td>
  `;
  tr.querySelector('button').addEventListener('click', () => { tr.remove(); renumberRows(); updateTermSummary(); });
  tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updateTermSummary));
  tbody.appendChild(tr);
  renumberRows();
  updateTermSummary();
}

function readCourses(){
  const rows = Array.from(document.querySelectorAll('#coursesBody tr'));
  return rows.map(r => ({
    name: r.querySelector('.course-name').value.trim(),
    units: Number(r.querySelector('.course-units').value) || 0,
    grade: r.querySelector('.course-grade').value
  })).filter(c => c.name && c.units > 0 && c.grade);
}

function computeGpa(courses){
  let numerator = 0;
  let totalUnits = 0;
  for(const c of courses){
    const p = gradePoints[c.grade];
    const units = Number(c.units ?? c.credits) || 0;
    if(p!=null && units>0){
      numerator += p * units;
      totalUnits += units;
    }
  }
  return totalUnits ? Number((numerator/totalUnits).toFixed(5)) : 0;
}

function updateTermSummary(){
  const courses = readCourses();
  const gpa = computeGpa(courses);
  const units = courses.filter(c => gradePoints[c.grade] != null).reduce((sum, c) => sum + c.units, 0);
  $('termGpaDisplay').textContent = gpa ? gpa.toFixed(5) : '—';
  $('termGpaSub').textContent = gpa ? standing(gpa) : 'Add courses to compute';
  $('termUnitsDisplay').textContent = units;
  $('termCoursesDisplay').textContent = courses.length;
}

function resetTermForm(){
  $('termName').value = '';
  $('coursesBody').innerHTML = '';
  setEditing(null);
  $('calcMsg').textContent = '';
  addRow(); addRow(); addRow();
}

function setEditing(record){
  editingRecordId = record ? record.id : null;
  $('saveBtn').textContent = record ? 'Update record' : 'Save record';
  const banner = $('editingBanner');
  banner.classList.toggle('hidden', !record);
  banner.textContent = record ? `Editing “${record.termName}” — saving will update this record.` : '';
}

function loadTermData(record, { edit = false } = {}){
  $('termName').value = record.termName;
  $('coursesBody').innerHTML = '';
  for (const course of record.courses) addRow(course);
  if (!record.courses.length) addRow();
  setEditing(edit ? record : null);
  $('calcMsg').textContent = edit ? '' : `Loaded a copy of “${record.termName}”. Saving creates a new record.`;
  showView('term');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveTerm(){
  const termName = $('termName').value.trim();
  const courses = readCourses();

  if (!termName || courses.length === 0) {
    toast('Add a term name and at least one complete course', 'error');
    return;
  }

  const btn = $('saveBtn');
  btn.disabled = true;
  try {
    const body = JSON.stringify({ termName, courses });
    const saved = editingRecordId
      ? await api(`/api/gpa/${editingRecordId}`, { method: 'PUT', body })
      : await api('/api/gpa/save', { method: 'POST', body });
    toast(`${editingRecordId ? 'Updated' : 'Saved'} “${saved.termName}” · GPA ${Number(saved.gpa).toFixed(5)}`);
    resetTermForm();
    await loadHistory();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- History ---------- */

async function loadHistory(){
  allHistory = await api('/api/gpa/history');
  renderHistory();
  updateCumulativeTermsList();
}

function renderHistory(){
  const container = $('historyList');
  if (!allHistory.length) {
    container.innerHTML = `
      <div class="card empty-state">
        <div class="icon">${icons.book}</div>
        <h3>No saved terms yet</h3>
        <p>Create your first term to start building your history.</p>
        <button class="btn" type="button" style="margin-top: 16px;" id="emptyNewTerm">Create a term</button>
      </div>`;
    $('emptyNewTerm').addEventListener('click', () => showView('term'));
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'history-grid';
  for (const r of allHistory) {
    const units = r.courses.reduce((sum, c) => sum + (Number(c.units ?? c.credits) || 0), 0);
    const card = document.createElement('article');
    card.className = 'card term-card';
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="term-card-top">
        <div>
          <h3>${escapeHtml(r.termName)}</h3>
          <div class="date">${escapeHtml(new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}</div>
        </div>
        <span class="${gradeChipClass(r.gpa)}">${escapeHtml(standing(r.gpa) || 'No GPA')}</span>
      </div>
      <div class="gpa-pill">${r.gpa.toFixed(5)}</div>
      <div class="meta">
        <span class="chip">${r.courses.length} course${r.courses.length === 1 ? '' : 's'}</span>
        <span class="chip">${units} units</span>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" type="button" data-action="edit">${icons.edit} Edit</button>
        <button class="btn btn-danger btn-sm" type="button" data-action="delete">${icons.trash} Delete</button>
      </div>`;
    card.addEventListener('click', () => loadTermData(r));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === card) loadTermData(r); });
    card.querySelector('[data-action="edit"]').addEventListener('click', e => { e.stopPropagation(); loadTermData(r, { edit: true }); });
    card.querySelector('[data-action="delete"]').addEventListener('click', async e => {
      e.stopPropagation();
      if (confirm(`Delete "${r.termName}"? This can't be undone.`)) await deleteRecord(r.id);
    });
    grid.appendChild(card);
  }
  container.innerHTML = '';
  container.appendChild(grid);
}

async function deleteRecord(id){
  try {
    await api(`/api/gpa/${id}`, { method: 'DELETE' });
    if (editingRecordId === id) resetTermForm();
    await loadHistory();
    toast('Record deleted');
  } catch (err) {
    toast('Failed to delete record: ' + err.message, 'error');
  }
}

/* ---------- Cumulative ---------- */

function updateCumulativeTermsList(){
  const list = $('termsCheckList');
  list.innerHTML = '';
  if (!allHistory.length) {
    list.innerHTML = '<p class="muted" style="font-size: 14px;">No saved terms yet. Create and save a term first.</p>';
    updateCumulativeGpa();
    return;
  }
  for (const record of allHistory) {
    const label = document.createElement('label');
    label.className = 'term-pick';
    label.innerHTML = `
      <input type="checkbox" class="cumulative-term" data-term-id="${record.id}" checked />
      <span class="check">${icons.check}</span>
      <span>
        <span class="term-pick-name">${escapeHtml(record.termName)}</span><br/>
        <span class="term-pick-meta">GPA ${record.gpa.toFixed(5)} · ${record.courses.length} courses</span>
      </span>`;
    label.querySelector('input').addEventListener('change', updateCumulativeGpa);
    list.appendChild(label);
  }
  updateCumulativeGpa();
}

function addAdditionalSubject(){
  const nameInput = $('additionalSubjectName');
  const unitsInput = $('additionalSubjectUnits');
  const gradeInput = $('additionalSubjectGrade');

  const name = nameInput.value.trim();
  const units = Number(unitsInput.value);
  const grade = gradeInput.value.trim();

  if (!name) return toast('Subject name is required', 'error');
  if (!units || units <= 0) return toast('Units must be a positive number', 'error');
  if (!grade) return toast('Grade is required', 'error');

  additionalSubjects.push({ name, units, grade });
  nameInput.value = '';
  unitsInput.value = '';
  gradeInput.value = '';
  nameInput.focus();

  displayAdditionalSubjects();
  updateCumulativeGpa();
}

function removeAdditionalSubject(index){
  additionalSubjects.splice(index, 1);
  displayAdditionalSubjects();
  updateCumulativeGpa();
}

function displayAdditionalSubjects(){
  const tbody = $('additionalSubjectsBody');
  tbody.innerHTML = '';

  if (additionalSubjects.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No additional subjects added</td></tr>';
    return;
  }

  additionalSubjects.forEach((subject, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(subject.name)}</td>
      <td class="num">${escapeHtml(subject.units)}</td>
      <td class="num">${escapeHtml(subject.grade)}</td>
      <td><button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Remove subject" title="Remove">${icons.trash}</button></td>`;
    tr.querySelector('button').addEventListener('click', () => removeAdditionalSubject(i));
    tbody.appendChild(tr);
  });
}

function resetCumulativeDisplay(text = '0.00'){
  $('totalUnitsDisplay').textContent = text === '0.00' ? '0' : text;
  $('gradePointsDisplay').textContent = text;
  $('cumulativeGpaDisplay').textContent = text;
  $('cumulativeTermsTable').innerHTML = '<p class="muted" style="font-size: 14px;">Select terms or add subjects to see the breakdown.</p>';
  $('cgpaSaveSection').classList.add('hidden');
  window.currentCGPA = null;
}

function updateCumulativeGpa(){
  const selectedTermIds = Array.from(document.querySelectorAll('.cumulative-term:checked')).map(el => Number(el.dataset.termId));
  if (selectedTermIds.length === 0 && additionalSubjects.length === 0) {
    resetCumulativeDisplay();
    return;
  }
  calculateCumulativeGpaServer(selectedTermIds, additionalSubjects);
}

// Ignores responses from earlier calculations that finish after a newer one
let cumulativeRequestId = 0;

async function calculateCumulativeGpaServer(termIds, additionalSubjects = []){
  const requestId = ++cumulativeRequestId;
  try {
    const response = await api('/api/gpa/calculate-cumulative', {
      method: 'POST',
      body: JSON.stringify({ termIds, additionalSubjects })
    });
    if (requestId !== cumulativeRequestId) return;

    $('totalUnitsDisplay').textContent = response.totalUnits;
    $('gradePointsDisplay').textContent = response.totalGradePoints;
    $('cumulativeGpaDisplay').textContent = response.cumulativeGpa.toFixed(5);

    const termRows = response.termsIncluded.map(t =>
      `<tr><td><strong>${escapeHtml(t.termName)}</strong><br/><span class="muted" style="font-size: 12px;">${t.courseCount} courses</span></td><td class="num">${t.gpa.toFixed(5)}</td></tr>`
    ).join('');
    const subjectRows = (response.additionalSubjectsIncluded || []).map(s =>
      `<tr><td>${escapeHtml(s.name)}<br/><span class="muted" style="font-size: 12px;">Additional · ${escapeHtml(s.units)} units</span></td><td class="num">${escapeHtml(s.grade)}</td></tr>`
    ).join('');

    $('cumulativeTermsTable').innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Included</th><th class="num">GPA</th></tr></thead>
        <tbody>${termRows}${subjectRows}</tbody>
      </table></div>`;

    if (response.cumulativeGpa > 0) {
      $('cgpaSaveSection').classList.remove('hidden');
      // The server recomputes the CGPA from these inputs when it is saved
      window.currentCGPA = { termIds, additionalSubjects: [...additionalSubjects] };
    } else {
      $('cgpaSaveSection').classList.add('hidden');
      window.currentCGPA = null;
    }
  } catch (err) {
    if (requestId === cumulativeRequestId) resetCumulativeDisplay('Error');
  }
}

async function loadCgpaRecords(){
  const records = await api('/api/gpa/cgpa');
  const container = $('cgpaRecordsList');
  if (!records.length) {
    container.innerHTML = '<p class="muted" style="font-size: 14px;">No saved CGPA records yet.</p>';
    return;
  }
  const rows = records.map(r => `
    <tr data-id="${r.id}">
      <td><strong>${escapeHtml(r.recordName)}</strong><br/><span class="muted" style="font-size: 12px;">${escapeHtml(new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))} · ${r.totalUnits} units</span></td>
      <td class="num">${r.cumulativeGpa.toFixed(5)}</td>
      <td><button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Delete CGPA record" title="Delete">${icons.trash}</button></td>
    </tr>`).join('');
  container.innerHTML = `
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Record</th><th class="num">CGPA</th><th style="width: 48px"></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  container.querySelectorAll('tbody tr').forEach((tr, i) => {
    tr.querySelector('button').addEventListener('click', async () => {
      const record = records[i];
      if (!confirm(`Delete "${record.recordName}"? This can't be undone.`)) return;
      try {
        await api(`/api/gpa/cgpa/${record.id}`, { method: 'DELETE' });
        toast('CGPA record deleted');
        await loadCgpaRecords();
      } catch (err) {
        toast('Failed to delete record: ' + err.message, 'error');
      }
    });
  });
}

async function saveCgpa(){
  const recordName = $('cgpaRecordName').value.trim();
  if (!recordName) return toast('Record name is required', 'error');
  if (!window.currentCGPA) return toast('No CGPA calculated. Select terms or add subjects.', 'error');

  const btn = $('saveCgpaBtn');
  btn.disabled = true;
  try {
    const saved = await api('/api/gpa/save-cgpa', { method: 'POST', body: JSON.stringify({ recordName, ...window.currentCGPA }) });
    toast(`Saved “${saved.recordName}” · CGPA ${Number(saved.cumulativeGpa).toFixed(5)}`);
    $('cgpaRecordName').value = '';
    await loadCgpaRecords();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Init ---------- */

function initializeEventListeners(){
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
  $('additionalSubjectGrade').innerHTML = gradeSelectHtml();
  $('addSubjectBtn').addEventListener('click', addAdditionalSubject);
  $('additionalSubjectName').addEventListener('keydown', e => { if (e.key === 'Enter') addAdditionalSubject(); });
  $('addRowBtn').addEventListener('click', () => { addRow(); document.querySelector('#coursesBody tr:last-child .course-name').focus(); });
  $('clearBtn').addEventListener('click', resetTermForm);
  $('saveBtn').addEventListener('click', saveTerm);
  $('saveCgpaBtn').addEventListener('click', saveCgpa);
  $('logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {}
    window.location.href = '/login';
  });
}

async function initializePage(){
  showView(location.hash.slice(1));
  displayAdditionalSubjects();
  resetTermForm();
  try {
    await loadMe();
  } catch {}
  try {
    await Promise.all([loadHistory(), loadCgpaRecords()]);
  } catch (err) {
    if (err.message !== 'Signed out') toast('Could not load your records: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  initializePage();
});
