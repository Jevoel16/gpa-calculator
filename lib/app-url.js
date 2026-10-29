// The public address of the site (e.g. https://gpa.example.com); OAuth callbacks, the sitemap and robots.txt are built from it.
// On Vercel it falls back to the project's production domain (your custom domain once one is added).
const APP_URL = (
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  `http://localhost:${process.env.PORT || 3000}`
).replace(/\/+$/, '');

module.exports = APP_URL;
