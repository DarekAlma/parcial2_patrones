// Identidad y sesiones seguras.
//  * Contraseñas con Argon2id (ganador de la Password Hashing Competition,
//    recomendado por OWASP) con factor de costo elevado.
//  * Anti Session Fixation: el id de sesión se REGENERA siempre tras un login
//    o registro exitoso; el id previo (que un atacante pudo haber plantado)
//    queda invalidado en el almacén de sesiones.
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { GraphQLError } from 'graphql';
import { logger } from '@wandersync/common';

// 64 MiB de memoria, 3 iteraciones: ~100-200 ms por hash. Muy por encima del
// mínimo de OWASP (19 MiB, t=2) y costoso para ataques con GPU.
export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 64 * 1024, timeCost: 3, parallelism: 1 };

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

let dummyHash;
/** Hash señuelo: se verifica aunque el correo no exista, para que el tiempo de
 *  respuesta no revele qué cuentas existen (enumeración de usuarios). */
async function getDummyHash() {
  dummyHash ??= await argon2.hash('wandersync-dummy-password', ARGON2_OPTIONS);
  return dummyHash;
}

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export function validateRegistration({ email, fullName, password }) {
  const problems = [];
  if (!EMAIL.test(normalizeEmail(email))) problems.push('correo inválido');
  if (!fullName || fullName.trim().length < 2 || fullName.trim().length > 80) problems.push('nombre entre 2 y 80 caracteres');
  if (!password || password.length < 10 || password.length > 128) problems.push('contraseña entre 10 y 128 caracteres');
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) problems.push('la contraseña debe tener letras y números');
  if (problems.length) {
    throw new GraphQLError(`Registro inválido: ${problems.join(', ')}`, { extensions: { code: 'BAD_USER_INPUT' } });
  }
}

export const hashPassword = (password) => argon2.hash(password, ARGON2_OPTIONS);

export async function verifyPassword(user, password) {
  if (!user) {
    await argon2.verify(await getDummyHash(), password);
    return false;
  }
  return argon2.verify(user.password_hash, password);
}

const fingerprint = (sid) => (sid ? createHash('sha256').update(sid).digest('hex').slice(0, 10) : null);

const promisify = (fn) => new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));

/** Emite una sesión NUEVA para el usuario autenticado (mitigación de Session Fixation). */
export async function establishSession(req, userId) {
  const previousId = req.sessionID;
  const recentSearches = req.session?.recentSearches ?? [];

  await promisify((cb) => req.session.regenerate(cb)); // destruye la sesión previa en el store
  req.session.userId = userId;
  req.session.authenticatedAt = new Date().toISOString();
  req.session.recentSearches = recentSearches; // solo datos no sensibles se conservan
  await promisify((cb) => req.session.save(cb));

  logger.info('auth.session_regenerated', {
    userId,
    previousSession: fingerprint(previousId),
    newSession: fingerprint(req.sessionID),
  });
}

export async function destroySession(req, res) {
  if (!req.session) return;
  await promisify((cb) => req.session.destroy(cb));
  res.clearCookie('wsid', { path: '/' });
}

export function requireUser(ctx) {
  if (!ctx.user) {
    throw new GraphQLError('Debes iniciar sesión', { extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } });
  }
  return ctx.user;
}
