import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';
import { nodes, pgGraphql, selection } from '@wandersync/common';
import { config, DESTINATION_NAMES } from './config.js';
import { flowRunUrl, triggerIngestion } from './prefect.js';
import {
  destroySession,
  establishSession,
  hashPassword,
  normalizeEmail,
  requireUser,
  validateRegistration,
  verifyPassword,
} from './security/auth.js';
import { consume, limiters } from './security/limits.js';
import { catalog, orders } from './services.js';

const SEARCH_KEY = /^[A-Z]{3}-[A-Z]{3}-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}$/;

/**
 * Campos que el cliente pidió en ESTE nivel de la consulta. Se envían al
 * microservicio, que a su vez solo le pide esas columnas a pg_graphql:
 * la proyección viaja de punta a punta (frontend → gateway → servicio → BD).
 */
function requestedFields(info) {
  const names = new Set();
  const visit = (selectionSet) => {
    for (const sel of selectionSet?.selections ?? []) {
      if (sel.kind === Kind.FIELD) names.add(sel.name.value);
      else if (sel.kind === Kind.INLINE_FRAGMENT) visit(sel.selectionSet);
      else if (sel.kind === Kind.FRAGMENT_SPREAD) visit(info.fragments[sel.name.value]?.selectionSet);
    }
  };
  info.fieldNodes.forEach((node) => visit(node.selectionSet));
  names.delete('__typename');
  return [...names];
}

const clampLimit = (limit, max = 30) => Math.min(Math.max(Number(limit) || 10, 1), max);

const toUser = (row) => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  createdAt: new Date(row.created_at).toISOString(),
  lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
});

const toOrder = (row) => ({
  id: row.id,
  userId: row.user_id,
  status: row.status,
  searchKey: row.search_key,
  travelers: row.travelers,
  flightOfferId: row.flight_offer_id,
  hotelOfferId: row.hotel_offer_id,
  carOfferId: row.car_offer_id,
  flightTotalCop: row.flight_total_cop,
  hotelTotalCop: row.hotel_total_cop,
  carTotalCop: row.car_total_cop,
  totalCop: row.total_cop,
  simulateFailure: row.simulate_failure,
  failureReason: row.failure_reason,
  paymentStatus: row.payment_status,
  invoiceNumber: row.invoice_number,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

/** Evita IDOR: un usuario solo puede ver sus propias órdenes. */
async function ownedOrder(ctx, id) {
  const user = requireUser(ctx);
  const body = await orders.get(id);
  if (!body?.order || body.order.user_id !== user.id) return null;
  return toOrder(body.order);
}

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  serialize: (value) => (typeof value === 'string' ? safeParse(value) : value),
  parseValue: (value) => value,
});

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const INGESTION_FIELDS = [
  'id', 'flowRunName', 'status', 'chaosFailRate', 'windows', 'flights', 'hotels', 'cars',
  'failedTasks', 'detail', 'startedAt', 'finishedAt',
];

