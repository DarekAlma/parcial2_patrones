// Rate limiting por operación GraphQL.
// GraphQL expone un único endpoint (/graphql), así que limitar por ruta HTTP no
// basta: aquí se limita cada operación sensible con su propia política.
import { GraphQLError } from 'graphql';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { logger } from '@wandersync/common';

export const limiters = {
  // Fuerza bruta sobre una cuenta: 5 intentos por minuto por IP+correo,
  // luego bloqueo de 5 minutos.
  loginAccount: new RateLimiterMemory({ keyPrefix: 'login-acct', points: 5, duration: 60, blockDuration: 300 }),
  // Credential stuffing desde una IP contra muchas cuentas.
  loginIp: new RateLimiterMemory({ keyPrefix: 'login-ip', points: 20, duration: 15 * 60 }),
  register: new RateLimiterMemory({ keyPrefix: 'register', points: 5, duration: 15 * 60 }),
  // Checkout de reservas (dispara pagos): 5 por minuto por usuario.
  checkout: new RateLimiterMemory({ keyPrefix: 'checkout', points: 5, duration: 60 }),
  // La ingesta hace scraping a sitios reales: se protege de abusos.
  ingestion: new RateLimiterMemory({ keyPrefix: 'ingestion', points: 3, duration: 5 * 60 }),
};

export async function consume(limiter, key, operation) {
  try {
    await limiter.consume(key);
  } catch (rejection) {
    if (rejection instanceof Error) throw rejection;
    const retryAfterSeconds = Math.ceil(rejection.msBeforeNext / 1000);
    logger.warn('rate_limit.blocked', { operation, key, retryAfterSeconds });
    throw new GraphQLError(`Demasiados intentos de ${operation}. Intenta de nuevo en ${retryAfterSeconds} s.`, {
      extensions: { code: 'TOO_MANY_REQUESTS', retryAfterSeconds, http: { status: 429 } },
    });
  }
}
