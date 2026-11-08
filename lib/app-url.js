// Public site address for OAuth callbacks, sitemap and robots.txt; falls back to Vercel's production domain
const APP_URL = (
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  `http://localhost:${process.env.PORT || 3000}`
).replace(/\/+$/, '');

module.exports = APP_URL;
