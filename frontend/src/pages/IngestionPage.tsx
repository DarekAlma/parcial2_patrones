import { useMutation, useQuery } from '@apollo/client';
import { BedDouble, Car as CarIcon, ChevronDown, ExternalLink, Plane } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { User } from '../App';
import { Guilloche, Stamp, StampTone } from '../components/Paper';
import { DESTINATION_NAME, errorMessage, STATUS_LABEL, timeAgo } from '../format';
import { INGESTION_RUNS, TRIGGER_INGESTION } from '../graphql';

type TaskDetail = {
  source: string;
  destination: string;
  status: string;
  saved: number;
  raw?: number;
  scrape_worker?: string;
  load_worker?: string;
  error?: string;
};
type Run = {
  id: string;
  flowRunName: string | null;
  status: string;
  chaosFailRate: number;
  flights: number;
  hotels: number;
  cars: number;
  failedTasks: number;
  detail: TaskDetail[] | null;
  startedAt: string;
  finishedAt: string | null;
  flowRunUrl: string;
};
type Links = { prefectUrl: string; daskDashboardUrl: string; graphqlUrl: string };

const SOURCE = {
  flights: { label: 'Vuelos', Icon: Plane },
  hotels: { label: 'Hoteles', Icon: BedDouble },
  cars: { label: 'Autos', Icon: CarIcon },
} as Record<string, { label: string; Icon: typeof Plane }>;

const RUN_TONE: Record<string, StampTone> = { COMPLETED: 'ok', PARTIAL: 'pending', FAILED: 'void', RUNNING: 'pending' };

