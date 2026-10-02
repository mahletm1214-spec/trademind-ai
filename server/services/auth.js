import crypto from 'node:crypto';

const SESSION_DAYS = 7;
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}
export function verifyPassword(password, hash, salt) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived,'hex'), Buffer.from(hash,'hex'));
}
export function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
export function newToken() { return crypto.randomBytes(32).toString('base64url'); }
export function expiryDate() { return new Date(Date.now()+SESSION_DAYS*24*60*60*1000); }
export const sessionDays=SESSION_DAYS;
