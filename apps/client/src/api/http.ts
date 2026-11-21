/**
 * Адрес API. В разработке — /api через прокси Vite на локальный сервер. В сборке — из VITE_API_URL;
 * если он не задан, сервера нет, и приложение работает как раньше: всё хранится только в браузере.
 */
export const API_URL: string | null = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : null);

/** Ответ сервера с ошибкой: статус и тело (сообщение для человека и, у 409, серверная версия мира). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { message?: string } & Record<string, unknown>,
  ) {
    super(body.message ?? `HTTP ${status}`);
  }
}

/** Сеть недоступна или сервер не отвечает. */
export class OfflineError extends Error {}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null; keepalive?: boolean } = {},
): Promise<T> {
  if (!API_URL) throw new OfflineError('API не настроен');
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      keepalive: options.keepalive,
    });
  } catch {
    throw new OfflineError('Нет связи с сервером');
  }
  // Прокси Vite отвечает 502/504, когда локальный сервер не запущен: для нас это тоже «нет связи».
  if (response.status === 502 || response.status === 503 || response.status === 504) throw new OfflineError('Сервер не отвечает');
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    // Nest кладёт текст ошибки в message, а для 409 мы передаём объект целиком.
    const body = typeof data.message === 'object' && data.message !== null ? (data.message as Record<string, unknown>) : data;
    throw new ApiError(response.status, body as ApiError['body']);
  }
  return data as T;
}
