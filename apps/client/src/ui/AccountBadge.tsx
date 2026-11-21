import { useAccountStore } from '../store/accountStore';
import { useSyncStore, type SyncState } from '../api/worldSync';

const SYNC_LABELS: Record<SyncState, string> = {
  idle: 'сверяю с сервером…',
  saving: 'сохраняю…',
  saved: 'сохранено на сервере',
  offline: 'нет связи — сохраняю в браузере',
};

/** Под названием: где сейчас хранится комната, и вход/выход. */
export function AccountBadge() {
  const status = useAccountStore((s) => s.status);
  const sync = useSyncStore((s) => s.state);

  if (status === 'disabled' || status === 'checking' || status === 'signed-out') return null;

  if (status === 'local') {
    return (
      <div className="account">
        <span className="account-status">комната только в этом браузере</span>
        <button type="button" className="account-action" onClick={() => useAccountStore.getState().showLogin()}>
          Войти
        </button>
      </div>
    );
  }

  const onLogout = () => {
    if (window.confirm('Выйти? Комната останется на сервере, а в этом браузере — её последняя копия.')) {
      void useAccountStore.getState().logout();
    }
  };

  return (
    <div className="account">
      <span className="account-status" data-sync={sync}>
        {SYNC_LABELS[sync]}
      </span>
      <button type="button" className="account-action" onClick={onLogout}>
        Выйти
      </button>
    </div>
  );
}
