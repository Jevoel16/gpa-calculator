# Security

How the app covers each item of the security checklist. Numbers match the checklist, so a gap is easy to spot.

| # | Item | How |
| --- | --- | --- |
| 1 | Admin routes | N/A: there are no admin routes or roles. |
| 2 | Server-side access control | `middleware/auth.js` guards every private route; the UI hides nothing the server allows. |
| 3 | Per-user data scoping | Every GPA query has `user_id = ?` with the signed-in user's id (`routes/gpa.js`). |
| 4 | Verified email on sign-up | Accounts are created only from Google or GitHub sign-ins with a verified email (GitHub: the primary verified one). There is no email/password sign-up. |
| 5 | Hashed passwords | scrypt with a per-user salt, compared in constant time (`lib/password.js`). |
| 6 | Cookies, not localStorage | Session cookie `gpa.sid` is `httpOnly`, `sameSite=lax` and `secure` in production. Nothing secret is in `localStorage` (only the theme). |
| 7 | Secrets on the server only | OAuth secrets and the session secret are read in `routes/auth.js` and `server.js`; the client gets only `/api/auth/config` (allowed domains). |
| 8 | `.env` out of git | `.gitignore` covers `.env` and `.env*.local`; `.env.example` holds placeholders. |
| 9 | No secrets or personal data in logs | `lib/log-error.js` logs the route and, for database errors, only the error code, because mysql2 messages carry the SQL values. |
| 10 | Parameterized SQL | Every query uses `?` placeholders; the one interpolated column name comes from a fixed pair. |
| 11 | Server-side validation | Names, units, grades, scale ids, usernames and passwords are checked in the routes before any query. |
| 12 | XSS | User text is escaped before it reaches `innerHTML`; CSP is `'self'` only with no inline scripts. `style-src` still allows `'unsafe-inline'`. |
| 13 | Uploads | N/A: there are no uploads. |
| 14 | Webhook signatures | N/A: there are no webhooks. |
| 15 | Rate limits | Per 15 minutes: 10 failed sign-ins per account from one IP, 30 per account from any IP, 50 per IP; 10 failed password changes per account; 20 "username taken" answers per setup; 30 OAuth starts per IP. Counts live in MySQL (`auth_attempts`, keys hashed), so every Vercel instance shares them. |
| 16 | CORS | No CORS headers are sent, so the API answers only same-origin pages. |
| 17 | No stack traces in production | The error handler answers `{ "error": "Server error" }`. |
| 18 | Patched dependencies | CI runs `npm audit --omit=dev --audit-level=moderate`. |
| 19 | Security scan before release | Run `/security-review` before each release. |
| 20 | CSRF | `middleware/same-origin.js` refuses API writes whose `Origin` (or, without one, `Referer`) isn't this site, and writes with neither. OAuth uses a `state` value. |
| 21 | Security headers | `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, sent by Express and `vercel.json`. |
| 22 | Sessions | The id is regenerated on sign-in, setup and password change; logout destroys the session; sessions expire after 7 idle days (10 minutes for an OAuth hand-off, 30 for an unfinished setup); a password change ends every other session of the account, including ones mid-setup. There are no reset tokens. |
| 23 | No account enumeration | Sign-in gives one message for every failure and checks a dummy hash so timing matches. Setup must say when a username is taken, since usernames are unique; only someone signed in with a verified OAuth account sees it, and it is limited to 20 per window. |
| 24 | Access-control tests | `test/access-control.test.js` proves one user can't list, edit, delete or pull another user's terms and CGPAs, and that signed-out requests get 401. |
| 25 | Limits | Bodies capped at 100 KB, 100 courses per term, 200 terms per cumulative GPA, SELECTs stopped after 10 s (`max_execution_time`), 10 s connect timeout, and the history and CGPA lists return at most 100 rows a page. |
| 26 | Redirects and URL fetches | The `.html` redirect only matches `/name.html`; the server fetches only fixed Google and GitHub URLs, and OAuth redirect URIs come from config. |
| 27 | Secret scanning | CI runs gitleaks over the full history. A secret that was ever committed gets rotated, not just deleted. |
| 28 | Least privilege, minimal data | The app's MySQL user needs only `SELECT, INSERT, UPDATE, DELETE, CREATE` ([setup](setup.md#2-create-the-database)). Stored per user: name, email, username, password hash, OAuth ids and grades. |
| 29 | This file | Linked from the README. |
| 30 | Modern Web Guidance security guides | Checked before building sign-in or rendering user HTML. The app renders no user HTML: user text goes through `escapeHtml` or `textContent`. Passkeys are not offered yet. |

API responses are `Cache-Control: no-store`, so per-user data is never stored by browsers or the CDN. Only `public/` is served statically; `.env`, sources and `node_modules` return 404. Vercel Web Analytics is cookie-free and served from the app's own domain.

To report a vulnerability, see [SECURITY.md](../SECURITY.md).
