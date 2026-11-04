const Scales = window.GradingScales;
let defaultScaleId = Scales.DEFAULT_SCALE_ID; // the account's choice, set by loadMe()
let termScale = Scales.getScale(defaultScaleId); // scale of the term in the New Term form
let cumulativeScaleId = null; // scale picked in the Cumulative view; null until history loads
const MYIIT_SCALE_ID = 'msu-iit';
let allHistory = [];
let additionalSubjects = [];
let editingRecordId = null;

const icons = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
};

const views = {
  term: { section: 'newTermSection', title: 'New Term' },
  cumulative: { section: 'cumulativeSection', title: 'Cumulative GPA' },
  history: { section: 'historySection', title: 'History' },
  settings: { section: 'settingsSection', title: 'Settings' }
};

const paneHints = {
  termsPane: 'Choose which terms to include.',
  subjectsPane: "Add subjects that aren't part of a saved term.",
  cgpaPane: 'Your saved cumulative GPA records.'
};

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

const $ = id => document.getElementById(id);

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

// Errors are announced immediately and stay longer; every toast can be dismissed
function toast(message, type = 'success'){
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  if (type === 'error') el.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.innerHTML = icons.close;
  close.addEventListener('click', () => el.remove());
  el.append(text, close);
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 8000 : 4000);
}

// Promise-based replacement for window.confirm() using the themed <dialog>
function confirmAction(title, text, okLabel = 'Delete'){
  const dialog = $('confirmDialog');
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  $('confirmOk').textContent = okLabel;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}

function gradeChipClass(gpa, scale = termScale){
  const tone = Scales.tone(scale, gpa);
  return tone ? `chip chip-${tone}` : 'chip';
}

function standing(gpa, scale = termScale){
  return Scales.standing(scale, gpa);
}

function formatGpa(gpa, scale = termScale){
  return Scales.formatGpa(scale, gpa);
}

// Records saved before per-term scales have no scaleId and are on the original scale
function scaleOf(record){
  return Scales.getScale(record && record.scaleId) || Scales.getScale(Scales.DEFAULT_SCALE_ID);
}

