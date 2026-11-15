// Logs a server error without personal data: mysql2 errors carry the SQL and its bound values, so only their code is kept
module.exports = function logError(req, err) {
  const where = req ? `${req.method} ${req.baseUrl || ''}${(req.route && req.route.path) || req.path || ''}` : 'server';
  if (err && err.sqlState) {
    console.error(`${where}: database error ${err.code} (${err.errno})`);
  } else {
    console.error(`${where}:`, (err && err.stack) || String(err));
  }
};
