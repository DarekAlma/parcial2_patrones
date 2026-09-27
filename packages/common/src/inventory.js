import { withTransaction } from './db.js';
import { assertNoSimulatedFailure, HttpError, route } from './http.js';
import { logger } from './logger.js';
import { nodes, pgGraphql, selection } from './pggraphql.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEARCH_KEY = /^[A-Z]{3}-[A-Z]{3}-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}$/;

/**
 * Rutas comunes de un microservicio de inventario (Vuelos, Hoteles, Autos).
 *
 *  Catálogo (lectura vía pg_graphql):
 *    GET  /offers?searchKey=&limit=&fields=   ofertas activas de una ventana
 *    GET  /offers?ids=a,b,c&fields=           lote por ids (DataLoader del Gateway)
 *    GET  /windows                            ventanas de viaje disponibles
 *
 *  Participante de la SAGA (escritura transaccional vía SQL):
 *    POST /reservations                       acción: reservar (idempotente por sagaId)
 *    POST /reservations/:sagaId/cancel        compensación: liberar (idempotente)
 *    GET  /reservations/:sagaId
 */
export function mountInventory(app, pool, cfg) {
  const { name, collection, offerTable, stockColumn, reservationTable, quantityColumn, fields, orderBy } = cfg;

  async function fetchOffers({ searchKey, ids, limit, requested }) {
    const [vars, filter, variables] = ids
      ? ['$ids: [String!]!', '{ id: { in: $ids } }', { ids, first: limit }]
      : ['$key: String!', '{ searchKey: { eq: $key }, isActive: { eq: true } }', { key: searchKey, first: limit }];
    const query = `
      query Offers(${vars}, $first: Int!) {
        ${collection}(filter: ${filter}, orderBy: [{ ${orderBy}: AscNullsLast }], first: $first) {
          edges { node { ${selection(requested, fields)} } }
        }
      }`;
    const data = await pgGraphql(pool, query, variables);
    return nodes(data[collection]);
  }

  // ------------------------------------------------------------- catálogo ---
  app.get(
    '/offers',
    route(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
      if (req.query.ids) {
        const ids = String(req.query.ids).split(',').filter(Boolean).slice(0, 100);
        return res.json({ offers: await fetchOffers({ ids, limit: ids.length, requested: req.query.fields }) });
      }
      const searchKey = String(req.query.searchKey || '');
      if (!SEARCH_KEY.test(searchKey)) throw new HttpError(400, 'INVALID_SEARCH_KEY', 'searchKey inválido');
      res.json({ offers: await fetchOffers({ searchKey, limit, requested: req.query.fields }) });
    }),
  );

  app.get(
    '/offers/:id',
    route(async (req, res) => {
      const [offer] = await fetchOffers({ ids: [req.params.id], limit: 1 });
      if (!offer) throw new HttpError(404, 'OFFER_NOT_FOUND', `Oferta ${req.params.id} no existe`);
      res.json({ offer });
    }),
  );

  // Las agregaciones no están en pg_graphql: aquí se usa SQL.
  app.get(
    '/windows',
    route(async (_req, res) => {
      const { rows } = await pool.query(cfg.windowsSql);
      res.json({ windows: rows });
    }),
  );

  // ------------------------------------------------- participante SAGA ---
  app.post(
    '/reservations',
    route(async (req, res) => {
      const { sagaId, offerId } = req.body ?? {};
      const quantity = Number(cfg.quantity(req.body ?? {}));
      if (!UUID.test(sagaId || '') || !offerId || !Number.isInteger(quantity) || quantity < 1 || quantity > 9) {
        throw new HttpError(400, 'INVALID_REQUEST', 'sagaId (uuid), offerId y cantidad válida son obligatorios');
      }
      assertNoSimulatedFailure(req, `el servicio de ${cfg.label}`);

      const result = await withTransaction(pool, async (db) => {
        // Idempotencia: si el orquestador reintenta, no se reserva dos veces.
        const existing = await db.query(`select * from ${reservationTable} where saga_id = $1 for update`, [sagaId]);
        if (existing.rows[0]) {
          const r = existing.rows[0];
          if (r.status === 'CANCELLED') throw new HttpError(409, 'ALREADY_CANCELLED', 'La reserva ya fue compensada');
          return { status: 200, reservation: r, replay: true };
        }

        const stock = await db.query(
          `update ${offerTable} set ${stockColumn} = ${stockColumn} - $2
             where id = $1 and is_active and ${stockColumn} >= $2
           returning ${stockColumn} as remaining`,
          [offerId, quantity],
        );
        if (!stock.rows[0]) {
          const exists = await db.query(`select ${stockColumn} as remaining from ${offerTable} where id = $1`, [offerId]);
          if (!exists.rows[0]) throw new HttpError(404, 'OFFER_NOT_FOUND', `La oferta ${offerId} no existe`);
          throw new HttpError(409, 'NO_AVAILABILITY', `Sin disponibilidad de ${cfg.label}`, {
            remaining: exists.rows[0].remaining,
            requested: quantity,
          });
        }

        const cols = ['saga_id', 'offer_id', 'status', ...(quantityColumn ? [quantityColumn] : [])];
        const vals = [sagaId, offerId, 'RESERVED', ...(quantityColumn ? [quantity] : [])];
        const inserted = await db.query(
          `insert into ${reservationTable} (${cols.join(', ')})
           values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
          vals,
        );
        return { status: 201, reservation: inserted.rows[0], remaining: stock.rows[0].remaining };
      });

      logger.info('reservation.created', { sagaId, offerId, quantity, replay: Boolean(result.replay) });
      res.status(result.status).json(result);
    }),
  );

  app.post(
    '/reservations/:sagaId/cancel',
    route(async (req, res) => {
      const { sagaId } = req.params;
      if (!UUID.test(sagaId)) throw new HttpError(400, 'INVALID_REQUEST', 'sagaId inválido');

      const result = await withTransaction(pool, async (db) => {
        const found = await db.query(`select * from ${reservationTable} where saga_id = $1 for update`, [sagaId]);
        const reservation = found.rows[0];
        // Compensar algo que nunca se ejecutó es un no-op exitoso (idempotencia).
        if (!reservation) return { status: 'NOTHING_TO_COMPENSATE' };
        if (reservation.status === 'CANCELLED') return { status: 'ALREADY_CANCELLED', reservation };

        const quantity = quantityColumn ? reservation[quantityColumn] : 1;
        await db.query(`update ${offerTable} set ${stockColumn} = ${stockColumn} + $2 where id = $1`, [
          reservation.offer_id,
          quantity,
        ]);
        const updated = await db.query(
          `update ${reservationTable} set status = 'CANCELLED', cancelled_at = now() where saga_id = $1 returning *`,
          [sagaId],
        );
        return { status: 'CANCELLED', reservation: updated.rows[0], released: quantity };
      });

      logger.info('reservation.compensated', { sagaId, result: result.status });
      res.json(result);
    }),
  );

  app.get(
    '/reservations/:sagaId',
    route(async (req, res) => {
      if (!UUID.test(req.params.sagaId)) throw new HttpError(400, 'INVALID_REQUEST', 'sagaId inválido');
      const { rows } = await pool.query(`select * from ${reservationTable} where saga_id = $1`, [req.params.sagaId]);
      if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Reserva no encontrada');
      res.json({ reservation: rows[0] });
    }),
  );
}
