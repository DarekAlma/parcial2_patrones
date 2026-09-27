// Microservicio de ÓRDENES / FACTURACIÓN
//  - Crea la orden de un paquete (vuelo + hotel + auto) y dispara la SAGA.
//  - Participa en la SAGA con el paso de PAGO (cobro / reembolso) y la
//    CONFIRMACIÓN (emisión de factura).
//  - Dueño del esquema `billing`.
import rateLimit from 'express-rate-limit';
import {
  callJson,
  createApp,
  createPool,
  HttpError,
  listen,
  logger,
  route,
  withTransaction,
} from '@wandersync/common';

const PORT = Number(process.env.PORT || 4104);
const FLIGHTS_URL = process.env.FLIGHTS_URL || 'http://flights:4101';
const HOTELS_URL = process.env.HOTELS_URL || 'http://hotels:4102';
const CARS_URL = process.env.CARS_URL || 'http://cars:4103';
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://saga-orchestrator:4040';

const FAILURE_TARGETS = ['NONE', 'FLIGHT', 'HOTEL', 'CAR', 'PAYMENT'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINAL = ['CONFIRMED', 'COMPENSATED', 'FAILED'];

const app = createApp('orders');
const pool = createPool();

async function getOffer(baseUrl, id, kind) {
  const { status, body } = await callJson(`${baseUrl}/offers/${encodeURIComponent(id)}`);
  if (status === 404) throw new HttpError(422, 'OFFER_NOT_FOUND', `La oferta de ${kind} no existe`);
  if (status !== 200) throw new HttpError(502, 'UPSTREAM_ERROR', `El servicio de ${kind} respondió ${status}`);
  return body.offer;
}

async function loadOrder(id) {
  const { rows } = await pool.query(
    `select o.*, p.status as payment_status, i.number as invoice_number
       from billing.orders o
       left join billing.payments p on p.order_id = o.id
       left join billing.invoices i on i.order_id = o.id
      where o.id = $1`,
    [id],
  );
  return rows[0];
}

// --------------------------------------------------------------- órdenes ---
app.post(
  '/orders',
  route(async (req, res) => {
    const { userId, flightOfferId, hotelOfferId, carOfferId } = req.body ?? {};
    const travelers = Number(req.body?.travelers ?? 1);
    const simulateFailure = String(req.body?.simulateFailure ?? 'NONE').toUpperCase();
    if (!UUID.test(userId || '') || !flightOfferId || !hotelOfferId || !carOfferId) {
      throw new HttpError(400, 'INVALID_REQUEST', 'userId, flightOfferId, hotelOfferId y carOfferId son obligatorios');
    }
    if (!Number.isInteger(travelers) || travelers < 1 || travelers > 4) {
      throw new HttpError(400, 'INVALID_TRAVELERS', 'Viajeros debe estar entre 1 y 4 (una habitación)');
    }
    if (!FAILURE_TARGETS.includes(simulateFailure)) {
      throw new HttpError(400, 'INVALID_FAILURE_TARGET', `simulateFailure debe ser uno de ${FAILURE_TARGETS}`);
    }

    // Precios autoritativos: se consultan a cada servicio dueño, nunca se
    // confía en el precio que manda el cliente.
    const [flight, hotel, car] = await Promise.all([
      getOffer(FLIGHTS_URL, flightOfferId, 'vuelo'),
      getOffer(HOTELS_URL, hotelOfferId, 'hotel'),
      getOffer(CARS_URL, carOfferId, 'auto'),
    ]);
    if (new Set([flight.searchKey, hotel.searchKey, car.searchKey]).size !== 1) {
      throw new HttpError(422, 'MISMATCHED_WINDOW', 'Vuelo, hotel y auto deben ser del mismo destino y fechas');
    }

    const flightTotal = flight.priceCop * travelers;
    const hotelTotal = hotel.totalPriceCop;
    const carTotal = car.totalPriceCop;
    const { rows } = await pool.query(
      `insert into billing.orders (user_id, search_key, flight_offer_id, hotel_offer_id, car_offer_id, travelers,
                                   flight_total_cop, hotel_total_cop, car_total_cop, total_cop, simulate_failure)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [userId, flight.searchKey, flightOfferId, hotelOfferId, carOfferId, travelers,
        flightTotal, hotelTotal, carTotal, flightTotal + hotelTotal + carTotal, simulateFailure],
    );
    const order = rows[0];

    // Dispara la SAGA orquestada (flow de Prefect). Responde 202: la reserva
    // continúa de forma asíncrona y el cliente consulta el estado.
    try {
      const saga = await callJson(`${ORCHESTRATOR_URL}/sagas`, {
        method: 'POST',
        body: {
          orderId: order.id,
          flightOfferId,
          hotelOfferId,
          carOfferId,
          travelers,
          amountCop: order.total_cop,
          simulateFailure,
        },
      });
      if (saga.status !== 202) throw new Error(`orquestador respondió ${saga.status}`);
    } catch (err) {
      await pool.query(
        `update billing.orders set status = 'FAILED', failure_reason = $2, updated_at = now() where id = $1`,
        [order.id, `No se pudo iniciar la SAGA: ${err.message}`],
      );
      throw new HttpError(503, 'SAGA_UNAVAILABLE', 'El orquestador de reservas no está disponible');
    }

    logger.info('order.created', { orderId: order.id, total: order.total_cop, simulateFailure });
    res.status(202).json({ order: await loadOrder(order.id) });
  }),
);

app.get(
  '/orders',
  route(async (req, res) => {
    const userId = String(req.query.userId || '');
    if (!UUID.test(userId)) throw new HttpError(400, 'INVALID_REQUEST', 'userId inválido');
    const { rows } = await pool.query(
      `select o.*, p.status as payment_status, i.number as invoice_number
         from billing.orders o
         left join billing.payments p on p.order_id = o.id
         left join billing.invoices i on i.order_id = o.id
        where o.user_id = $1 order by o.created_at desc limit 50`,
      [userId],
    );
    res.json({ orders: rows });
  }),
);

app.get(
  '/orders/:id',
  route(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new HttpError(400, 'INVALID_REQUEST', 'id inválido');
    const order = await loadOrder(req.params.id);
    if (!order) throw new HttpError(404, 'NOT_FOUND', 'Orden no encontrada');
    res.json({ order });
  }),
);

// Uso interno del orquestador: transiciones de estado de la orden.
app.patch(
  '/orders/:id/status',
  route(async (req, res) => {
    const { status, reason } = req.body ?? {};
    if (!['PROCESSING', 'COMPENSATED', 'FAILED'].includes(status)) {
      throw new HttpError(400, 'INVALID_STATUS', 'Estado no permitido');
    }
    const { rows } = await pool.query(
      `update billing.orders set status = $2, failure_reason = coalesce($3, failure_reason), updated_at = now()
        where id = $1 and status not in ('CONFIRMED', 'COMPENSATED') returning id, status`,
      [req.params.id, status, reason ?? null],
    );
    res.json({ updated: rows[0] ?? null });
  }),
);

// Paso final de la SAGA: emitir factura y confirmar (idempotente).
app.post(
  '/orders/:id/confirm',
  route(async (req, res) => {
    const result = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('select * from billing.orders where id = $1 for update', [req.params.id]);
      const order = rows[0];
      if (!order) throw new HttpError(404, 'NOT_FOUND', 'Orden no encontrada');
      if (order.status === 'CONFIRMED') return { replay: true };
      if (FINAL.includes(order.status)) throw new HttpError(409, 'INVALID_STATE', `La orden está ${order.status}`);
      const paid = await db.query(`select 1 from billing.payments where order_id = $1 and status = 'CHARGED'`, [order.id]);
      if (!paid.rows[0]) throw new HttpError(409, 'NOT_PAID', 'No se puede confirmar una orden sin pago');

      const seq = await db.query(`select nextval('billing.invoice_seq') as n`);
      const number = `WS-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(6, '0')}`;
      await db.query('insert into billing.invoices (order_id, number, amount_cop) values ($1, $2, $3)', [
        order.id, number, order.total_cop,
      ]);
      await db.query(`update billing.orders set status = 'CONFIRMED', updated_at = now() where id = $1`, [order.id]);
      return { invoice: number };
    });
    res.json({ order: await loadOrder(req.params.id), ...result });
  }),
);

// ------------------------------------------------------------ facturación ---
// Rate limiting por orden en el endpoint de pago: evita martilleo de cobros
// (card testing) incluso si alguien alcanza la red interna.
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `payment:${req.body?.orderId ?? 'unknown'}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos de pago para esta orden' }),
});

app.post(
  '/payments',
  paymentLimiter,
  route(async (req, res) => {
    const { orderId, amountCop } = req.body ?? {};
    if (!UUID.test(orderId || '')) throw new HttpError(400, 'INVALID_REQUEST', 'orderId inválido');

    const result = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('select * from billing.orders where id = $1 for update', [orderId]);
      const order = rows[0];
      if (!order) throw new HttpError(404, 'NOT_FOUND', 'Orden no encontrada');
      const existing = await db.query('select * from billing.payments where order_id = $1', [orderId]);
      if (existing.rows[0]?.status === 'CHARGED') return { status: 200, payment: existing.rows[0], replay: true };
      if (existing.rows[0]?.status === 'REFUNDED') throw new HttpError(409, 'ALREADY_REFUNDED', 'Pago ya reembolsado');
      if (Number(amountCop) !== order.total_cop) {
        throw new HttpError(422, 'AMOUNT_MISMATCH', 'El monto no coincide con el total de la orden');
      }
      if (req.get('x-simulate-failure') === 'true') {
        // Rechazo de negocio (tarjeta declinada): no se reintenta, se compensa.
        throw new HttpError(402, 'PAYMENT_DECLINED', 'Pago rechazado por la pasarela (modo demo)');
      }
      const inserted = await db.query(
        `insert into billing.payments (order_id, amount_cop, status) values ($1, $2, 'CHARGED') returning *`,
        [orderId, order.total_cop],
      );
      return { status: 201, payment: inserted.rows[0] };
    });

    logger.info('payment.charged', { orderId, replay: Boolean(result.replay) });
    res.status(result.status).json(result);
  }),
);

app.post(
  '/payments/:orderId/refund',
  route(async (req, res) => {
    const { rows } = await pool.query(
      `update billing.payments set status = 'REFUNDED', refunded_at = now()
        where order_id = $1 and status = 'CHARGED' returning *`,
      [req.params.orderId],
    );
    // Idempotente: si no había cobro (o ya se reembolsó) no hay nada que compensar.
    res.json({ status: rows[0] ? 'REFUNDED' : 'NOTHING_TO_COMPENSATE', payment: rows[0] ?? null });
  }),
);

listen(app, PORT, 'orders');
