'use strict';
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const ACCESS = require('./access.json');
const fail = (status, message) => Object.assign(new Error(message), {status});
const MAX_PLAIN = 96 * 1024 * 1024;
function keyring(raw) {
  const k = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!k || !/^[a-z0-9-]{1,30}$/.test(k.active) || !k.keys || !k.keys[k.active]) throw Error('Clave no configurada');
  for (const [id, value] of Object.entries(k.keys)) {
    if (!/^[a-z0-9-]{1,30}$/.test(id) || !/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value,'base64').length !== 32) throw Error('Clave inválida');
  }
  return k;
}
function encrypt(data, raw) {
  const k = keyring(raw), id = k.active, iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(k.keys[id], 'base64'), iv);
  cipher.setAAD(Buffer.from('ste2026:dataset:v1:' + id));
  const plain = Buffer.from(JSON.stringify(data));
  if (plain.length > MAX_PLAIN) throw fail(413, 'La base excede el tamaño admitido.');
  const body = Buffer.concat([cipher.update(zlib.gzipSync(plain)), cipher.final()]);
  return Buffer.from(JSON.stringify({v:1, key:id, iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), body:body.toString('base64')}));
}
function decrypt(bytes, raw) {
  const k = keyring(raw), e = JSON.parse(bytes.toString());
  if (e.v !== 1 || !Object.hasOwn(k.keys, e.key)) throw Error('Versión o clave desconocida');
  const iv = Buffer.from(e.iv,'base64'), tag = Buffer.from(e.tag,'base64');
  if (iv.length !== 12 || tag.length !== 16) throw Error('Sobre inválido');
  const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(k.keys[e.key],'base64'), iv);
  cipher.setAAD(Buffer.from('ste2026:dataset:v1:' + e.key)); cipher.setAuthTag(tag);
  const zipped = Buffer.concat([cipher.update(Buffer.from(e.body,'base64')),cipher.final()]);
  return JSON.parse(zlib.gunzipSync(zipped,{maxOutputLength:MAX_PLAIN}).toString());
}
function identity(token) {
  const email = String(token?.email || '').toLowerCase();
  if (!token?.uid || !Object.hasOwn(ACCESS,email) || token.steAccess !== true || token.firebase?.sign_in_provider !== 'password') throw fail(403,'Cuenta no autorizada.');
  return {uid:token.uid, email, upload:ACCESS[email].upload, verified:token.email_verified === true, mustChange:token.stePasswordChangeRequired !== false};
}
function authorized(user) {
  if (!user.verified) throw fail(403,'Verifique su correo antes de consultar.');
  if (user.mustChange) throw fail(403,'Cambie la contraseña inicial antes de consultar.');
}
function passwordPolicy(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9\s]/.test(value)) throw fail(400,'Use de 12 a 128 caracteres, mayúscula, minúscula, número y símbolo.');
}
// Identificadores seudónimos para auditoría. Clave independiente de la de datos.
function digest(secret, value) { return crypto.createHmac('sha256',secret).update(value).digest('hex'); }
function checkQuota(old, action, now = Date.now()) {
  const minute = Math.floor(now/60000), day = Math.floor(now/86400000);
  const q = {minute, day, requests:old?.minute===minute ? old.requests : 0, consults:old?.day===day ? old.consults : 0, uploads:old?.day===day ? old.uploads : 0};
  if (q.requests >= 30 || action === 'consult' && q.consults >= 300 || action === 'upload' && q.uploads >= 30) throw fail(429,'Límite de uso alcanzado. Intente más tarde.');
  q.requests++; if (action === 'consult') q.consults++; if (action === 'upload') q.uploads++;
  return q;
}
module.exports = {fail, MAX_PLAIN, keyring, encrypt, decrypt, identity, authorized, passwordPolicy, digest, checkQuota};
