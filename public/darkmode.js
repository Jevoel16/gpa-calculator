// Applies the saved theme before first paint and wires up the System/Light/Dark picker
(function () {
  const STORAGE_KEY = 'theme';
  const THEMES = [
    {
      id: 'system',
      label: 'System',
      icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    },
    {
      id: 'light',
      label: 'Light',
      icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    },
    { id: 'dark', label: 'Dark', icon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' },
  ];

  // Anything but light or dark (missing, old or tampered values) means the device decides
  function parseTheme(value) {
    return value === 'light' || value === 'dark' ? value : 'system';
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { THEMES, parseTheme };
    return;
  }

  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let choice = 'system';
  try {
    choice = parseTheme(localStorage.getItem(STORAGE_KEY));
  } catch {}

  const isDark = () => choice === 'dark' || (choice === 'system' && !!media && media.matches);

  function apply() {
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    // Keeps the browser UI (address bar, PWA title bar) in step with the page
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark() ? '#0b0d17' : '#4f46e5');
  }

  function save() {
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {}
  }

  apply();

  document.addEventListener('DOMContentLoaded', () => {
    apply(); // the theme-color meta may not have existed when this script first ran
    if (media) media.addEventListener('change', apply);

    for (const group of document.querySelectorAll('[data-theme-picker]')) {
      group.innerHTML = THEMES.map(
        t =>
          `<button type="button" data-theme-choice="${t.id}" aria-label="${t.label}" title="${t.label}">` +
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg></button>`
      ).join('');
    }

    const buttons = document.querySelectorAll('[data-theme-choice]');
    const render = () => buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice)));
    render();

    buttons.forEach(b =>
      b.addEventListener('click', () => {
        choice = parseTheme(b.dataset.themeChoice);
        apply();
        save();
        render();
      })
    );
  });
})();
