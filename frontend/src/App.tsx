import { useMutation, useQuery } from '@apollo/client';
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
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🧭</span>
          <div>
            <strong>WanderSync</strong>
            <small>Travel Solutions</small>
          </div>
        </div>
        <nav className="tabs" aria-label="Secciones">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="session">
          {user ? (
            <>
              <span className="user-chip" title={user.email}>
                {user.fullName}
              </span>
              <button className="ghost" onClick={signOut}>
                Salir
              </button>
            </>
          ) : (
            <button className="primary" onClick={() => setAuthOpen(true)}>
              Iniciar sesión
            </button>
          )}
        </div>
      </header>

      <main className="content">
        {tab === 'packages' && <PackagesPage user={user} onNeedAuth={() => setAuthOpen(true)} onBooked={openOrder} />}
        {tab === 'orders' && <OrdersPage user={user} focusId={focusOrder} onFocus={setFocusOrder} onNeedAuth={() => setAuthOpen(true)} />}
        {tab === 'ingestion' && <IngestionPage user={user} onNeedAuth={() => setAuthOpen(true)} />}
      </main>

      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      <Inspector />
    </div>
  );
}
