# Development

## Project structure

```
gpa-calculator/
├── .github/workflows/
│   └── ci.yml             # Runs the tests and npm audit on the .nvmrc Node version
├── db/
│   ├── db.js              # MySQL connection pool
│   └── schema.sql         # Database schema
├── docs/                  # Guides like this one; images/ holds the README screenshots
├── lib/
│   ├── scales.js          # Resolves grading-system ids for routes (hook for custom scales)
│   ├── app-url.js         # Public site address (APP_URL) shared by OAuth, robots.txt and sitemap.xml
│   ├── password.js        # scrypt password hashing
│   └── rate-limit.js      # Failed-attempt counter stored in MySQL (memory fallback)
├── middleware/
│   └── auth.js            # Session guard for protected routes
├── public/
│   ├── login.html         # Sign-in page (the only indexed page)
│   ├── login.js           # Sign-in form and OAuth error messages
│   ├── setup.html         # Choose a username and password after the first OAuth sign-in
│   ├── setup.js           # Setup form logic
│   ├── 404.html           # Not-found page
│   ├── dashboard.html     # Main app: header tabs, New Term, Cumulative, History, Settings
│   ├── dashboard.js       # Dashboard logic
│   ├── grading-scales.js  # Grading systems as data + GPA math, shared by the server and dashboard
│   ├── myiit-paste.js     # Parses grades copied from MyIIT (also used by the tests)
│   ├── darkmode.js        # Theme handling (follows the system until you choose)
│   ├── fonts/             # Self-hosted Inter variable font and its OFL license
│   ├── icons/             # App icons (192, 512, maskable, Apple touch icon)
│   ├── favicon.ico        # Legacy favicon for crawlers and old browsers
│   ├── logo.svg           # Vector logo and modern favicon
│   ├── manifest.webmanifest # Install-to-home-screen metadata
│   ├── og-image.png       # 1200×630 social share image
│   ├── llms.txt           # Plain-language summary for AI crawlers
│   └── style.css          # Design system, no-scroll desktop layout, mobile bottom bar
├── routes/
│   ├── auth.js            # OAuth, password sign-in, setup, change password, session routes
│   └── gpa.js             # GPA and CGPA routes
├── scripts/
│   ├── setup-db.js        # Creates/upgrades the tables (npm run db:setup)
│   └── import-terms.js    # Copies terms from an old mysqldump (npm run db:import)
├── test/                  # Automated tests (npm test), no database needed
├── server.js              # Express app, security headers, robots.txt and sitemap.xml
├── LICENSE                # Sprucetrap Source-Available License 1.0
├── vercel.json            # Clean URLs and security headers on Vercel
└── .env.example           # Environment template
```

## Automated tests

```bash
npm test
```

The tests use Node's built-in test runner and need **no database** (they point at an address that refuses connections and keep sessions in memory). GitHub Actions ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs them, plus `npm audit`, on the Node version in `.nvmrc` for every push and pull request to `main`; a newer push cancels the older run.

| File | Covers |
| --- | --- |
| `test/grading-scales.test.js` | Scale lookup, grade normalising (`1` → `1.00`, `drp` → `DROP`), weighted GPA, credit-only grades, standings, every preset (well-formed data, points, percentage range, conditional and NP grades) and which grades carry over when a term switches systems |
| `test/scales-api.test.js` | Routes with a stubbed database: account-default scale, saving on a percentage preset, an all-failing CGPA on a 4.0 scale, unknown scale ids, grades off the scale, edits keeping their scale, refusing mixed-scale CGPAs, the preferences endpoint |
| `test/gpa.test.js` | Weighted GPA, `P` / `INC` / `DROP` rules, input validation limits, optional course code |
| `test/myiit-paste.test.js` | Parsing MyIIT copies: term name, courses, grade normalising, spaced copies, ignoring ordinary text |
| `test/password.test.js` | scrypt hashing, salts, verification, rejecting non-scrypt values |
| `test/rate-limit.test.js` | Failure counting, windows, clearing, memory fallback |
| `test/api.test.js` | 401 on private routes, `no-store`, security headers, cross-origin block, bad JSON / missing / too-large bodies, OAuth `state` and short session, robots/sitemap, redirects, 404s, static assets |