function scaleOptionsHtml(selectedId){
  return Scales.listScales()
    .map(s => `<option value="${escapeHtml(s.id)}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');
}

// Groups neighbouring grades with the same label, e.g. "1.25–1.50 Very good"
function scaleRows(scale){
  const rows = [];
  for (const g of scale.grades) {
    const last = rows[rows.length - 1];
    if (last && last.label === g.label && g.points !== null && last.points !== null) {
      last.to = g.value;
    } else {
      rows.push({ from: g.value, to: null, label: g.label, points: g.points });
    }
  }
  return rows.map(r => ({ grade: r.to ? `${r.from}–${r.to}` : r.from, label: r.label }));
}

function renderScalePanel(scale){
  $('scaleList').innerHTML = scaleRows(scale)
    .map(r => `<div><span>${escapeHtml(r.grade)}</span><span>${escapeHtml(r.label)}</span></div>`)
    .join('');
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
  const initial = (me.name || '?').trim().charAt(0).toUpperCase();
  $('welcome').textContent = me.name;
  $('avatar').textContent = initial;
  $('accountBtn').setAttribute('aria-label', `Account settings for ${me.name}`);
  $('settingsAvatar').textContent = initial;
  $('settingsName').textContent = me.name;
  $('settingsHandle').textContent = me.username ? `@${me.username}` : '';
  $('settingsUsername').textContent = me.username || 'Not set';
  $('settingsEmail').textContent = me.email;
  $('pwUsername').value = me.username || me.email;
  if (Scales.getScale(me.defaultScale)) defaultScaleId = me.defaultScale;
  $('defaultScale').innerHTML = scaleOptionsHtml(defaultScaleId);
  $('historyScale').innerHTML = scaleOptionsHtml(defaultScaleId);
  renderScalePanel(Scales.getScale(defaultScaleId));
  // A fresh form follows the account default; one the user already started is left alone
  if (!editingRecordId && !readCourses().length && !$('termName').value.trim()) setTermScale(defaultScaleId);
}

async function saveDefaultScale(){
  const select = $('defaultScale');
  const previous = defaultScaleId;
  select.disabled = true;
  try {
    const saved = await api('/api/auth/preferences', { method: 'PUT', body: JSON.stringify({ defaultScale: select.value }) });
    defaultScaleId = saved.defaultScale;
    toast(`New terms will use ${Scales.getScale(defaultScaleId).name}`);
  } catch (err) {
    select.value = previous;
    toast(err.message, 'error');
  } finally {
    select.disabled = false;
  }
}

function showView(name){
  // hasOwn so hashes like #constructor don't match inherited Object properties
  const key = Object.hasOwn(views, name) ? name : 'term';
  const view = views[key];
  // On phones the page itself scrolls, so a new view should start at the top
  if ($(view.section).classList.contains('hidden')) window.scrollTo(0, 0);
  for (const [k, v] of Object.entries(views)) {
    $(v.section).classList.toggle('hidden', v !== view);
    const tab = document.querySelector(`.tab[data-view="${k}"]`);
    tab.classList.toggle('active', v === view);
    if (v === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  $('pageTitle').textContent = view.title;
  document.title = `${view.title} • GPA Calculator`;
  // Unknown or missing hashes are normalised without adding a history entry
  if (location.hash !== `#${key}`) history.replaceState(null, '', `#${key}`);
}

// Views are addressed by the URL hash, so the nav links, back/forward and bookmarks all go through hashchange
function goTo(name){
  if (location.hash === `#${name}`) showView(name);
  else location.hash = name;
}

/* ---------- New term ---------- */

function gradeSelectHtml(selected = '', scale = termScale){
  const current = Scales.normalizeGrade(scale, selected);
  return `<option value="">Grade</option>` +
    scale.grades.map(g => `<option value="${escapeHtml(g.value)}" ${current === g.value ? 'selected' : ''}>${escapeHtml(g.value)}</option>`).join('');
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
    <td class="col-code"><input type="text" maxlength="20" placeholder="Code" class="course-code" aria-label="Course code" value="${escapeHtml(values.code)}"/></td>
    <td><input type="text" placeholder="e.g. Calculus I" class="course-name" aria-label="Course name" value="${escapeHtml(values.name)}"/></td>
    <td><input type="number" min="0" step="0.5" inputmode="decimal" placeholder="Units" class="course-units" aria-label="Units" value="${escapeHtml(values.units)}"/></td>
    <td><select class="course-grade" aria-label="Grade">${gradeSelectHtml(values.grade)}</select></td>
    <td><button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Remove course" title="Remove">${icons.trash}</button></td>
  `;
  tr.querySelector('button').addEventListener('click', () => { tr.remove(); renumberRows(); updateTermSummary(); });
  tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', () => {
    el.removeAttribute('aria-invalid');
    updateTermSummary();
  }));
  tbody.appendChild(tr);
  renumberRows();
  updateTermSummary();
  return tr;
}

function readCourses(){
  const rows = Array.from(document.querySelectorAll('#coursesBody tr'));
  return rows.map(r => ({
    code: r.querySelector('.course-code').value.trim(),
    name: r.querySelector('.course-name').value.trim(),
    units: Number(r.querySelector('.course-units').value) || 0,
    grade: r.querySelector('.course-grade').value
  })).filter(c => c.name && c.units > 0 && c.grade);
}

function updateTermSummary(){
  const courses = readCourses();
  const gpa = Scales.computeGpa(courses, termScale);
  const units = Scales.sumCourses(courses, termScale).creditedUnits;
  $('termGpaDisplay').textContent = gpa ? formatGpa(gpa) : '—';
  $('termGpaSub').textContent = gpa ? standing(gpa) : 'Add courses to compute';
  $('termUnitsDisplay').textContent = units;
  $('termCoursesDisplay').textContent = courses.length;
}

// Switching scales rebuilds each grade picker; grades the new scale doesn't have are cleared and flagged
function setTermScale(id){
  termScale = Scales.getScale(id) || Scales.getScale(defaultScaleId);
  $('termScale').innerHTML = scaleOptionsHtml(termScale.id);
  let cleared = 0;
  for (const select of document.querySelectorAll('#coursesBody .course-grade')) {
    const previous = select.value;
    select.innerHTML = gradeSelectHtml(previous);
    if (previous && !select.value) {
      select.setAttribute('aria-invalid', 'true');
      cleared++;
    }
  }
  updateTermSummary();
  return cleared;
}

function changeTermScale(){
  const cleared = setTermScale($('termScale').value);
  if (cleared) toast(`${cleared} grade${cleared === 1 ? '' : 's'} not on ${termScale.name} were cleared`, 'error');
}

function resetTermForm(){
  $('termName').value = '';
  $('coursesBody').innerHTML = '';
  setEditing(null);
  setTermScale(defaultScaleId);
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
  setTermScale(scaleOf(record).id);
  for (const course of record.courses) addRow(course);
  if (!record.courses.length) addRow();
  setEditing(edit ? record : null);
  $('calcMsg').textContent = edit ? '' : `Loaded a copy of “${record.termName}”. Saving creates a new record.`;
  goTo('term');
  $('coursesScroll').scrollTop = 0;
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
    const body = JSON.stringify({ termName, courses, scaleId: termScale.id });
    const saved = editingRecordId
      ? await api(`/api/gpa/${editingRecordId}`, { method: 'PUT', body })
      : await api('/api/gpa/save', { method: 'POST', body });
    toast(`${editingRecordId ? 'Updated' : 'Saved'} “${saved.termName}” · GPA ${formatGpa(saved.gpa)}`);
    resetTermForm();
    await loadHistory();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// Pasting grades copied from MyIIT into any New Term field fills the whole form
function handleTermPaste(event){
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const text = event.clipboardData && event.clipboardData.getData('text/plain');
  if (!text || !window.MyiitPaste) return;
  const { termName, courses, moreTerms } = window.MyiitPaste.parseMyiitGrades(text);

  // MyIIT grades only exist on the MSU-IIT scale, so a paste switches the form to it
  const switchScale = () => {
    if (termScale.id === MYIIT_SCALE_ID) return '';
    setTermScale(MYIIT_SCALE_ID);
    return ` Switched to ${termScale.name}.`;
  };

  // One course line pasted into a row fills just that row
  const row = target.closest('#coursesBody tr');
  if (!termName && courses.length === 1 && row) {
    event.preventDefault();
    const note = switchScale();
    if (note) toast(note.trim());
    fillRow(row, courses[0]);
    markMissingUnits([row]);
    updateTermSummary();
    return;
  }
  // Otherwise only take over the paste when it really looks like a MyIIT copy
  if (!termName && courses.length < 2) return;
  if (!courses.length) return; // a bare header pasted into the term name stays a normal paste

  event.preventDefault();
  if (termName) $('termName').value = termName;
  $('coursesBody').innerHTML = '';
  const note = switchScale();
  const rows = courses.map(course => addRow(course));
  $('calcMsg').textContent = '';
  const missing = markMissingUnits(rows);
  if (missing.length) missing[0].focus();
  toast(`Pasted ${courses.length} course${courses.length === 1 ? '' : 's'} from MyIIT.` + note +
    (missing.length ? ' Fill in the units to compute your GPA.' : '') +
    (moreTerms ? ' Only the first term was used.' : ''));
}

function fillRow(row, course){
  row.querySelector('.course-code').value = course.code;
  row.querySelector('.course-name').value = course.name;
  if (course.units) row.querySelector('.course-units').value = course.units;
  if (course.grade) row.querySelector('.course-grade').value = course.grade;
}

// Units aren't in the MyIIT copy, so empty ones are flagged until the user fills them in
function markMissingUnits(rows){
  const missing = [];
  for (const row of rows) {
    const input = row.querySelector('.course-units');
    if (!input.value) {
      input.setAttribute('aria-invalid', 'true');
      missing.push(input);
    }
  }
  return missing;
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
    $('emptyNewTerm').addEventListener('click', () => goTo('term'));
    container.removeAttribute('aria-busy');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'history-grid';
  // The scale is only worth a chip when the history mixes grading systems
  const mixed = new Set(allHistory.map(r => scaleOf(r).id)).size > 1;
  for (const r of allHistory) {
    const scale = scaleOf(r);
    const units = r.courses.reduce((sum, c) => sum + (Number(c.units ?? c.credits) || 0), 0);
    const card = document.createElement('article');
    card.className = 'card term-card';
    card.innerHTML = `
      <div class="term-card-top">
        <div>
          <h3>${escapeHtml(r.termName)}</h3>
          <div class="date">${escapeHtml(new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}</div>
        </div>
        <span class="${gradeChipClass(r.gpa, scale)}">${escapeHtml(standing(r.gpa, scale) || 'No GPA')}</span>
      </div>
      <div class="gpa-pill">${formatGpa(r.gpa, scale)}</div>
      <div class="meta">
        <span class="chip">${r.courses.length} course${r.courses.length === 1 ? '' : 's'}</span>
        <span class="chip">${units} units</span>
        ${mixed ? `<span class="chip">${escapeHtml(scale.name)}</span>` : ''}
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" type="button" data-action="edit" aria-label="Edit ${escapeHtml(r.termName)}">${icons.edit} Edit</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="copy" aria-label="Copy ${escapeHtml(r.termName)} into a new term" title="Start a new term from this one">${icons.copy} Copy</button>
        <button class="btn btn-danger btn-sm" type="button" data-action="delete" aria-label="Delete ${escapeHtml(r.termName)}">${icons.trash} Delete</button>
      </div>`;
    card.querySelector('[data-action="edit"]').addEventListener('click', () => loadTermData(r, { edit: true }));
    card.querySelector('[data-action="copy"]').addEventListener('click', () => loadTermData(r));
    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (await confirmAction(`Delete “${r.termName}”?`, "This term will be removed from your history. This can't be undone.")) await deleteRecord(r.id);
    });
    grid.appendChild(card);
  }
  container.innerHTML = '';
  container.appendChild(grid);
  container.removeAttribute('aria-busy');
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

function cumulativeScale(){
  return Scales.getScale(cumulativeScaleId) || Scales.getScale(defaultScaleId);
}

// A CGPA only averages terms on one grading system, so the list shows that system's terms
function setCumulativeScale(id){
  cumulativeScaleId = (Scales.getScale(id) || Scales.getScale(defaultScaleId)).id;
  const scale = cumulativeScale();
  $('cumulativeScale').innerHTML = scaleOptionsHtml(scale.id);
  $('additionalSubjectGrade').innerHTML = gradeSelectHtml('', scale);
  const before = additionalSubjects.length;
  additionalSubjects = additionalSubjects.filter(s => Scales.normalizeGrade(scale, s.grade));
  if (additionalSubjects.length < before) toast(`Removed additional subjects with grades not on ${scale.name}`, 'error');
  displayAdditionalSubjects();
  updateCumulativeTermsList();
}

function updateCumulativeTermsList(){
  const list = $('termsCheckList');
  list.innerHTML = '';
  if (!allHistory.length) {
    list.innerHTML = '<p class="muted" style="font-size: 14px;">No saved terms yet. Create and save a term first.</p>';
    updateCumulativeGpa();
    return;
  }
  // First load: use the account default when it has terms, otherwise the newest term's scale
  if (!cumulativeScaleId) {
    const usesDefault = allHistory.some(r => scaleOf(r).id === defaultScaleId);
    setCumulativeScale(usesDefault ? defaultScaleId : scaleOf(allHistory[0]).id);
    return;
  }
  const scale = cumulativeScale();
  const terms = allHistory.filter(r => scaleOf(r).id === scale.id);
  if (!terms.length) {
    list.innerHTML = `<p class="muted" style="font-size: 14px;">No saved terms on ${escapeHtml(scale.name)}. Pick another grading system or add subjects.</p>`;
  }
  for (const record of terms) {
    const label = document.createElement('label');
    label.className = 'term-pick';
    label.innerHTML = `
      <input type="checkbox" class="cumulative-term" data-term-id="${record.id}" checked />
      <span class="check">${icons.check}</span>
      <span>
        <span class="term-pick-name">${escapeHtml(record.termName)}</span><br/>
        <span class="term-pick-meta">GPA ${formatGpa(record.gpa, scale)} · ${record.courses.length} courses</span>
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
  if (!Scales.normalizeGrade(cumulativeScale(), grade)) return toast(`Enter a grade on ${cumulativeScale().name}`, 'error');

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
  window.currentCGPA = null;
  updateSaveRow();
}

// The "Name this CGPA" row only belongs on the Saved terms tab, and only once there is a CGPA to save
function updateSaveRow(){
  const onTerms = !$('termsPane').classList.contains('hidden');
  $('cgpaSaveSection').classList.toggle('hidden', !(onTerms && window.currentCGPA));
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
      body: JSON.stringify({ scaleId: cumulativeScale().id, termIds, additionalSubjects })
    });
    if (requestId !== cumulativeRequestId) return;

    const scale = Scales.getScale(response.scaleId) || cumulativeScale();
    $('totalUnitsDisplay').textContent = response.totalUnits;
    $('gradePointsDisplay').textContent = response.totalGradePoints;
    $('cumulativeGpaDisplay').textContent = formatGpa(response.cumulativeGpa, scale);

    // The server recomputes the CGPA from these inputs when it is saved
    window.currentCGPA = response.cumulativeGpa > 0 ? { scaleId: scale.id, termIds, additionalSubjects: [...additionalSubjects] } : null;
    updateSaveRow();
  } catch (err) {
    if (requestId === cumulativeRequestId) resetCumulativeDisplay('Error');
  }
}

