# SEO

Only the sign-in page (`/login`) is indexed; the dashboard and setup pages are private.

- `robots.txt` and `sitemap.xml` are built from `APP_URL`, so set it to your public domain in production.
- The sign-in page has an absolute canonical tag, a unique title and meta description, JSON-LD, and Open Graph and Twitter share cards with a 1200×630 preview image (`public/og-image.png`).
- [`public/llms.txt`](../public/llms.txt) gives AI crawlers a plain-language summary.
- The Inter font is self-hosted and preloaded, with no third-party requests, for a fast first paint.

## Backlink ideas (do these yourself)

- Share the site in MSU-IIT student groups, org pages and college Discord/Messenger communities.
- Add it to your GitHub profile README and portfolio site.
- Write a short post (Dev.to, Medium, Facebook) on how the MSU-IIT GPA is computed, linking to the app.
- Ask student councils or orgs to list it on their resources page.
- Submit it to student-tool directories once it has a custom domain.
