import { useMutation, useQuery } from '@apollo/client';
import { Fragment, useState } from 'react';
import type { User } from '../App';
import { errorMessage, STATUS_LABEL, timeAgo } from '../format';
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

const SOURCE = { flights: 'Vuelos', hotels: 'Hoteles', cars: 'Autos' } as Record<string, string>;

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
      <section className="ingestion-head">
        <div>
          <h2>Ingesta distribuida · Dask + Prefect</h2>
          <p className="muted">
            Cada corrida lanza 12 tareas de scraping (3 fuentes × 4 destinos) sobre los workers de Dask, con reintentos
            configurados en Prefect. La tabla se actualiza sola cada 4 s.
          </p>
          {links && (
            <div className="links">
              <a href={links.prefectUrl} target="_blank" rel="noreferrer">Prefect UI ↗</a>
              <a href={links.daskDashboardUrl} target="_blank" rel="noreferrer">Dask Dashboard ↗</a>
              <a href={links.graphqlUrl} target="_blank" rel="noreferrer">Apollo Sandbox ↗</a>
            </div>
          )}
        </div>
        <div className="trigger">
          <label>
            🧪 Tasa de fallos de red simulados: <b>{Math.round(chaos * 100)}%</b>
            <input type="range" min={0} max={0.6} step={0.1} value={chaos} onChange={(e) => setChaos(Number(e.target.value))} />
          </label>
          <button className="primary block" onClick={run} disabled={triggerState.loading}>
            {triggerState.loading ? 'Disparando…' : 'Ejecutar ingesta ahora'}
          </button>
          {triggerState.data && (
            <a href={triggerState.data.triggerIngestion.flowRunUrl} target="_blank" rel="noreferrer">
              Ver {triggerState.data.triggerIngestion.flowRunName} en Prefect ↗
            </a>
          )}
          {triggerState.error && <p className="error">{errorMessage(triggerState.error)}</p>}
        </div>
      </section>

      {error && <p className="error">{errorMessage(error)}</p>}
      <table className="runs">
        <thead>
          <tr>
            <th>Corrida</th>
            <th>Estado</th>
            <th>Vuelos</th>
            <th>Hoteles</th>
            <th>Autos</th>
            <th>Fallidas</th>
            <th>Caos</th>
            <th>Inicio</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <Fragment key={r.id}>
              <tr className="clickable" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <td>{r.flowRunName}</td>
                <td>
                  <span className={`badge ${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                </td>
                <td>{r.flights}</td>
                <td>{r.hotels}</td>
                <td>{r.cars}</td>
                <td>{r.failedTasks}</td>
                <td>{Math.round(r.chaosFailRate * 100)}%</td>
                <td>{timeAgo(r.startedAt)}</td>
                <td>
                  <a href={r.flowRunUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    Prefect ↗
                  </a>
                </td>
              </tr>
              {expanded === r.id && (
                <tr className="run-detail">
                  <td colSpan={9}>
                    {r.detail?.length ? (
                      <div className="task-grid">
                        {r.detail.map((d, i) => (
                          <div key={i} className={d.status === 'OK' ? 'task ok' : 'task failed'}>
                            <strong>
                              {SOURCE[d.source] ?? d.source} · {d.destination}
                            </strong>
                            {d.status === 'OK' ? (
                              <span>
                                {d.raw} crudos → {d.saved} guardados
                                <br />
                                <span className="muted tiny">
                                  scraping: {d.scrape_worker} · carga: {d.load_worker}
                                </span>
                              </span>
                            ) : (
                              <span className="tiny">{d.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">La corrida sigue en ejecución…</span>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!runs.length && (
            <tr>
              <td colSpan={9} className="muted">
                Sin corridas registradas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
