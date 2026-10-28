const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const {
  DATABASE_URL,
  DB_HOST = 'localhost',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'gpa_app',
  DB_SSL = 'false',
  DB_SSL_CA,
  DB_CONNECTION_LIMIT
} = process.env;

// Hosted MySQL (TiDB Cloud, Aiven, Railway...) requires TLS. DB_SSL_CA may be a PEM string or a path to one.
function sslOptions() {
  if (DB_SSL.toLowerCase() !== 'true') return undefined;
  const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (DB_SSL_CA) {
    ssl.ca = DB_SSL_CA.includes('BEGIN CERTIFICATE')
      ? DB_SSL_CA.replace(/\\n/g, '\n')
      : fs.readFileSync(DB_SSL_CA, 'utf8');
  }
  return ssl;
}

// Serverless functions run many small instances, so each keeps only a few connections
const poolOptions = {
  waitForConnections: true,
  connectionLimit: Number(DB_CONNECTION_LIMIT) || (process.env.VERCEL ? 3 : 10),
  queueLimit: 0,
  enableKeepAlive: true,
  maxIdle: 3,
  idleTimeout: 60000,
  ssl: sslOptions()
};

const pool = DATABASE_URL
  ? mysql.createPool({ uri: DATABASE_URL, ...poolOptions })
  : mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      ...poolOptions
    });

module.exports = pool;
