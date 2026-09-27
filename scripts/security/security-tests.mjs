#!/usr/bin/env node
// Pruebas automáticas de los requisitos de "Ciberseguridad por diseño".
// Requiere el sistema arriba (docker compose up). Uso:
//
//   node scripts/security/security-tests.mjs
//
//  1. Session Fixation: el id de sesión cambia al autenticar y el viejo muere.
//  2. Argon2id: las contraseñas se guardan como hash $argon2id$ con costo alto.
//  3. Rate limiting en login (fuerza bruta) y en checkout de reservas.
//  4. Endurecimiento GraphQL: CSRF prevention y límite de profundidad.
//  5. Defensa en profundidad: servicios internos exigen x-internal-token.
import { execFileSync } from 'node:child_process';
import { c, ENDPOINT, GqlClient, randomUser } from '../lib/gql.mjs';

let failed = 0;
function check(name, condition, evidence) {
  if (!condition) failed += 1;
  console.log(`${condition ? c.ok('✔ PASA ') : c.bad('✘ FALLA')} ${name}`);
  if (evidence) console.log(c.dim(`         ${evidence}`));
}

function dockerExec(service, code) {
  return execFileSync('docker', ['compose', 'exec', '-T', service, 'node', '-e', code], { encoding: 'utf8' }).trim();
}

const REGISTER = `mutation($input: RegisterInput!) { register(input: $input) { sessionRegenerated user { id email } } }`;
const LOGIN = `mutation($e: String!, $p: String!) { login(email: $e, password: $p) { user { id } } }`;
const ME = `{ me { id email } }`;
const ANY_KEY = 'BOG-CTG-2030-01-01-2030-01-04';

console.log(c.bold(`\nPruebas de seguridad contra ${ENDPOINT}\n`));

// ------------------------------------------------------ 1. Session Fixation
console.log(c.bold('1) Mitigación de Session Fixation'));
const victim = new GqlClient();
await victim.request(`query($k: String!) { packageSearch(searchKey: $k) { searchKey } }`, { k: ANY_KEY });
const preAuthCookie = victim.cookie;
check('Un visitante anónimo recibe una sesión (id pre-autenticación)', Boolean(preAuthCookie), preAuthCookie?.slice(0, 30) + '…');

const user = randomUser('sec');
const reg = await victim.request(REGISTER, { input: user });
const postAuthCookie = victim.cookie;
check(
  'Tras autenticarse el servidor emite un id de sesión NUEVO',
  reg.body.data?.register && postAuthCookie && postAuthCookie !== preAuthCookie,
  `antes=${preAuthCookie?.slice(5, 25)}…  después=${postAuthCookie?.slice(5, 25)}…`,
);
const attacker = new GqlClient(preAuthCookie); // el atacante "fijó" el id viejo
const hijack = await attacker.request(ME);
check('El id de sesión anterior ya NO da acceso a la cuenta', hijack.body.data?.me === null, `me con id viejo -> ${JSON.stringify(hijack.body.data)}`);
const legit = await victim.request(ME);
check('El id nuevo sí autentica al usuario', legit.body.data?.me?.email === user.email);
check('Cookie de sesión HttpOnly + SameSite=Strict', /HttpOnly/i.test(reg.setCookie) && /SameSite=Strict/i.test(reg.setCookie), reg.setCookie?.replace(/wsid=[^;]+/, 'wsid=…'));

// ------------------------------------------------------------- 2. Argon2id
console.log(c.bold('\n2) Almacenamiento de contraseñas con Argon2id'));
try {
  const hash = dockerExec(
    'gateway',
    `const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:false}:false});` +
      `p.query('select password_hash from identity.users where email=$1',['${user.email}']).then(r=>{console.log(r.rows[0].password_hash);p.end()})`,
  );
  const params = hash.split('$')[3] ?? '';
  check(
    'El hash es Argon2id con m=64 MiB, t=3, p=1',
    hash.startsWith('$argon2id$v=19$') && ['m=65536', 't=3', 'p=1'].every((p) => params.split(',').includes(p)),
    hash.slice(0, 60) + '…',
  );
  check('La contraseña en claro no aparece en la base de datos', !hash.includes(user.password));
} catch (err) {
  check('Lectura del hash vía docker compose exec', false, err.message.split('\n')[0]);
}

