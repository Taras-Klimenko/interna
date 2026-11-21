import { create } from 'zustand';
import { API_URL, ApiError, OfflineError, api } from '../api/http';

export interface AccountUser {
  id: string;
  name: string;
}

/**
 * disabled — сервера нет (сборка без VITE_API_URL), всё живёт в браузере, как раньше;
 * checking — проверяем сохранённый вход; signed-out — нужен инвайт-код; local — решили пока без входа;
 * signed-in — вошли, мир синхронизируется с сервером.
 */
export type AccountStatus = 'disabled' | 'checking' | 'signed-out' | 'local' | 'signed-in';

const SESSION_KEY = 'interna.session';

interface SavedSession {
  token: string;
  user: AccountUser;
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: SavedSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Без localStorage вход просто не запомнится.
  }
}

interface AccountStore {
  status: AccountStatus;
  token: string | null;
  user: AccountUser | null;
  /** Проверить сохранённый вход при запуске. */
  init: () => Promise<void>;
  /** Вход по инвайт-коду. Ошибку (текст для человека) бросает наружу. */
  login: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Сессия больше не действует (сервер ответил 401): просим войти снова. */
  expire: () => void;
  /** Пока без входа: комната живёт только в этом браузере. */
  continueLocally: () => void;
  /** Передумали — снова показать вход. */
  showLogin: () => void;
}

export const useAccountStore = create<AccountStore>()((set, get) => ({
  status: API_URL ? 'checking' : 'disabled',
  token: null,
  user: null,

  init: async () => {
    if (!API_URL) return;
    const saved = loadSession();
    if (!saved) {
      set({ status: 'signed-out' });
      return;
    }
    // Сразу считаем, что вошли: если сервер недоступен, комната работает локально и синхронизируется позже.
    set({ status: 'signed-in', token: saved.token, user: saved.user });
    try {
      const user = await api<AccountUser>('/me', { token: saved.token });
      set({ user });
      saveSession({ token: saved.token, user });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) get().expire();
      else if (!(error instanceof OfflineError)) console.warn('Не удалось проверить вход', error);
    }
  },

  login: async (code) => {
    const result = await api<SavedSession>('/auth/login', { method: 'POST', body: { code } });
    saveSession(result);
    set({ status: 'signed-in', token: result.token, user: result.user });
  },

  logout: async () => {
    const { token } = get();
    saveSession(null);
    set({ status: 'signed-out', token: null, user: null });
    if (token) await api('/auth/logout', { method: 'POST', token }).catch(() => undefined);
  },

  expire: () => {
    saveSession(null);
    set({ status: 'signed-out', token: null, user: null });
  },

  continueLocally: () => set({ status: 'local' }),
  showLogin: () => set({ status: 'signed-out' }),
}));
