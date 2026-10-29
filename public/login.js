const msg = document.getElementById('msg');
const policy = document.getElementById('policy');
let domainText = '@g.msuiit.edu.ph';

function showError() {
  const error = new URLSearchParams(window.location.search).get('error');
  if (error === 'domain') {
    msg.textContent = 'This account is not allowed. Please sign in with your school account (' + domainText + ').';
  } else if (error === 'email') {
    msg.textContent = 'Your GitHub account has no verified primary email. Verify one in your GitHub email settings and try again.';
  } else if (error === 'oauth') {
    msg.textContent = 'Sign-in failed. Please try again.';
  }
}

function renderPolicy(allowedDomains, allowExternal) {
  policy.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = domainText;
  if (allowExternal && allowedDomains.length) {
    policy.append('School accounts (', strong, ') and personal accounts such as Gmail or GitHub are welcome.');
  } else if (allowExternal) {
    policy.append('Any Google or GitHub account can sign in, including Gmail and school accounts.');
  } else {
    policy.append('Only ', strong, ' school accounts can sign in.');
  }
}

const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const identifier = loginForm.identifier.value.trim();
  const password = loginForm.password.value;
  if (!identifier || !password) {
    msg.textContent = 'Enter your username or email and your password.';
    return;
  }

  msg.textContent = '';
  loginBtn.disabled = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    if (res.ok) return window.location.replace('/dashboard');
    const data = await res.json().catch(() => ({}));
    msg.textContent = data.error || 'Sign-in failed. Please try again.';
    loginForm.password.value = '';
    loginForm.password.focus();
  } catch {
    msg.textContent = 'Could not reach the server. Please try again.';
  } finally {
    loginBtn.disabled = false;
  }
});

// Already signed in: skip the login page
fetch('/api/auth/me')
  .then(res => { if (res.ok && !new URLSearchParams(window.location.search).has('error')) window.location.replace('/dashboard'); })
  .catch(() => {});

fetch('/api/auth/config')
  .then(res => res.json())
  .then(({ allowedDomains = [], allowExternal = true }) => {
    if (allowedDomains.length) domainText = allowedDomains.map(d => '@' + d).join(', ');
    renderPolicy(allowedDomains, allowExternal);
  })
  .catch(() => {})
  .finally(showError);
