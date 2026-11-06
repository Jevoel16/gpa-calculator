# API reference

Every `/api/gpa/*` endpoint requires a signed-in session. After a first OAuth sign-in the session is *pending* (redirected to `/setup`) until a username and password are chosen.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/auth/google` | Start Google sign-in |
| `GET` | `/api/auth/google/callback` | Google OAuth callback |
| `GET` | `/api/auth/github` | Start GitHub sign-in |
| `GET` | `/api/auth/github/callback` | GitHub OAuth callback |
| `POST` | `/api/auth/login` | Sign in `{ identifier, password }` (username or email) |
| `GET` | `/api/auth/setup` | Name and email of the account waiting for setup |
| `POST` | `/api/auth/setup` | Finish setup `{ username, password }` |
| `POST` | `/api/auth/password` | Change password `{ currentPassword, newPassword }`; signs out other sessions |
| `GET` | `/api/auth/config` | Sign-in policy (`allowedDomains`, `allowExternal`) |
| `GET` | `/api/auth/status` | `{ signedIn, pendingSetup }`, always `200` (used by public pages) |
| `GET` | `/api/auth/me` | Current user (`id`, `name`, `email`, `username`, `defaultScale`) |
| `PUT` | `/api/auth/preferences` | Set the default grading system `{ defaultScale }` |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/gpa/history` | List saved terms (each with its `scaleId`) |
| `POST` | `/api/gpa/save` | Save a term `{ termName, courses[], scaleId? }`; without `scaleId` the account default is used |
| `PUT` | `/api/gpa/:id` | Update a term; without `scaleId` it keeps its own scale |
| `DELETE` | `/api/gpa/:id` | Delete a term |
| `POST` | `/api/gpa/calculate-cumulative` | Compute CGPA `{ scaleId?, termIds[], additionalSubjects[] }`; `400` if the terms use different grading systems |
| `GET` | `/api/gpa/cgpa` | List saved CGPA records |
| `POST` | `/api/gpa/save-cgpa` | Save a CGPA record (recomputed on the server) |
| `DELETE` | `/api/gpa/cgpa/:id` | Delete a CGPA record |
| `GET` | `/api/health` | Health check, including the database (result cached for 30 seconds) |
| `GET` | `/robots.txt`, `/sitemap.xml` | Built from `APP_URL` |

Every `/api/*` response is sent with `Cache-Control: no-store`. Pages use clean URLs: `/login`, `/setup`, `/dashboard`. Old `.html` links get a `301` to the clean URL. Unknown `/api/*` routes return `404` JSON; other unknown URLs show `public/404.html`.

## Example: change password

The new password must be 8–128 characters. You stay signed in on this device; other devices are signed out.

```http
POST /api/auth/password
Content-Type: application/json

{ "currentPassword": "old-password", "newPassword": "new-password" }
```
