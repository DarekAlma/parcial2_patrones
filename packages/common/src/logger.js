// Logger estructurado (una línea JSON por evento): fácil de filtrar con
// `docker compose logs <servicio> | grep saga`.
const SERVICE = process.env.SERVICE_NAME || 'service';

function write(level, event, data = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, service: SERVICE, event, ...data });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  info: (event, data) => write('info', event, data),
  warn: (event, data) => write('warn', event, data),
  error: (event, data) => write('error', event, data),
};
