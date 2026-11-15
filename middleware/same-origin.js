// CSRF guard for state-changing API calls, on top of sameSite cookies (Security checklist item 20).
// Browsers send Origin on every fetch POST/PUT/DELETE; Referer is the fallback, and a request with neither is refused.
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

module.exports = function sameOrigin(req, res, next) {
  if (SAFE_METHODS.includes(req.method)) return next();
  const expected = `${req.protocol}://${req.get('host')}`;
  const origin = req.get('origin');
  const source = origin && origin !== 'null' ? origin : originOf(req.get('referer'));
  if (source !== expected) return res.status(403).json({ error: 'Cross-origin request blocked' });
  next();
};
