import { useApolloClient, useMutation } from '@apollo/client';
import { X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../format';
import { LOGIN, REGISTER } from '../graphql';

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', fullName: '', password: '' });
  const [login, loginState] = useMutation(LOGIN);
  const [register, registerState] = useMutation(REGISTER);
  const client = useApolloClient();
  const first = useRef<HTMLInputElement>(null);
  const error = loginState.error || registerState.error;
  const loading = loginState.loading || registerState.loading;

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

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
    <div className="backdrop" onClick={onClose}>
      <form className="card-form" role="dialog" aria-modal="true" aria-labelledby="auth-title" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn on-paper close" onClick={onClose} aria-label="Cerrar">
          <X size={18} />
        </button>
        <h2 id="auth-title">{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        {mode === 'register' && (
          <label className="typed-field">
            <span className="field-label">Nombre completo</span>
            <input ref={first} value={form.fullName} onChange={set('fullName')} required minLength={2} autoComplete="name" />
          </label>
        )}
        <label className="typed-field">
          <span className="field-label">Correo</span>
          <input ref={mode === 'login' ? first : undefined} type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label className="typed-field">
          <span className="field-label">Contraseña</span>
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
        <button className="btn-issue" disabled={loading}>
          {loading ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Registrarme'}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </form>
    </div>
  );
}
