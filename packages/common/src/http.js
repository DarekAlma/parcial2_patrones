import express from 'express';
import helmet from 'helmet';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** App Express base de cada microservicio: cabeceras seguras, JSON acotado, /health. */
export function createApp(name) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path !== '/health') {
        logger.info('http', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started });
      }
    });
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, service: name }));
  app.use(requireInternalToken);
  return app;
}

/**
 * Defensa en profundidad: los microservicios internos solo aceptan llamadas que
 * traigan el token compartido (Gateway, Órdenes y Orquestador lo envían).
 * Aunque alguien llegue a la red interna, no puede invocar reservas o pagos.
 */
function requireInternalToken(req, _res, next) {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected || req.get('x-internal-token') === expected) return next();
  return next(new HttpError(401, 'UNAUTHORIZED_INTERNAL', 'Falta o es inválido x-internal-token'));
}

/** Envuelve handlers async: los errores llegan al middleware de errores. */
export const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }
  logger.error('unhandled', { error: err.message, stack: err.stack });
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error interno' });
}

export function listen(app, port, name) {
  app.use(errorHandler);
  app.listen(port, () => logger.info('listening', { service: name, port }));
}

/** Llamada HTTP JSON entre servicios, con timeout. Nunca lanza por status. */
export async function callJson(url, { method = 'GET', body, headers = {}, timeoutMs = 10_000 } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(process.env.INTERNAL_API_TOKEN ? { 'x-internal-token': process.env.INTERNAL_API_TOKEN } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { status: response.status, ok: response.ok, body: data };
}

/** Fallo simulado para la demo de la SAGA (lo activa el orquestador por cabecera). */
export function assertNoSimulatedFailure(req, what) {
  if (req.get('x-simulate-failure') === 'true') {
    throw new HttpError(503, 'SIMULATED_FAILURE', `Fallo simulado en ${what} (modo demo)`);
  }
}
