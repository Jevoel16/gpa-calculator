// Applies the theme before paint; with no saved choice it follows the system live
(function () {
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch {}

  const systemTheme = () => (media && media.matches ? 'dark' : 'light');
  const currentTheme = () => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  function apply(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    // Keeps the browser UI (address bar, PWA title bar) in step with the page
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0d17' : '#4f46e5');
  }

  apply(saved || systemTheme());

  const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function render(btn) {
    const dark = currentTheme() === 'dark';
    btn.innerHTML = dark ? sun : moon;
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = btn.getAttribute('aria-label');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggleBtn');
    apply(currentTheme()); // the theme-color meta may not have existed when this script first ran
    if (!btn) return;
    render(btn);

    btn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      apply(next);
      saved = next === systemTheme() ? null : next;
      try {
        if (saved) localStorage.setItem('theme', saved);
        else localStorage.removeItem('theme');
      } catch {}
      render(btn);
    });

    if (media) {
      media.addEventListener('change', () => {
        if (saved) return;
        apply(systemTheme());
        render(btn);
      });
    }
  });
})();
