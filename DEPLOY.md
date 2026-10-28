# Deploying to Vercel with a custom domain

Vercel runs the Express app as a serverless function and serves `public/` from its CDN. It does **not** host a database, so the MySQL database has to move online first. Your local MySQL won't work because Vercel can't reach your PC.

## 1. Create a free online MySQL database

You don't need to switch to MongoDB. These hosts are MySQL-compatible, so the code works unchanged.

| Provider | Free tier | Notes |
| --- | --- | --- |
| **TiDB Cloud Starter** (recommended) | 5 GB, no card | MySQL-compatible, has a Singapore region, TLS required |
| Aiven for MySQL | 1 GB | Real MySQL 8, TLS required, gives a CA certificate |

**TiDB Cloud steps**

1. Sign up at <https://tidbcloud.com> and create a **Starter** cluster. Pick the region closest to your users (for example AWS Singapore).
2. Click **Connect**, choose **General / mysql CLI**, and generate a password.
3. Copy the host, port (`4000`), user (it looks like `xxxx.root`) and password.
4. Build the connection URL:
   ```
   mysql://USER:PASSWORD@HOST:4000/gpa_app
   ```
   URL-encode any special characters in the password (for example `@` becomes `%40`).
5. Create the database once in the TiDB **SQL Editor**: `CREATE DATABASE gpa_app;`

## 2. Create the tables

From your PC, temporarily point `.env` at the online database and run the setup script:

```
DATABASE_URL=mysql://USER:PASSWORD@HOST:4000/gpa_app
DB_SSL=true
```

```bash
npm run db:setup
```

It prints `Database is ready.` Afterwards, switch `.env` back to your local database.

> Optional: to move your existing local data, export it with `mysqldump --no-create-info gpa_app users gpa_records cgpa_records > data.sql` and import `data.sql` in the TiDB SQL editor or with the `mysql` CLI.

## 3. Push the code to GitHub

```bash
git add -A
git commit -m "Prepare for Vercel deployment"
git push
```

`.env` and `client_secret*.json` are gitignored and never uploaded.

## 4. Import the project on Vercel

1. Go to <https://vercel.com/new> and import the GitHub repository.
2. Vercel detects **Express** from `server.js`. Leave the build settings at their defaults.
3. Under **Environment Variables**, add the following:

| Name | Value |
| --- | --- |
| `APP_URL` | `https://your-domain.com`. Use the `xxx.vercel.app` URL until the domain is set up. |
| `SESSION_SECRET` | Output of `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DATABASE_URL` | The URL from step 1 |
| `DB_SSL` | `true` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | From your **production** GitHub OAuth App (see step 6) |
| `ALLOWED_EMAIL_DOMAINS` | `g.msuiit.edu.ph` |
| `ALLOW_EXTERNAL_EMAILS` | `true` |

Do **not** add `GOOGLE_REDIRECT_URI`, `GITHUB_REDIRECT_URI` or the `DB_HOST`-style variables on Vercel. The callback URLs are built from `APP_URL`.

4. Click **Deploy**, then open `https://<project>.vercel.app/api/health`. It should show `{"ok":true,"db":true}`.
5. Under **Settings → Functions → Function Region**, choose the region of your database (for example `sin1` for Singapore). This makes every request much faster.

## 5. Add your domain

1. Buy a domain from any registrar (Namecheap, Porkbun, Cloudflare, or Vercel itself).
2. In Vercel, go to **Project → Settings → Domains → Add** and enter `your-domain.com`. Also add `www.your-domain.com` and let it redirect to the main domain.
3. Vercel shows the DNS records to create at your registrar. Usually these are:
   - apex `your-domain.com`: an **A** record pointing to the IP Vercel shows (currently `76.76.21.21`)
   - `www`: a **CNAME** pointing to the value Vercel shows (for example `cname.vercel-dns.com`)

   Alternatively, switch the domain's nameservers to Vercel's.
4. Wait for the domain to show **Valid Configuration**. HTTPS is issued automatically.
5. Set `APP_URL` to `https://your-domain.com` in Vercel's environment variables, then **redeploy**. Environment variable changes only apply to new deployments.

## 6. Update the OAuth providers

Sign-in fails with `redirect_uri_mismatch` until the providers know the new address.

**Google Cloud Console → APIs & Services → Credentials → your OAuth client**
- Authorized JavaScript origins: add `https://your-domain.com`
- Authorized redirect URIs: add `https://your-domain.com/api/auth/google/callback`
- Keep the `http://localhost:3000/...` entries so local development keeps working.
- On the **OAuth consent screen**, make sure the app is **published** (In production), and add the domain under Authorized domains.

**GitHub → Settings → Developer settings → OAuth Apps**
A GitHub OAuth App only allows one callback URL, so create a **second app** for production:
- Homepage URL: `https://your-domain.com`
- Authorization callback URL: `https://your-domain.com/api/auth/github/callback`
- Put this app's client ID and secret in Vercel. Keep the original app in your local `.env`.

## 7. Check the deployment

- `https://your-domain.com/api/health` shows `{"ok":true,"db":true}`
- `https://your-domain.com` redirects to the sign-in page
- Signing in with Google and with GitHub reaches the dashboard
- Saving a term, refreshing, and seeing it in History works

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `500` / `FUNCTION_INVOCATION_FAILED` on every request | A required environment variable is missing. Check **Deployments → Logs**. |
| `/api/health` returns `"db":false` | Wrong `DATABASE_URL`, `DB_SSL` not `true`, or the database doesn't exist yet |
| `redirect_uri_mismatch` (Google) or "redirect_uri is not associated" (GitHub) | Step 6, or `APP_URL` doesn't match the domain you're visiting |
| Sign-in loops back to the login page | `APP_URL` uses a different domain than the one in the browser (for example `www` vs. apex). Cookies are per domain. |
| Slow responses | The function region is far from the database region (step 4.5) |
