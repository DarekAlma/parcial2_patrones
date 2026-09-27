import { useQuery } from '@apollo/client';
import { useEffect, useRef } from 'react';
import type { User } from '../App';
import { errorMessage, money, STATUS_LABEL, STEP_LABEL } from '../format';
import { MY_ORDERS, ORDER_DETAIL } from '../graphql';

type OrderSummary = {
  id: string;
  status: string;
  searchKey: string;
  travelers: number;
  totalCop: number;
  simulateFailure: string;
  failureReason: string | null;
  createdAt: string;
};
type SagaStep = { step: string; action: string; status: string; detail: Record<string, unknown> | null; at: string };
type OrderDetail = OrderSummary & {
  flightTotalCop: number;
  hotelTotalCop: number;
  carTotalCop: number;
  paymentStatus: string | null;
  invoiceNumber: string | null;
  flight: { airline: string; departTime: string; arriveTime: string; stops: number } | null;
  hotel: { name: string; stars: number | null } | null;
  car: { model: string; provider: string | null } | null;
  saga: { status: string; flowRunUrl: string | null; startedAt: string; finishedAt: string | null; steps: SagaStep[] } | null;
};

const IN_PROGRESS = ['PENDING', 'PROCESSING'];

type Props = { user: User | null; focusId: string | null; onFocus: (id: string) => void; onNeedAuth: () => void };

export function OrdersPage({ user, focusId, onFocus, onNeedAuth }: Props) {
  const { data, error, refetch } = useQuery<{ myOrders: OrderSummary[] }>(MY_ORDERS, { skip: !user });
  const orders = data?.myOrders ?? [];
  const selected = focusId ?? orders[0]?.id ?? null;

  if (!user) {
    return (
      <div className="page empty">
        Inicia sesión para ver tus reservas.{' '}
        <button className="link" onClick={onNeedAuth}>
          Iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="page orders-layout">
      <section className="order-list">
        <header className="row-between">
          <h2>Mis reservas</h2>
          <button className="ghost" onClick={() => refetch()}>
            Actualizar
          </button>
        </header>
        {error && <p className="error">{errorMessage(error)}</p>}
        {!orders.length && <p className="muted">Todavía no has reservado paquetes.</p>}
        {orders.map((o) => (
          <button key={o.id} className={o.id === selected ? 'order-item selected' : 'order-item'} onClick={() => onFocus(o.id)}>
            <span className={`badge ${o.status.toLowerCase()}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
            <strong>{o.searchKey.split('-').slice(0, 2).join(' → ')}</strong>
            <span className="muted tiny">
              {money(o.totalCop)} · {new Date(o.createdAt).toLocaleString('es-CO')}
              {o.simulateFailure !== 'NONE' ? ` · 🧪 ${o.simulateFailure}` : ''}
            </span>
          </button>
        ))}
      </section>
      {selected && <OrderDetailPanel id={selected} onFinished={() => refetch()} />}
    </div>
  );
}

function OrderDetailPanel({ id, onFinished }: { id: string; onFinished: () => void }) {
  const { data, error, startPolling, stopPolling } = useQuery<{ order: OrderDetail | null }>(ORDER_DETAIL, {
    variables: { id },
    fetchPolicy: 'network-only',
  });
  const order = data?.order;
  const running = !order || IN_PROGRESS.includes(order.status) || order.saga?.status === 'RUNNING';

  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  // Mientras la SAGA corre, se consulta el estado cada segundo (polling GraphQL).
  useEffect(() => {
    if (running) startPolling(1000);
    else {
      stopPolling();
      finishedRef.current();
    }
    return () => stopPolling();
  }, [running, startPolling, stopPolling]);

  if (error) return <p className="error">{errorMessage(error)}</p>;
  if (!order) return <p className="muted">Cargando orden…</p>;

  return (
    <section className="order-detail">
      <header className="row-between">
        <div>
          <h2>
            Orden <code>{order.id.slice(0, 8)}</code>
          </h2>
          <span className={`badge big ${order.status.toLowerCase()}`}>{STATUS_LABEL[order.status] ?? order.status}</span>
          {order.invoiceNumber && <span className="invoice">Factura {order.invoiceNumber}</span>}
        </div>
        {order.saga?.flowRunUrl && (
          <a className="ghost" href={order.saga.flowRunUrl} target="_blank" rel="noreferrer">
            Ver flow en Prefect ↗
          </a>
        )}
      </header>

      {order.failureReason && <p className="callout warn">{order.failureReason}</p>}

      <div className="items">
        <div>
          <span className="muted tiny">Vuelo</span>
          <strong>{order.flight?.airline ?? '—'}</strong>
          <span>{order.flight ? `${order.flight.departTime} → ${order.flight.arriveTime}` : ''}</span>
          <span>{money(order.flightTotalCop)}</span>
        </div>
        <div>
          <span className="muted tiny">Hotel</span>
          <strong>{order.hotel?.name ?? '—'}</strong>
          <span>{order.hotel?.stars ? `${order.hotel.stars} estrellas` : ''}</span>
          <span>{money(order.hotelTotalCop)}</span>
        </div>
        <div>
          <span className="muted tiny">Auto</span>
          <strong>{order.car?.model ?? '—'}</strong>
          <span>{order.car?.provider ?? ''}</span>
          <span>{money(order.carTotalCop)}</span>
        </div>
        <div>
          <span className="muted tiny">Total · pago</span>
          <strong>{money(order.totalCop)}</strong>
          <span>{order.paymentStatus ?? 'sin cobro'}</span>
          <span>{order.travelers} viajero(s)</span>
        </div>
      </div>

      <h3>Línea de tiempo de la SAGA</h3>
      <ol className="timeline">
        {(order.saga?.steps ?? []).map((s, i) => (
          <li key={i} className={`step ${s.action.toLowerCase()} ${s.status.toLowerCase()}`}>
            <span className="dot" />
            <div>
              <strong>
                {s.action === 'COMPENSATE' ? '↩ Compensar ' : ''}
                {STEP_LABEL[s.step] ?? s.step}
              </strong>{' '}
              <span className="step-status">{stepStatus(s)}</span>
              <div className="muted tiny">
                {new Date(s.at).toLocaleTimeString('es-CO')}
                {describe(s)}
              </div>
            </div>
          </li>
        ))}
        {running && <li className="step running pulse">⏳ Orquestador trabajando…</li>}
      </ol>
    </section>
  );
}

function stepStatus(s: SagaStep) {
  const attempt = Number(s.detail?.attempt ?? 1);
  if (s.status === 'RUNNING') return attempt > 1 ? `reintento ${attempt - 1}` : 'en curso';
  return { SUCCESS: 'ok', FAILED: 'falló', COMPENSATED: 'compensado' }[s.status] ?? s.status;
}

function describe(s: SagaStep) {
  const d = s.detail ?? {};
  if (s.status === 'FAILED') return ` · ${String(d.message ?? d.error ?? d.type ?? '')}`;
  if (s.status === 'COMPENSATED') return ` · ${String(d.status ?? '')}${d.released ? ` (liberado: ${d.released})` : ''}`;
  if (s.status === 'SUCCESS' && d.remaining !== undefined) return ` · inventario restante: ${String(d.remaining)}`;
  if (s.status === 'SUCCESS' && d.invoice) return ` · factura ${String(d.invoice)}`;
  return '';
}
