# Security

- Only OAuth accounts with a **verified email** can sign in; the school domain is checked on the server when external emails are off.
- GitHub sign-in uses only the account's primary verified email; the GitHub token is used once and never stored.
- Passwords are hashed with **scrypt** and a per-user salt, compared in constant time. Sign-in and password changes are rate-limited: 10 failures per account guess and 50 per IP address every 15 minutes. Counts are stored in MySQL (`auth_attempts`, keys hashed), so every Vercel instance shares them.
- Visitors who start an OAuth sign-in get a 10-minute session, and an unfinished account setup lasts 30 minutes, so abandoned attempts expire quickly.
- Changing a password removes every other session of that account and rotates the current session ID.
- OAuth `state` protects against CSRF; the session ID is regenerated after sign-in.
- Session cookies are `httpOnly`, `sameSite=lax` and `secure` in production.
- User text is HTML-escaped; a strict CSP (`'self'` only, no inline scripts, no third-party hosts), `nosniff`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, HSTS and Referrer-Policy are sent by Express and `vercel.json`.
- API responses are `Cache-Control: no-store`, so per-user data is never stored by browsers or the CDN.
- Cross-origin state-changing requests are rejected; bodies are capped at 100 KB; inputs are validated on the server; every GPA query is scoped to the signed-in user.
- Only `public/` is served statically; `.env`, sources and `node_modules` return `404`.
- Vercel Web Analytics is cookie-free and served from the app's own domain, so the CSP stays `'self'` only.

To report a vulnerability, open an issue or contact the author through [GitHub](https://github.com/Jevoel16).
