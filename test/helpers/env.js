// Test environment: dummy secrets and a database address that refuses connections at once,
// so tests never touch a real database. Set before any app module loads (dotenv won't override these).
Object.assign(process.env, {
  NODE_ENV: 'test',
  SESSION_SECRET: 'test-session-secret',
  GOOGLE_CLIENT_ID: 'test-google-id',
  GOOGLE_CLIENT_SECRET: 'test-google-secret',
  GITHUB_CLIENT_ID: 'test-github-id',
  GITHUB_CLIENT_SECRET: 'test-github-secret',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: '1',
  DB_SSL: 'false'
});

// The database is unreachable on purpose; keep its expected errors out of the test output
console.error = () => {};