// ------------------------------------------------------- 3. Rate limiting
console.log(c.bold('\n3) Rate limiting en rutas sensibles'));
const bruteForcer = new GqlClient();
const codes = [];
for (let i = 1; i <= 7; i += 1) {
  const r = await bruteForcer.request(LOGIN, { e: user.email, p: `incorrecta-${i}` });
  codes.push(r.body.errors?.[0]?.extensions?.code);
}
check(
  'Login: tras 5 intentos fallidos se bloquea (anti fuerza bruta)',
  codes.slice(0, 5).every((code) => code === 'UNAUTHENTICATED') && codes[5] === 'TOO_MANY_REQUESTS',
  `respuestas: ${codes.join(', ')}`,
);
const blocked = await bruteForcer.request(LOGIN, { e: user.email, p: user.password });
check('Durante el bloqueo, ni la contraseña correcta entra', blocked.body.errors?.[0]?.extensions?.code === 'TOO_MANY_REQUESTS');

const checkoutCodes = [];
for (let i = 1; i <= 6; i += 1) {
  const r = await victim.request(
    `mutation($i: BookPackageInput!) { bookPackage(input: $i) { id } }`,
    { i: { flightOfferId: 'x', hotelOfferId: 'y', carOfferId: 'z' } },
  );
  checkoutCodes.push(r.body.errors?.[0]?.extensions?.code);
}
check('Checkout de reservas: máximo 5 por minuto por usuario', checkoutCodes[5] === 'TOO_MANY_REQUESTS', `respuestas: ${checkoutCodes.join(', ')}`);

// -------------------------------------------------- 4. Endurecimiento GraphQL
console.log(c.bold('\n4) Endurecimiento del endpoint GraphQL'));
const csrf = await fetch(`${ENDPOINT}?query=${encodeURIComponent('{ me { id } }')}`);
check('CSRF prevention: GET simple sin cabecera de preflight es rechazado', csrf.status === 400, `HTTP ${csrf.status}`);
const deep = await new GqlClient().request(`{ myOrders { saga { steps { detail } } flight { id } hotel { id } } packageSearch(searchKey: "${ANY_KEY}") { cheapestPackage { flight { id } } } }`);
const tooDeep = await new GqlClient().request(`fragment a on Order { saga { steps { step } } } { myOrders { ...a } __schema { types { fields { type { ofType { ofType { name } } } } } } }`);
// Apollo reporta los errores de validación con código GRAPHQL_VALIDATION_FAILED.
const isDepthError = (e) => /demasiado profunda/.test(e.message);
check('Límite de profundidad de consultas (máx. 6)', tooDeep.body.errors?.some(isDepthError), tooDeep.body.errors?.[0]?.message);
check('Consultas normales no se ven afectadas', !deep.body.errors?.some(isDepthError));

// ------------------------------------------- 5. Defensa en profundidad interna
console.log(c.bold('\n5) Servicios internos protegidos'));
try {
  const status = dockerExec('gateway', `fetch('http://orders:4104/orders?userId=00000000-0000-0000-0000-000000000000').then(r=>console.log(r.status))`);
  check('Llamada a un microservicio interno sin x-internal-token -> 401', status === '401', `HTTP ${status}`);
} catch (err) {
  check('Llamada interna sin token', false, err.message.split('\n')[0]);
}

console.log(failed ? c.bad(`\n${failed} verificación(es) fallaron`) : c.ok('\nTodas las verificaciones de seguridad pasaron.'));
process.exit(failed ? 1 : 0);