## Manual checks

Run these with `npm run dev` before each commit that changes the UI:

1. **Sign-in:** Google, GitHub, and username/password all reach the dashboard; a wrong password shows one generic error; an empty submit focuses the empty field.
2. **Desktop layout (1440×900):** every tab fits the window with no page scrollbar; add 15+ courses and the course list scrolls inside its panel.
3. **New Term:** the GPA updates while typing; **Save record** adds a History card. Pasting a MyIIT copy fills the term name and courses and highlights the units.
4. **Cumulative:** ticking terms updates the totals; extra subjects are included; the name-and-save row shows only on **Saved terms**; a named CGPA saves, appears under **Saved CGPA** and can be deleted.
5. **History:** the grading scale fills the height on the left; **Edit**, **Copy** and **Delete** work; Delete asks first and Escape cancels.
6. **Navigation:** switching sections changes the URL; browser back/forward moves between sections.
7. **Settings:** your username and email show; a wrong current password, a mismatched confirmation and a short password are rejected; a valid change shows a success toast, the new password signs in, and another browser's session is signed out.
8. **Phone (375 px):** the bottom tab bar reaches every section, nothing hides behind it, no horizontal scroll.
9. **Themes:** light and dark both look right, including scrollbars and dropdowns.
10. **Keyboard:** Tab from the top shows "Skip to content"; every control has a visible focus ring.
11. **SEO files:** `/robots.txt`, `/sitemap.xml` and `/llms.txt` load and use your `APP_URL`.

## Code notes

Background that used to live in long code comments.

- **Grading scales** (`public/grading-scales.js`): the systems are plain data shared by the dashboard (browser global) and the server (CommonJS), so both compute the same GPA. A shipped scale's grade → points mapping must never change, because saved terms are recomputed from it; fix a scale by shipping a new id. When a term switches scales, a numeric grade carries over only between scales of the same kind ("1.50" on MSU-IIT is not 1.5% or a 4.0-scale 1.5), and marks such as `P` or `INC` carry over only if the new scale has them.
- **Scale lookup** (`lib/scales.js`): every route resolves scale ids here, so user-defined scales (a future `grading_scales` table with ids like `custom:12`) can plug in in one place.
- **MyIIT paste** (`public/myiit-paste.js`): parses a block like `SY: 2023-2024 SEM: 1 (BSIT:…)` followed by `CODE<TAB>Title<TAB>Grade` lines. Shared by the dashboard and the tests.
- **Rate limiting** (`lib/rate-limit.js`): failure counts live in MySQL (`auth_attempts`) so every serverless instance shares them. If the database is unreachable it falls back to an in-memory map, so a database hiccup never disables the guard.
- **Sessions** (`server.js`): the session store reuses the app's MySQL pool so a serverless instance doesn't open a second set of connections; the tests run without a database and keep sessions in memory.
- **Theme** (`public/darkmode.js`): runs in `<head>` to apply the saved or system theme before the first paint. With no saved choice the page follows the system theme live; picking the system's own theme clears the saved choice.
- **Schema upgrades** (`scripts/setup-db.js`): `CREATE TABLE IF NOT EXISTS` leaves old tables alone, so later columns are added with `ALTER TABLE`. The column and its unique index are added separately because TiDB can't do both in one statement.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `style:`, `perf:`, `test:`, `ci:`) with an imperative subject of 72 characters or less, a blank line, then one bullet per change. Bump the version in every commit (breaking → major, `feat` → minor, anything else → patch), end the subject with it (e.g. `feat: add CSV export (v1.4.0)`), and keep `package.json`, `package-lock.json` and the README version badge in sync. Never commit `.env` or downloaded `client_secret_*.json` files.
