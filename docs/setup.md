# Setup guide

Full local setup for GPA Calculator. The short version is in the [README](../README.md#getting-started); deploying to Vercel is in [DEPLOY.md](../DEPLOY.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [MySQL](https://dev.mysql.com/downloads/) 8 or newer, or a hosted MySQL-compatible database (TiDB Cloud, Aiven, Railway)
- A Google Cloud project with OAuth credentials
- A GitHub OAuth App

## 1. Install dependencies and create `.env`

```bash
npm install
```

```bash
copy .env.example .env
```

Fill in `.env`. Every variable is described in the [README](../README.md#configuration).

## 2. Create the database

```bash
npm run db:setup
```

This creates (or upgrades) the tables in the database from `.env`. You can also run `db/schema.sql` yourself in the MySQL client.

## 3. Create Google OAuth credentials

1. Open the [Google Cloud Console](https://console.cloud.google.com/), create a project and go to **APIs & Services → OAuth consent screen**.
2. Choose **External** so personal Google accounts can sign in, then publish the app. The `openid email profile` scopes need no verification.
3. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
4. Add the redirect URI `http://localhost:3000/api/auth/google/callback`, plus your production URL when you deploy.
5. Copy the client ID and secret into `.env`.

## 4. Create a GitHub OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set the homepage URL to `http://localhost:3000` and the callback URL to `http://localhost:3000/api/auth/github/callback`.
3. Register the app and generate a client secret.
4. Copy the client ID and secret into `.env`.

## 5. Run

```bash
npm run dev
```

Open **http://localhost:3000**.

## Upgrading an existing database

`npm run db:setup` adds missing columns automatically. To do it by hand:

```sql
-- 5-decimal precision
ALTER TABLE gpa_records MODIFY COLUMN gpa DECIMAL(6,5) NOT NULL;
ALTER TABLE cgpa_records MODIFY COLUMN cgpa DECIMAL(6,5) NOT NULL;
-- Google sign-in
ALTER TABLE users ADD COLUMN google_sub VARCHAR(64) NULL UNIQUE AFTER email;
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(191) NULL;
-- GitHub sign-in
ALTER TABLE users ADD COLUMN github_id BIGINT UNSIGNED NULL UNIQUE AFTER google_sub;
-- Username and password sign-in
ALTER TABLE users ADD COLUMN username VARCHAR(30) NULL AFTER email;
ALTER TABLE users ADD UNIQUE INDEX username (username);
-- Grading systems (percentage averages need DECIMAL(8,5))
ALTER TABLE users ADD COLUMN default_scale VARCHAR(40) NOT NULL DEFAULT 'msu-iit' AFTER password_hash;
ALTER TABLE gpa_records ADD COLUMN scale_id VARCHAR(40) NOT NULL DEFAULT 'msu-iit' AFTER gpa;
ALTER TABLE cgpa_records ADD COLUMN scale_id VARCHAR(40) NOT NULL DEFAULT 'msu-iit' AFTER cgpa;
ALTER TABLE gpa_records MODIFY COLUMN gpa DECIMAL(8,5) NOT NULL;
ALTER TABLE cgpa_records MODIFY COLUMN cgpa DECIMAL(8,5) NOT NULL;
```

Existing terms and CGPA records keep the MSU-IIT scale they were made with.

Existing users who sign in with a provider that has the same email are linked automatically and keep their history. Existing OAuth users are asked to choose a username and password on their next sign-in.

## Importing terms from an old database dump

`scripts/import-terms.js` copies one user's terms from an old `mysqldump` of `gpa_records` into an existing account. GPAs are recomputed and already-imported terms are skipped. Preview with `--dry-run`:

```bash
npm run db:import -- path/to/gpa_app_gpa_records.sql --from-user 3 --to-email you@g.msuiit.edu.ph --dry-run
```

## Common problems

| Problem | Fix |
| --- | --- |
| `Missing required environment variables` on start | Fill in `SESSION_SECRET` and the Google/GitHub client IDs and secrets in `.env`. |
| OAuth redirects to `/login?error=oauth` | The callback URL in Google/GitHub must match `APP_URL` exactly. |
| `/login?error=domain` | `ALLOW_EXTERNAL_EMAILS=false` and the account is not in `ALLOWED_EMAIL_DOMAINS`. |
| Database connection errors | Check `DATABASE_URL` or `DB_*`; hosted databases need `DB_SSL=true`. `GET /api/health` shows whether the database is reachable. |
| "Too many failed attempts" | Wait 15 minutes; the limit is per account guess and per IP. To clear it early, delete the rows in the `auth_attempts` table. |
| Sitemap shows `localhost` | Set `APP_URL` to your public domain in production. |
| `/_vercel/insights/script.js` 404 in the console | Expected when running locally; the script only exists on Vercel. On Vercel, enable **Analytics** in the project dashboard and redeploy. |