export function IngestionPage({ user, onNeedAuth }: { user: User | null; onNeedAuth: () => void }) {
  const { data, error, refetch } = useQuery<{ ingestionRuns: Run[]; platformLinks: Links }>(INGESTION_RUNS, {
    pollInterval: 4000,
  });
  const [chaos, setChaos] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [trigger, triggerState] = useMutation<{ triggerIngestion: { flowRunUrl: string; flowRunName: string } }>(
    TRIGGER_INGESTION,
  );
  const runs = data?.ingestionRuns ?? [];
  const links = data?.platformLinks;

  async function run() {
    if (!user) return onNeedAuth();
    try {
      await trigger({ variables: { chaosFailRate: chaos } });
      setTimeout(() => refetch(), 2500);
    } catch {
      /* se muestra con triggerState.error */
    }
  }

  return (
    <div className="page">
      <section className="desk-head">
        <div className="desk-intro">
          <h1>Tarifario del día</h1>
          <p>
            Cada actualización lanza 12 extracciones (3 fuentes × 4 destinos) repartidas entre los workers de Dask y
            orquestadas por Prefect, con reintentos ante fallos de red. La lista se refresca sola cada 4 segundos.
          </p>
          {links && (
            <nav className="ext-links" aria-label="Paneles externos">
              <a href={links.prefectUrl} target="_blank" rel="noreferrer">
                Prefect UI <ExternalLink size={13} aria-hidden="true" />
              </a>
              <a href={links.daskDashboardUrl} target="_blank" rel="noreferrer">
                Dask Dashboard <ExternalLink size={13} aria-hidden="true" />
              </a>
              <a href={links.graphqlUrl} target="_blank" rel="noreferrer">
                Apollo Sandbox <ExternalLink size={13} aria-hidden="true" />
              </a>
            </nav>
          )}
        </div>

        <div className="work-order">
          <Guilloche variant="waves" className="work-order-guilloche" />
          <span className="voucher-title">Orden de actualización</span>
          <label className="chaos">
            <span className="field-label">Tasa de fallos de red simulados</span>
            <span className="chaos-value">{Math.round(chaos * 100)}%</span>
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.1}
              value={chaos}
              onChange={(e) => setChaos(Number(e.target.value))}
              aria-valuetext={`${Math.round(chaos * 100)} por ciento`}
            />
            <span className="typed small">Cada extracción falla con esta probabilidad antes de consultar la fuente; Prefect la reintenta hasta 3 veces.</span>
          </label>
          <button className="btn-issue" onClick={run} disabled={triggerState.loading}>
            {triggerState.loading ? 'Disparando…' : 'Ejecutar ingesta ahora'}
          </button>
          {triggerState.data && (
            <a className="btn-ghost" href={triggerState.data.triggerIngestion.flowRunUrl} target="_blank" rel="noreferrer">
              Ver {triggerState.data.triggerIngestion.flowRunName} en Prefect <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
          {triggerState.error && <p className="error">{errorMessage(triggerState.error)}</p>}
        </div>
      </section>

      {error && <p className="error">{errorMessage(error)}</p>}

      <section className="ledger" aria-label="Corridas de ingesta">
        <table>
          <thead>
            <tr>
              <th scope="col">Corrida</th>
              <th scope="col">Estado</th>
              <th scope="col" className="num">Vuelos</th>
              <th scope="col" className="num">Hoteles</th>
              <th scope="col" className="num">Autos</th>
              <th scope="col" className="num">Fallidas</th>
              <th scope="col" className="num">Caos</th>
              <th scope="col">Inicio</th>
              <th scope="col"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const open = expanded === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className={open ? 'open' : ''}>
                    <td>
                      <button className="row-toggle" onClick={() => setExpanded(open ? null : r.id)} aria-expanded={open}>
                        <ChevronDown size={15} aria-hidden="true" className="chev" />
                        <span className="typed">{r.flowRunName}</span>
                      </button>
                    </td>
                    <td>
                      <Stamp label={STATUS_LABEL[r.status] ?? r.status} tone={RUN_TONE[r.status] ?? 'pending'} size="sm" />
                    </td>
                    <td className="num">{r.flights}</td>
                    <td className="num">{r.hotels}</td>
                    <td className="num">{r.cars}</td>
                    <td className={`num ${r.failedTasks ? 'warn' : ''}`}>{r.failedTasks}</td>
                    <td className="num">{Math.round(r.chaosFailRate * 100)}%</td>
                    <td className="dim">{timeAgo(r.startedAt)}</td>
                    <td>
                      <a href={r.flowRunUrl} target="_blank" rel="noreferrer" className="table-link">
                        Prefect <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                  {open && (
                    <tr className="run-detail">
                      <td colSpan={9}>
                        {r.detail?.length ? (
                          <div className="slips">
                            {r.detail.map((d, i) => {
                              const meta = SOURCE[d.source] ?? { label: d.source, Icon: Plane };
                              return (
                                <div key={i} className={d.status === 'OK' ? 'slip' : 'slip failed'}>
                                  <span className="slip-head">
                                    <meta.Icon size={14} aria-hidden="true" /> {meta.label} · {DESTINATION_NAME[d.destination] ?? d.destination}
                                    <Stamp label={d.status === 'OK' ? 'OK' : 'Falló'} tone={d.status === 'OK' ? 'ok' : 'void'} size="sm" />
                                  </span>
                                  {d.status === 'OK' ? (
                                    <>
                                      <span className="slip-figure">
                                        {d.raw} → {d.saved}
                                        <small> crudos → guardados</small>
                                      </span>
                                      <span className="typed small">extrajo {d.scrape_worker}</span>
                                      <span className="typed small">cargó {d.load_worker}</span>
                                    </>
                                  ) : (
                                    <span className="typed small">{d.error}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="dim">La corrida sigue en ejecución…</span>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!runs.length && (
              <tr>
                <td colSpan={9} className="dim">
                  Sin corridas registradas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* En pantallas angostas cada corrida es una ficha apilada. */}
      <ol className="run-cards" aria-label="Corridas de ingesta">
        {runs.map((r) => {
          const open = expanded === r.id;
          return (
            <li key={r.id} className="run-card">
              <div className="run-card-head">
                <span className="typed">{r.flowRunName}</span>
                <Stamp label={STATUS_LABEL[r.status] ?? r.status} tone={RUN_TONE[r.status] ?? 'pending'} size="sm" />
              </div>
              <dl className="run-card-figures">
                <div><dt>Vuelos</dt><dd>{r.flights}</dd></div>
                <div><dt>Hoteles</dt><dd>{r.hotels}</dd></div>
                <div><dt>Autos</dt><dd>{r.cars}</dd></div>
                <div><dt>Fallidas</dt><dd className={r.failedTasks ? 'warn' : ''}>{r.failedTasks}</dd></div>
              </dl>
              <div className="run-card-foot">
                <span className="dim">{timeAgo(r.startedAt)} · caos {Math.round(r.chaosFailRate * 100)}%</span>
                <button className="row-toggle" onClick={() => setExpanded(open ? null : r.id)} aria-expanded={open}>
                  Workers <ChevronDown size={15} aria-hidden="true" className="chev" />
                </button>
                <a href={r.flowRunUrl} target="_blank" rel="noreferrer" className="table-link">
                  Prefect <ExternalLink size={12} aria-hidden="true" />
                </a>
              </div>
              {open && (
                <ul className="run-card-workers">
                  {(r.detail ?? []).map((d, i) => (
                    <li key={i} className={d.status === 'OK' ? '' : 'warn'}>
                      {(SOURCE[d.source]?.label ?? d.source)} · {DESTINATION_NAME[d.destination] ?? d.destination}:{' '}
                      {d.status === 'OK' ? `${d.saved} guardados · ${d.scrape_worker}` : 'falló'}
                    </li>
                  ))}
                  {!r.detail?.length && <li className="dim">La corrida sigue en ejecución…</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