export const resolvers = {
  JSON: JSONScalar,

  Query: {
    me: (_p, _a, ctx) => (ctx.user ? toUser(ctx.user) : null),

    recentSearches: (_p, _a, { req }) => req.session?.recentSearches ?? [],

    destinations: async () => {
      const [flights, hotels, cars] = await Promise.all([
        catalog.windows('flights'),
        catalog.windows('hotels'),
        catalog.windows('cars'),
      ]);
      const hotelsBy = new Map(hotels.map((w) => [w.searchKey, w]));
      const carsBy = new Map(cars.map((w) => [w.searchKey, w]));
      return flights.map((w) => {
        const nights = Math.round((new Date(w.checkOut) - new Date(w.checkIn)) / 86_400_000);
        return {
          searchKey: w.searchKey,
          origin: w.origin,
          destination: w.destination,
          destinationName: DESTINATION_NAMES[w.destination] ?? w.destination,
          checkIn: w.checkIn,
          checkOut: w.checkOut,
          nights,
          flightOffers: w.offers,
          hotelOffers: hotelsBy.get(w.searchKey)?.offers ?? 0,
          carOffers: carsBy.get(w.searchKey)?.offers ?? 0,
          minFlightPriceCop: w.minPriceCop,
          minHotelPriceCop: hotelsBy.get(w.searchKey)?.minPriceCop ?? null,
          minCarPriceCop: carsBy.get(w.searchKey)?.minPriceCop ?? null,
          scrapedAt: w.scrapedAt ? new Date(w.scrapedAt).toISOString() : null,
        };
      });
    },

    packageSearch: (_p, { searchKey }, { req }) => {
      if (!SEARCH_KEY.test(searchKey)) {
        throw new GraphQLError('searchKey inválido', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      // Guarda la búsqueda en la sesión (también para anónimos).
      const recent = req.session.recentSearches ?? [];
      req.session.recentSearches = [searchKey, ...recent.filter((k) => k !== searchKey)].slice(0, 5);
      return { searchKey };
    },

    order: (_p, { id }, ctx) => ownedOrder(ctx, id),

    myOrders: async (_p, _a, ctx) => {
      const user = requireUser(ctx);
      const body = await orders.byUser(user.id);
      return (body?.orders ?? []).map(toOrder);
    },

    ingestionRuns: async (_p, { limit }, ctx, info) => {
      const query = `
        query Runs($first: Int!) {
          ingestionRunsCollection(orderBy: [{ startedAt: DescNullsLast }], first: $first) {
            edges { node { ${selection(requestedFields(info).join(','), INGESTION_FIELDS)} } }
          }
        }`;
      const data = await pgGraphql(ctx.pool, query, { first: clampLimit(limit, 20) });
      return nodes(data.ingestionRunsCollection).map((run) => ({ ...run, flowRunUrl: flowRunUrl(run.id) }));
    },

    platformLinks: () => config.publicLinks,
  },

  Mutation: {
    register: async (_p, { input }, ctx) => {
      await consume(limiters.register, ctx.req.ip, 'registro');
      validateRegistration(input);
      const email = normalizeEmail(input.email);
      const passwordHash = await hashPassword(input.password);
      const { rows } = await ctx.pool.query(
        `insert into identity.users (email, full_name, password_hash) values ($1, $2, $3)
         on conflict (email) do nothing returning *`,
        [email, input.fullName.trim(), passwordHash],
      );
      if (!rows[0]) {
        throw new GraphQLError('No fue posible completar el registro con esos datos', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      await establishSession(ctx.req, rows[0].id);
      return { user: toUser(rows[0]), sessionRegenerated: true };
    },

    login: async (_p, { email, password }, ctx) => {
      const normalized = normalizeEmail(email);
      const accountKey = `${ctx.req.ip}:${normalized}`;
      await consume(limiters.loginIp, ctx.req.ip, 'inicio de sesión');
      await consume(limiters.loginAccount, accountKey, 'inicio de sesión');

      const { rows } = await ctx.pool.query('select * from identity.users where email = $1', [normalized]);
      const valid = await verifyPassword(rows[0], String(password || ''));
      if (!valid) {
        // Mensaje genérico: no revela si el correo existe.
        throw new GraphQLError('Correo o contraseña incorrectos', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }
      await limiters.loginAccount.delete(accountKey);
      const updated = await ctx.pool.query(
        'update identity.users set last_login_at = now() where id = $1 returning *',
        [rows[0].id],
      );
      await establishSession(ctx.req, rows[0].id);
      return { user: toUser(updated.rows[0]), sessionRegenerated: true };
    },

    logout: async (_p, _a, { req, res }) => {
      await destroySession(req, res);
      return true;
    },

    bookPackage: async (_p, { input }, ctx) => {
      const user = requireUser(ctx);
      await consume(limiters.checkout, user.id, 'checkout de reservas');
      const body = await orders.create({ ...input, userId: user.id });
      return toOrder(body.order);
    },

    triggerIngestion: async (_p, { chaosFailRate }, ctx) => {
      const user = requireUser(ctx);
      await consume(limiters.ingestion, user.id, 'ingesta');
      const rate = Math.min(Math.max(Number(chaosFailRate) || 0, 0), 0.9);
      return triggerIngestion(rate);
    },
  },

  PackageSearch: {
    flights: ({ searchKey }, { limit }, _ctx, info) =>
      catalog.offers('flights', searchKey, clampLimit(limit), requestedFields(info)),
    hotels: ({ searchKey }, { limit }, _ctx, info) =>
      catalog.offers('hotels', searchKey, clampLimit(limit), requestedFields(info)),
    cars: ({ searchKey }, { limit }, _ctx, info) =>
      catalog.offers('cars', searchKey, clampLimit(limit), requestedFields(info)),
    cheapestPackage: async ({ searchKey }) => {
      const [[flight], [hotel], [car]] = await Promise.all([
        catalog.offers('flights', searchKey, 1),
        catalog.offers('hotels', searchKey, 1),
        catalog.offers('cars', searchKey, 1),
      ]);
      if (!flight || !hotel || !car) return null;
      return { flight, hotel, car, totalCop: flight.priceCop + hotel.totalPriceCop + car.totalPriceCop };
    },
  },

  Order: {
    flight: (order, _a, { loaders }) => loaders.flight.load(order.flightOfferId),
    hotel: (order, _a, { loaders }) => loaders.hotel.load(order.hotelOfferId),
    car: (order, _a, { loaders }) => loaders.car.load(order.carOfferId),
    saga: async (order, _a, { loaders }) => {
      const saga = await loaders.saga.load(order.id);
      return saga ? { ...saga, flowRunUrl: flowRunUrl(saga.flowRunId) } : null;
    },
  },
};
