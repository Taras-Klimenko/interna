import { useState, type FormEvent } from 'react';
import { ApiError, OfflineError } from '../api/http';
import { useAccountStore } from '../store/accountStore';

/** Вход по инвайт-коду поверх комнаты. Можно и не входить: тогда комната живёт только в этом браузере. */
export function LoginScreen() {
  const status = useAccountStore((s) => s.status);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'signed-out') return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await useAccountStore.getState().login(code.trim());
    } catch (err) {
      setError(
        err instanceof OfflineError
          ? 'Сервер сейчас недоступен. Можно продолжить без входа и войти позже.'
          : err instanceof ApiError
            ? (err.body.message ?? 'Не получилось войти')
            : 'Не получилось войти',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-backdrop">
      <form className="login" onSubmit={(e) => void onSubmit(e)} aria-labelledby="login-title">
        <h1 id="login-title" className="login-title">
          Interna
        </h1>
        <p className="login-text">Уютная комната с вашими вещами и тем, кто в ней живёт. Чтобы комната была с вами на любом устройстве, войдите по инвайт-коду.</p>
        <input
          className="login-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          aria-label="Инвайт-код"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          autoFocus
        />
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="book-submit login-submit" disabled={busy || !code.trim()}>
          {busy ? 'Вхожу…' : 'Войти'}
        </button>
        <button type="button" className="login-skip" onClick={() => useAccountStore.getState().continueLocally()}>
          Пока без входа — комната сохранится только в этом браузере
        </button>
      </form>
    </div>
  );
}
