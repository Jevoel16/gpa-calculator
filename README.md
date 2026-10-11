<div align="center">

# 🎓 GPA Calculator

**A modern web app for computing, saving, and tracking your term GPA and cumulative GPA.**

Sign in with Google, enter your courses, and watch your GPA update as you type.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8%2B-4479A1?logo=mysql&logoColor=white)
![Google OAuth](https://img.shields.io/badge/Auth-Google%20OAuth%202.0-4285F4?logo=google&logoColor=white)

![Dashboard](docs/screenshots/new-term.png)

</div>

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Grading Scale](#grading-scale)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Upgrading an Existing Database](#upgrading-an-existing-database)
- [Security Notes](#security-notes)

---

## Features

- **Google sign-in for everyone.** School accounts (for example `@g.msuiit.edu.ph`) and personal Google accounts (Gmail and others) can both sign in. Set `ALLOW_EXTERNAL_EMAILS=false` to restrict sign-in to school accounts only.
- **Live term GPA.** GPA, total units and course count update as you type.
- **Cumulative GPA (CGPA).** Combine any saved terms, add extra subjects that aren't part of a term, and save the result as a named CGPA record.
- **History.** Saved terms appear as cards showing GPA, an academic standing badge, course count and units. You can open, edit or delete any of them.
- **Light and dark themes.** The app follows your system theme by default and remembers your choice.
- **Responsive.** The layout adapts from desktop down to phone screens.
- **Precise.** GPA values are computed and stored to 5 decimal places.
- **Persistent sessions.** Sessions are stored in MySQL, so you stay signed in after the server restarts.

## Screenshots

| Sign in | Dark mode |
| :---: | :---: |
| ![Sign in](docs/screenshots/login.png) | ![Dark mode](docs/screenshots/new-term-dark.png) |

| Cumulative GPA | History |
| :---: | :---: |
| ![Cumulative GPA](docs/screenshots/cumulative.png) | ![History](docs/screenshots/history.png) |

<div align="center">

**Mobile**

<img src="docs/screenshots/mobile.png" alt="Mobile layout" width="720" />

</div>

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js, Express |
| Database | MySQL 8 (`mysql2`) |
| Auth | Google OAuth 2.0 (`google-auth-library`), `express-session` |
| Sessions | `express-mysql-session` |
| Frontend | Vanilla HTML, CSS and JavaScript, with the Inter font |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- [MySQL](https://dev.mysql.com/downloads/) 8 or newer
- A Google Cloud project with OAuth credentials

### 1. Create the database

Run the schema in the MySQL client (MySQL Workbench or the `mysql` CLI):

```sql
SOURCE db/schema.sql;
```

### 2. Create Google OAuth credentials

1. Open the [Google Cloud Console](https://console.cloud.google.com/), create a project, and go to **APIs & Services → OAuth consent screen**.
2. Choose **External** so that personal Google accounts can sign in. Then publish the app. The `openid email profile` scopes don't need verification.
   > Choose **Internal** only if the project belongs to your school's Google Workspace and you want school accounts only.
3. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
4. Add the authorized redirect URI `http://localhost:3000/api/auth/google/callback`, plus your production URL when you deploy.
5. Copy the client ID and client secret into your `.env` file.

### 3. Install and configure

```bash
copy .env.example .env
npm install
```

Fill in the values in `.env` (see [Configuration](#configuration)).

### 4. Run

```bash
npm run dev
```

Then open **http://localhost:3000**.

| Script | Description |
| --- | --- |
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload (nodemon) |

## Configuration

All settings are read from `.env`.

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `DB_HOST` | | `localhost` | MySQL host |
| `DB_PORT` | | `3306` | MySQL port |
| `DB_USER` | | `root` | MySQL user |
| `DB_PASSWORD` | | *(empty)* | MySQL password |
| `DB_NAME` | | `gpa_app` | Database name |
| `SESSION_SECRET` | ✅ | | Long random string used to sign session cookies |
| `PORT` | | `3000` | HTTP port |
| `GOOGLE_CLIENT_ID` | ✅ | | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | ✅ | | e.g. `http://localhost:3000/api/auth/google/callback` |
| `ALLOWED_EMAIL_DOMAINS` | | *(empty)* | Comma-separated school domains, e.g. `g.msuiit.edu.ph`. Shown on the login page. When external emails are disabled, only these domains can sign in. |
| `ALLOW_EXTERNAL_EMAILS` | | `true` | `true`: any verified Google account can sign in. `false`: only `ALLOWED_EMAIL_DOMAINS` can sign in. |
| `NODE_ENV` | | | Set to `production` to enable secure cookies and trust the first proxy |

> If `ALLOWED_EMAIL_DOMAINS` is empty, external accounts are always allowed.

## Grading Scale

| Grade | Meaning | Counted in GPA |
| --- | --- | :---: |
| `1.00` | Excellent | ✅ |
| `1.25` – `1.50` | Very good | ✅ |
| `1.75` – `2.00` | Good | ✅ |
| `2.25` – `2.50` | Satisfactory | ✅ |
| `2.75` – `3.00` | Passing | ✅ |
| `5.00` | Failed | ✅ |
| `INC` | Incomplete | ❌ |
| `DROP` | Dropped | ❌ |

GPA is the unit-weighted average: **Σ(grade × units) / Σ units**. A lower GPA is better. `INC` and `DROP` are saved with the term but left out of the calculation.

## API Reference

Every `/api/gpa/*` endpoint requires an authenticated session.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/auth/google` | Start Google sign-in |
| `GET` | `/api/auth/google/callback` | OAuth callback |
| `GET` | `/api/auth/config` | Sign-in policy (`allowedDomains`, `allowExternal`) |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/gpa/history` | List saved terms |
| `POST` | `/api/gpa/save` | Save a term `{ termName, courses[] }` |
| `PUT` | `/api/gpa/:id` | Update a term |
| `DELETE` | `/api/gpa/:id` | Delete a term |
| `POST` | `/api/gpa/calculate-cumulative` | Compute CGPA `{ termIds[], additionalSubjects[] }` |
| `POST` | `/api/gpa/save-cgpa` | Save a CGPA record |
| `DELETE` | `/api/gpa/cgpa/:id` | Delete a CGPA record |
| `GET` | `/api/health` | Health check |

## Project Structure

```
gpa-calculator/
├── db/
│   ├── db.js              # MySQL connection pool
│   └── schema.sql         # Database schema
├── docs/screenshots/      # README images
├── middleware/
│   └── auth.js            # Session guard for protected routes
├── public/
│   ├── login.html         # Sign-in page
│   ├── dashboard.html     # Main app
│   ├── dashboard.js       # Dashboard logic
│   ├── darkmode.js        # Theme handling
│   └── style.css          # Design system and styles
├── routes/
│   ├── auth.js            # Google OAuth and session routes
│   └── gpa.js             # GPA and CGPA routes
├── server.js              # Express app entry point
└── .env.example           # Environment template
```

## Upgrading an Existing Database

**5-decimal precision:**

```sql
ALTER TABLE gpa_records MODIFY COLUMN gpa DECIMAL(6,5) NOT NULL;
ALTER TABLE cgpa_records MODIFY COLUMN cgpa DECIMAL(6,5) NOT NULL;
```

**Google sign-in:**

```sql
ALTER TABLE users ADD COLUMN google_sub VARCHAR(64) NULL UNIQUE AFTER email;
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(191) NULL;
```

If an existing user signs in with a Google account that uses the same email, the two are linked automatically on first sign-in and the user keeps their GPA history.

## Security Notes

- Only Google accounts with a **verified email** can sign in. When external emails are disabled, the school domain is checked on the server (the `hd` claim plus the email suffix), not just through the Google URL hint.
- The OAuth `state` parameter protects the sign-in flow against CSRF, and the session ID is regenerated after login.
- Session cookies are `httpOnly` and `sameSite=lax`, and they are `secure` in production.
- User-entered text is HTML-escaped before it is rendered.
- Never commit `.env` or downloaded `client_secret_*.json` files.
