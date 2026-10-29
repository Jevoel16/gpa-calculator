const form = document.getElementById('setupForm');
const msg = document.getElementById('msg');
const setupBtn = document.getElementById('setupBtn');

// Only reachable right after a first OAuth sign-in; anyone else goes back to the login page
fetch('/api/auth/setup')
  .then(res => {
    if (res.status === 401) return window.location.replace('/login');
    return res.json().then(({ name, email }) => {
      document.getElementById('account').textContent = `Signed in as ${name} (${email})`;
    });
  })
  .catch(() => {});

function validate(username, password, confirm) {
  if (!/^[A-Za-z0-9_.]{3,30}$/.test(username)) {
    return 'Username must be 3–30 characters: letters, numbers, dots or underscores.';
  }
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password !== confirm) return 'Passwords do not match.';
  return '';
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const username = form.username.value.trim();
  const password = form.password.value;
  const error = validate(username, password, form.confirm.value);
  msg.textContent = error;
  if (error) return;

  setupBtn.disabled = true;
  try {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) return window.location.replace('/dashboard');
    if (res.status === 401) return window.location.replace('/login');
    const data = await res.json().catch(() => ({}));
    msg.textContent = data.error || 'Could not save. Please try again.';
  } catch {
    msg.textContent = 'Could not reach the server. Please try again.';
  } finally {
    setupBtn.disabled = false;
  }
});

document.getElementById('cancelBtn').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  window.location.replace('/login');
});