async function loadCgpaRecords(){
  const records = await api('/api/gpa/cgpa');
  const container = $('cgpaRecordsList');
  $('cgpaTab').textContent = records.length ? `Saved CGPA (${records.length})` : 'Saved CGPA';
  if (!records.length) {
    container.innerHTML = '<p class="muted" style="font-size: 14px;">No saved CGPA records yet.</p>';
    return;
  }
  const rows = records.map(r => `
    <tr data-id="${r.id}">
      <td><strong>${escapeHtml(r.recordName)}</strong><br/><span class="muted" style="font-size: 12px;">${escapeHtml(new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))} · ${r.totalUnits} units</span></td>
      <td class="num">${formatGpa(r.cumulativeGpa, scaleOf(r))}</td>
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
      if (!(await confirmAction(`Delete “${record.recordName}”?`, "This saved CGPA record will be removed. This can't be undone."))) return;
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
    toast(`Saved “${saved.recordName}” · CGPA ${formatGpa(saved.cumulativeGpa, scaleOf(saved))}`);
    $('cgpaRecordName').value = '';
    await loadCgpaRecords();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function showPane(paneId){
  document.querySelectorAll('.seg').forEach(seg => {
    const active = seg.dataset.pane === paneId;
    seg.classList.toggle('active', active);
    seg.setAttribute('aria-selected', String(active));
    seg.tabIndex = active ? 0 : -1;
    $(seg.dataset.pane).classList.toggle('hidden', !active);
  });
  $('paneHint').textContent = paneHints[paneId];
  updateSaveRow();
}

/* ---------- Settings ---------- */

async function changePassword(event){
  event.preventDefault();
  const currentPassword = $('currentPassword').value;
  const newPassword = $('newPassword').value;
  const confirmPassword = $('confirmPassword').value;
  const errorBox = $('passwordError');
  errorBox.textContent = '';

  let problem = '';
  if (!currentPassword) problem = 'Enter your current password';
  else if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) problem = `New password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters`;
  else if (newPassword !== confirmPassword) problem = "New passwords don't match";
  else if (newPassword === currentPassword) problem = 'New password must be different from the current one';
  if (problem) {
    errorBox.textContent = problem;
    return;
  }

  const btn = $('passwordSaveBtn');
  btn.disabled = true;
  try {
    await api('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    $('passwordForm').reset();
    toast('Password updated. Other devices were signed out.');
  } catch (err) {
    if (err.message !== 'Signed out') errorBox.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Init ---------- */

function initializeEventListeners(){
  window.addEventListener('hashchange', () => {
    showView(location.hash.slice(1));
    // Moves screen readers and keyboard focus to the new view, like a page load would
    $('main').focus({ preventScroll: true });
  });
  document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', () => showPane(seg.dataset.pane)));
  // Arrow keys move between the segmented tabs, as the ARIA tabs pattern expects
  document.querySelector('.segmented').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const segs = Array.from(document.querySelectorAll('.seg'));
    const i = segs.indexOf(document.activeElement);
    let next = e.key === 'Home' ? 0 : e.key === 'End' ? segs.length - 1 : i + (e.key === 'ArrowRight' ? 1 : -1);
    next = (next + segs.length) % segs.length;
    e.preventDefault();
    segs[next].focus();
    showPane(segs[next].dataset.pane);
  });
  $('accountBtn').addEventListener('click', () => goTo('settings'));
  $('passwordForm').addEventListener('submit', changePassword);
  $('additionalSubjectGrade').innerHTML = gradeSelectHtml('', cumulativeScale());
  $('cumulativeScale').innerHTML = scaleOptionsHtml(cumulativeScale().id);
  $('defaultScale').innerHTML = scaleOptionsHtml(defaultScaleId);
  $('historyScale').innerHTML = scaleOptionsHtml(defaultScaleId);
  renderScalePanel(Scales.getScale(defaultScaleId));
  $('termScale').addEventListener('change', changeTermScale);
  $('cumulativeScale').addEventListener('change', e => setCumulativeScale(e.target.value));
  $('historyScale').addEventListener('change', e => renderScalePanel(Scales.getScale(e.target.value)));
  $('defaultScale').addEventListener('change', saveDefaultScale);
  $('addSubjectBtn').addEventListener('click', addAdditionalSubject);
  $('additionalSubjectName').addEventListener('keydown', e => { if (e.key === 'Enter') addAdditionalSubject(); });
  $('addRowBtn').addEventListener('click', () => { addRow(); document.querySelector('#coursesBody tr:last-child .course-name').focus(); });
  $('clearBtn').addEventListener('click', resetTermForm);
  $('saveBtn').addEventListener('click', saveTerm);
  $('newTermSection').addEventListener('paste', handleTermPaste);
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
  showPane('termsPane');
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
