import { useApolloClient, useMutation } from '@apollo/client';
import { FormEvent, useState } from 'react';
import { errorMessage } from '../format';
import { LOGIN, REGISTER } from '../graphql';

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', fullName: '', password: '' });
  const [login, loginState] = useMutation(LOGIN);
  const [register, registerState] = useMutation(REGISTER);
  const client = useApolloClient();
  const error = loginState.error || registerState.error;
  const loading = loginState.loading || registerState.loading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await login({ variables: { email: form.email, password: form.password } });
      } else {
        await register({ variables: { input: form } });
      }
      // La sesión cambió (nuevo id regenerado): se recargan las consultas.
      await client.resetStore();
      onClose();
    } catch {
      /* el error se muestra desde el estado de la mutación */
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <div className="backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <form className="dialog" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        {mode === 'register' && (
          <label>
            Nombre completo
            <input value={form.fullName} onChange={set('fullName')} required minLength={2} autoComplete="name" />
          </label>
        )}
        <label>
          Correo
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={mode === 'register' ? 10 : 1}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {mode === 'register' && <p className="hint">Mínimo 10 caracteres, con letras y números. Se guarda con Argon2id.</p>}
        {error && <p className="error">{errorMessage(error)}</p>}
        <button className="primary block" disabled={loading}>
          {loading ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Registrarme'}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </form>
    </div>
  );
}
