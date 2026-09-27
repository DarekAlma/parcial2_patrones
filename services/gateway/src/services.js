// Clientes de los microservicios internos + DataLoaders por petición.
import DataLoader from 'dataloader';
import { GraphQLError } from 'graphql';
import { callJson, logger } from '@wandersync/common';
import { config } from './config.js';

/** Traduce respuestas HTTP de los servicios a errores GraphQL tipados. */
async function request(service, path, options = {}) {
  let response;
  try {
    response = await callJson(`${config.services[service]}${path}`, options);
  } catch (err) {
    logger.error('upstream.unreachable', { service, path, error: err.message });
    throw new GraphQLError(`El servicio de ${service} no está disponible`, {
      extensions: { code: 'SERVICE_UNAVAILABLE', service },
    });
  }
  if (response.ok) return response.body;
  if (response.status === 404) return null;
  const { error, message } = response.body ?? {};
  if (response.status < 500) {
    throw new GraphQLError(message || error || 'Solicitud inválida', {
      extensions: { code: 'BAD_USER_INPUT', reason: error, service },
    });
  }
  logger.error('upstream.error', { service, path, status: response.status, error });
  throw new GraphQLError(`El servicio de ${service} falló`, { extensions: { code: 'SERVICE_UNAVAILABLE', service } });
}

const qs = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export const catalog = {
  async offers(kind, searchKey, limit, fields) {
    const body = await request(kind, `/offers?${qs({ searchKey, limit, fields: fields?.join(',') })}`);
    return body?.offers ?? [];
  },
  async windows(kind) {
    const body = await request(kind, '/windows');
    return body?.windows ?? [];
  },
};

export const orders = {
  create: (payload) => request('orders', '/orders', { method: 'POST', body: payload }),
  get: (id) => request('orders', `/orders/${encodeURIComponent(id)}`),
  byUser: (userId) => request('orders', `/orders?${qs({ userId })}`),
};

export const sagas = {
  get: (orderId) => request('orchestrator', `/sagas/${encodeURIComponent(orderId)}`),
};

/**
 * DataLoaders: si una respuesta tiene 20 órdenes, las 20 ofertas de vuelo se
 * piden en UNA sola llamada (`/offers?ids=a,b,c`), no en 20 (problema N+1).
 */
export function createLoaders() {
  const offerLoader = (kind) =>
    new DataLoader(async (ids) => {
      const body = await request(kind, `/offers?${qs({ ids: ids.join(',') })}`);
      const byId = new Map((body?.offers ?? []).map((o) => [o.id, o]));
      return ids.map((id) => byId.get(id) ?? null);
    });
  return {
    flight: offerLoader('flights'),
    hotel: offerLoader('hotels'),
    car: offerLoader('cars'),
    saga: new DataLoader(async (ids) => Promise.all(ids.map((id) => sagas.get(id)))),
  };
}
