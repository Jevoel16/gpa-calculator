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
