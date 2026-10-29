// Password hashing with Node's built-in scrypt, stored as scrypt$<salt hex>$<hash base64>
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const expectedBuf = Buffer.from(expected, 'base64');
  const hash = await scrypt(password, salt, expectedBuf.length);
  return crypto.timingSafeEqual(hash, expectedBuf);
}

module.exports = { hashPassword, verifyPassword };
