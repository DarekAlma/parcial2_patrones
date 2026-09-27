// API GATEWAY · GraphQL (Apollo Server 5 sobre Express 5)
// Único punto de entrada del frontend. Responsabilidades:
//   - Esquema unificado (consultas de paquetes + mutaciones de reserva).
//   - Identidad: registro/login con Argon2id, sesiones en Postgres
//     regeneradas tras autenticar (anti Session Fixation).
//   - Rate limiting global por IP y por operación sensible.
//   - Endurecimiento GraphQL: límite de profundidad, CSRF prevention,
//     errores internos ocultos.
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { expressMiddleware } from '@as-integrations/express5';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';
import { createPool, logger, waitForDatabase } from '@wandersync/common';
import { config } from './config.js';
import { resolvers } from './resolvers.js';
import { depthLimit } from './security/depthLimit.js';
import { createLoaders } from './services.js';

const typeDefs = readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8');
const pool = createPool({ max: 10 });
await waitForDatabase(pool);

const app = express();
const httpServer = http.createServer(app);
app.disable('x-powered-by');
app.set('trust proxy', 1); // detrás de Nginx: req.ip = IP real del cliente

// La CSP la define el frontend (Nginx); aquí se desactiva para permitir el
// Apollo Sandbox embebido en /graphql. El resto de cabeceras de helmet aplica.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const PgStore = connectPgSimple(session);
app.use(
  session({
    name: 'wsid',
    store: new PgStore({ pool, schemaName: 'identity', tableName: 'session', pruneSessionInterval: 15 * 60 }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true, // no accesible desde JavaScript (XSS)
      sameSite: 'strict', // no viaja en peticiones cross-site (CSRF)
      secure: config.cookieSecure, // true detrás de HTTPS
      maxAge: 2 * 60 * 60 * 1000,
    },
  }),
);

// Límite global por IP en el endpoint GraphQL (anti-DoS). Los límites finos
// por operación (login, checkout, ingesta) viven en security/limits.js.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { errors: [{ message: 'Demasiadas solicitudes', extensions: { code: 'TOO_MANY_REQUESTS' } }] },
});

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: config.introspection,
  csrfPrevention: true,
  includeStacktraceInErrorResponses: !config.production,
  validationRules: [depthLimit(6)],
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    ApolloServerPluginLandingPageLocalDefault({ embed: true, includeCookies: true }),
  ],
  formatError: (formatted, error) => {
    const code = formatted.extensions?.code;
    if (!code || code === 'INTERNAL_SERVER_ERROR') {
      logger.error('graphql.internal_error', { message: formatted.message, path: formatted.path, error: String(error) });
      return { message: 'Error interno del servidor', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
    }
    return formatted;
  },
});
await server.start();

app.get('/health', (_req, res) => res.json({ ok: true, service: 'gateway' }));
app.use(
  '/graphql',
  cors({ origin: config.corsOrigins, credentials: true }),
  globalLimiter,
  express.json({ limit: '100kb' }),
  expressMiddleware(server, {
    context: async ({ req, res }) => {
      let user = null;
      if (req.session?.userId) {
        const { rows } = await pool.query('select * from identity.users where id = $1', [req.session.userId]);
        user = rows[0] ?? null;
      }
      return { req, res, pool, user, loaders: createLoaders() };
    },
  }),
);

httpServer.listen(config.port, () => logger.info('listening', { service: 'gateway', port: config.port }));
