import { ChevronDown, ChevronUp, Braces } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OperationEntry, subscribeOperations } from '../apollo';

// Panel flotante que muestra cada operación GraphQL que sale del navegador:
// evidencia en vivo de que el frontend consume SOLO el API GraphQL y de qué
// campos exactos pide (sin over-fetching).
export function Inspector() {
  const [open, setOpen] = useState(false);
  const [ops, setOps] = useState<OperationEntry[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeOperations(setOps);
    return () => {
      unsubscribe();
    };
  }, []);
  const current = ops.find((o) => o.id === selected) ?? ops[0];

  return (
    <aside className={open ? 'inspector open' : 'inspector'}>
      <button className="inspector-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Braces size={15} aria-hidden="true" /> GraphQL · {ops.length} ops
        {open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}
      </button>
      {open && (
        <div className="inspector-body">
          <ul className="op-list">
            {ops.map((op) => (
              <li key={op.id}>
                <button className={current?.id === op.id ? 'op active' : 'op'} onClick={() => setSelected(op.id)}>
                  <span className={`op-kind ${op.kind}`}>{op.kind === 'mutation' ? 'M' : 'Q'}</span>
                  <span className="op-name">{op.name}</span>
                  <span className="op-meta">
                    {op.ms} ms · {(op.bytes / 1024).toFixed(1)} KB{op.errors ? ` · ${op.errors} err` : ''}
                  </span>
                </button>
              </li>
            ))}
            {!ops.length && <li className="muted">Aún no hay operaciones.</li>}
          </ul>
          {current && (
            <div className="op-detail">
              <div className="muted">POST /graphql · {current.at}</div>
              <pre>{current.query}</pre>
              {Object.keys(current.variables).length > 0 && (
                <pre className="vars">{JSON.stringify(current.variables, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
