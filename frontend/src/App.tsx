import { useMutation, useQuery } from '@apollo/client';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { AuthDialog } from './components/AuthDialog';
import { Inspector } from './components/Inspector';
import { LOGOUT, ME } from './graphql';
import { IngestionPage } from './pages/IngestionPage';
import { OrdersPage } from './pages/OrdersPage';
import { PackagesPage } from './pages/PackagesPage';

export type Tab = 'packages' | 'orders' | 'ingestion';
export type User = { id: string; email: string; fullName: string };

const TABS: { id: Tab; label: string }[] = [
  { id: 'packages', label: 'Armar paquete' },
  { id: 'orders', label: 'Mis reservas' },
  { id: 'ingestion', label: 'Ingesta de datos' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('packages');
  const [authOpen, setAuthOpen] = useState(false);
  const [focusOrder, setFocusOrder] = useState<string | null>(null);
  const { data, client } = useQuery<{ me: User | null }>(ME);
  const [logout] = useMutation(LOGOUT);
  const user = data?.me ?? null;

  async function signOut() {
    await logout();
    await client.resetStore();
  }

  function openOrder(id: string) {
    setFocusOrder(id);
    setTab('orders');
  }

  return (
    <div className="shell" data-tab={tab}>
      <header className="jacket">
        <div className="jacket-row">
          <div className="letterhead">
            <svg className="letterhead-mark" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M5 23 L16 7 L27 23" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
              <circle cx="16" cy="25" r="2.6" className="letterhead-dot" />
            </svg>
            <div>
              <strong>WanderSync</strong>
              <span>Travel Solutions · Agencia de viajes · Bogotá</span>
            </div>
          </div>
          <div className="session">
            {user ? (
              <>
                <span className="traveler" title={user.email}>
                  <span className="traveler-label">Viajero</span>
                  {user.fullName}
                </span>
                <button className="icon-btn" onClick={signOut} aria-label="Cerrar sesión" title="Cerrar sesión">
                  <LogOut size={18} strokeWidth={1.8} />
                </button>
              </>
            ) : (
              <button className="btn-paper" onClick={() => setAuthOpen(true)}>
                Iniciar sesión
              </button>
            )}
          </div>
        </div>
        <nav className="folder-tabs" aria-label="Secciones">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'folder-tab active' : 'folder-tab'}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="desk">
        {tab === 'packages' && <PackagesPage user={user} onNeedAuth={() => setAuthOpen(true)} onBooked={openOrder} />}
        {tab === 'orders' && (
          <OrdersPage user={user} focusId={focusOrder} onFocus={setFocusOrder} onNeedAuth={() => setAuthOpen(true)} />
        )}
        {tab === 'ingestion' && <IngestionPage user={user} onNeedAuth={() => setAuthOpen(true)} />}
      </main>

      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      <Inspector />
    </div>
  );
}
