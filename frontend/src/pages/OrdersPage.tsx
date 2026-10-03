import { useQuery } from '@apollo/client';
import { BedDouble, Car as CarIcon, CreditCard, ExternalLink, Plane, ReceiptText, RefreshCw, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { User } from '../App';
import { Guilloche, Microprint, Stamp, StampTone } from '../components/Paper';
import { amount, clock, DESTINATION_NAME, errorMessage, humanReason, money, orderCode, STEP_LABEL } from '../format';
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
const FAILURE_LABEL: Record<string, string> = { FLIGHT: 'vuelo', HOTEL: 'hotel', CAR: 'auto', PAYMENT: 'pago' };

/** Sello general del bono según el estado de la orden. */
function orderStamp(status: string): { label: string; tone: StampTone } {
  if (status === 'CONFIRMED') return { label: 'Confirmado', tone: 'ok' };
  if (status === 'COMPENSATED') return { label: 'Anulado', tone: 'void' };
  if (status === 'FAILED') return { label: 'Fallido', tone: 'fail' };
  return { label: 'En trámite', tone: 'pending' };
}

/** Sello de cada talón: el último evento de ese paso en la bitácora de la SAGA. */
function stepStamp(steps: SagaStep[], step: string): { label: string; tone: StampTone; note?: string } | null {
  const events = steps.filter((s) => s.step === step);
  const last = events[events.length - 1];
  if (!last) return null;
  const okLabel = step === 'PAYMENT' ? 'Pagado' : step === 'CONFIRMATION' ? 'Facturado' : 'Reservado';
  if (last.status === 'COMPENSATED') return { label: 'Anulado', tone: 'void', note: step === 'PAYMENT' ? 'reembolsado' : 'compensado' };
  if (last.status === 'FAILED') return { label: 'Falló', tone: 'fail' };
  if (last.status === 'SUCCESS') return { label: okLabel, tone: 'ok' };
  const attempt = Number(last.detail?.attempt ?? 1);
  return { label: last.action === 'COMPENSATE' ? 'Anulando' : 'En trámite', tone: 'pending', note: attempt > 1 ? `reintento ${attempt - 1}` : undefined };
}

type Props = { user: User | null; focusId: string | null; onFocus: (id: string) => void; onNeedAuth: () => void };

export function OrdersPage({ user, focusId, onFocus, onNeedAuth }: Props) {
  const { data, error, refetch, loading } = useQuery<{ myOrders: OrderSummary[] }>(MY_ORDERS, { skip: !user });
  const orders = data?.myOrders ?? [];
  const selected = focusId ?? orders[0]?.id ?? null;

  if (!user) {
    return (
      <div className="page">
        <div className="empty-sheet">
          <h2>Tus bonos aparecen aquí</h2>
          <p>Inicia sesión para ver las reservas emitidas y seguir su SAGA paso a paso.</p>
          <button className="btn-issue inline" onClick={onNeedAuth}>
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page orders-layout">
      <section className="file-drawer" aria-label="Bonos emitidos">
        <header className="drawer-head">
          <h2>Mis reservas</h2>
          <button className="icon-btn on-paper" onClick={() => refetch()} aria-label="Actualizar" title="Actualizar">
            <RefreshCw size={16} strokeWidth={1.8} />
          </button>
        </header>
        {error && <p className="error">{errorMessage(error)}</p>}
        {!loading && !orders.length && <p className="dim drawer-empty">Aún no has emitido bonos. Arma tu primer paquete.</p>}
        <ol className="drawer-list">
          {orders.map((o) => {
            const s = orderStamp(o.status);
            const dest = o.searchKey.split('-')[1];
            return (
              <li key={o.id}>
                <button className={o.id === selected ? 'filed selected' : 'filed'} onClick={() => onFocus(o.id)} aria-current={o.id === selected}>
                  <span className="filed-code">{orderCode(o.searchKey, o.id)}</span>
                  <span className="filed-dest">
                    BOG → {DESTINATION_NAME[dest] ?? dest}
                  </span>
                  <span className="filed-meta">
                    {money(o.totalCop)} · {new Date(o.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <span className={`filed-status tone-${s.tone}`}>
                    {s.label}
                    {o.simulateFailure !== 'NONE' && <span className="demo-tag">demo: falla {FAILURE_LABEL[o.simulateFailure]}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      {selected && <IssuedVoucher id={selected} onFinished={() => refetch()} />}
    </div>
  );
}

function IssuedVoucher({ id, onFinished }: { id: string; onFinished: () => void }) {
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
  if (!order) return <div className="issued loading-sheet">Cargando bono…</div>;

  const steps = order.saga?.steps ?? [];
  const big = orderStamp(order.status);
  const voided = order.status === 'COMPENSATED' || order.status === 'FAILED';
  const dest = order.searchKey.split('-')[1];
  const stubs = [
    { step: 'FLIGHT', kind: 'flight', Icon: Plane, title: order.flight?.airline ?? '—', detail: order.flight ? `${order.flight.departTime} → ${order.flight.arriveTime}` : '', value: order.flightTotalCop },
    { step: 'HOTEL', kind: 'hotel', Icon: BedDouble, title: order.hotel?.name ?? '—', detail: order.hotel?.stars ? `${order.hotel.stars} estrellas` : '1 habitación', value: order.hotelTotalCop },
    { step: 'CAR', kind: 'car', Icon: CarIcon, title: order.car?.model ?? '—', detail: order.car?.provider ?? '', value: order.carTotalCop },
    { step: 'PAYMENT', kind: 'pay', Icon: CreditCard, title: 'Pago', detail: order.paymentStatus === 'REFUNDED' ? 'reembolsado' : order.paymentStatus === 'CHARGED' ? 'cobrado' : 'sin cobro', value: order.totalCop },
  ];

  return (
    <section className="issued" aria-label="Bono emitido">
      <article className="voucher issued-voucher">
        <Guilloche className="voucher-guilloche" />
        <header className="voucher-head">
          <div>
            <span className="voucher-title">Bono de viaje</span>
            <span className="voucher-agency">BOG → {DESTINATION_NAME[dest] ?? dest} · {order.travelers} viajero(s)</span>
          </div>
          <span className="serial">Nº {orderCode(order.searchKey, order.id)}</span>
        </header>
        <Microprint />

        <div className="stubs issued-stubs">
          {stubs.map(({ step, kind, Icon, title, detail, value }) => {
            let st = stepStamp(steps, step);
            // Si la SAGA terminó sin cobro, el talón de pago lo dice con su propio sello.
            if (step === 'PAYMENT' && voided && order.paymentStatus !== 'CHARGED') {
              st = { label: order.paymentStatus === 'REFUNDED' ? 'Reembolsado' : 'Sin cobro', tone: 'void' };
            }
            const struck = st?.tone === 'void' || st?.tone === 'fail' || (voided && step === 'PAYMENT');
            return (
              <div key={step} className={`stub static tint-${kind} ${struck ? 'voided' : ''}`}>
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" className="stub-icon" />
                <span className="stub-body">
                  <span className="field-label">{STEP_LABEL[step]}</span>
                  <strong>{title}</strong>
                  <span className="typed small">{detail}</span>
                </span>
                <span className="stub-value">{money(value)}</span>
                <span className="stub-stamp">{st && <Stamp key={`${st.label}-${st.note}`} label={st.label} tone={st.tone} size="sm" note={st.note} />}</span>
              </div>
            );
          })}
        </div>

        <div className="big-stamp-slot">
          <Stamp key={big.label} label={big.label} tone={big.tone} size="lg" note={order.status === 'COMPENSATED' ? 'SAGA compensada' : order.invoiceNumber ? `Factura ${order.invoiceNumber}` : undefined} />
        </div>

        {order.failureReason && <p className="voucher-remark">Observación: {humanReason(order.failureReason)}</p>}

        <footer className="issued-foot">
          {voided ? (
            <div>
              <span className="field-label">Anulado · paquete de {money(order.totalCop)}</span>
              <span className="total-figure small void-figure">
                <span className="currency">$</span>0 <span className="figure-note">cobrado</span>
              </span>
            </div>
          ) : (
            <div>
              <span className="field-label">{order.status === 'CONFIRMED' ? 'Total cobrado' : 'Total'}</span>
              <span className="total-figure small">
                <span className="currency">$</span>
                {amount(order.totalCop)}
              </span>
            </div>
          )}
          {order.saga?.flowRunUrl && (
            <a className="btn-ghost" href={order.saga.flowRunUrl} target="_blank" rel="noreferrer">
              Ver flow en Prefect <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
        </footer>
      </article>

      <section className="logbook" aria-label="Bitácora de la SAGA">
        <header className="logbook-head">
          <h3>Bitácora de emisión</h3>
          <span className="dim">Orquestación SAGA · reintentos y compensaciones en orden inverso</span>
        </header>
        <ol className="log-lines" aria-live="polite">
          {steps.map((s, i) => (
            <li key={i} className={`log-line ${s.action === 'COMPENSATE' ? 'comp' : ''} st-${s.status.toLowerCase()}`}>
              <span className="log-time">{clock(s.at)}</span>
              <span className="log-step">
                {s.action === 'COMPENSATE' ? <RotateCcw size={13} aria-hidden="true" /> : s.step === 'CONFIRMATION' ? <ReceiptText size={13} aria-hidden="true" /> : null}
                {s.action === 'COMPENSATE' ? 'Compensar ' : ''}
                {STEP_LABEL[s.step] ?? s.step}
              </span>
              <span className="log-status">{statusText(s)}</span>
              <span className="log-detail">{describe(s)}</span>
            </li>
          ))}
          {running && <li className="log-line typing">Orquestador trabajando<span className="caret" aria-hidden="true" /></li>}
        </ol>
      </section>
    </section>
  );
}

function statusText(s: SagaStep) {
  const attempt = Number(s.detail?.attempt ?? 1);
  if (s.status === 'RUNNING') return attempt > 1 ? `reintento ${attempt - 1}` : 'en curso';
  return { SUCCESS: 'ok', FAILED: 'falló', COMPENSATED: 'compensado' }[s.status] ?? s.status.toLowerCase();
}

function describe(s: SagaStep) {
  const d = s.detail ?? {};
  if (s.status === 'FAILED') return humanReason(String(d.message ?? d.error ?? d.type ?? ''));
  if (s.status === 'COMPENSATED') return `${humanReason(String(d.status ?? ''))}${d.released ? ` · ${String(d.released)} liberado(s)` : ''}`;
  if (s.status === 'SUCCESS' && d.remaining !== undefined) return `inventario restante ${String(d.remaining)}`;
  if (s.status === 'SUCCESS' && d.invoice) return `factura ${String(d.invoice)}`;
  return '';
}
