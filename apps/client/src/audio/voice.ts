import { create } from 'zustand';

/**
 * Голос — средствами браузера, бесплатно:
 * - распознавание речи — Web Speech API (SpeechRecognition): в Chrome и Edge звук распознают серверы Google/Microsoft,
 *   в Safari — Apple; в Firefox его нет, и кнопки микрофона там нет;
 * - ответ вслух — speechSynthesis голосами, установленными в системе (или сетевыми голосами браузера).
 * Ответ модели приходит потоком, поэтому озвучиваем его по предложениям: первое звучит, пока остальные ещё пишутся.
 */

// --- Настройки --------------------------------------------------------------------------------------------

export interface VoiceSettings {
  /** Отвечать голосом. */
  reply: boolean;
  /** Выбранный голос (voiceURI) или null — подобрать самим под тело персонажа. */
  voice: string | null;
  /** Скорость речи. */
  rate: number;
}

const KEY = 'interna.voice';
export const RATE_MIN = 0.8;
export const RATE_MAX = 1.4;

function stored(): VoiceSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<VoiceSettings>;
    return {
      reply: raw.reply === true,
      voice: typeof raw.voice === 'string' ? raw.voice : null,
      rate: typeof raw.rate === 'number' && raw.rate >= RATE_MIN && raw.rate <= RATE_MAX ? raw.rate : 1,
    };
  } catch {
    return { reply: false, voice: null, rate: 1 };
  }
}

export const useVoiceStore = create<VoiceSettings & { set: (patch: Partial<VoiceSettings>) => void }>()((set, get) => ({
  ...stored(),
  set: (patch) => {
    set(patch);
    const { reply, voice, rate } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ reply, voice, rate }));
    } catch {
      // Приватный режим без хранилища — настройки живут до перезагрузки.
    }
    if (patch.reply === false) stopSpeaking();
  },
}));

// --- Голоса -----------------------------------------------------------------------------------------------

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

const FEMALE = /svetlana|irina|milena|ekaterina|dari|alena|alyona|anna|elena|katya|tatyana|polina|female|жен|google русский/i;
const MALE = /dmitr|pavel|yuri|maxim|nikolai|male|муж/i;

/** Русские голоса браузера; список может появиться не сразу (Chrome грузит его асинхронно). */
export function russianVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  return speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('ru'));
}

/** Подписаться на появление и смену списка голосов. */
export function onVoicesChanged(callback: () => void) {
  if (!canSpeak()) return () => undefined;
  speechSynthesis.addEventListener('voiceschanged', callback);
  return () => speechSynthesis.removeEventListener('voiceschanged', callback);
}

/** Голос для персонажа: выбранный в настройках, иначе — русский голос подходящего пола, «естественные» — первыми. */
export function pickVoice(body: 'female' | 'male'): SpeechSynthesisVoice | null {
  const voices = russianVoices();
  const chosen = useVoiceStore.getState().voice;
  const exact = chosen && voices.find((voice) => voice.voiceURI === chosen);
  if (exact) return exact;
  const score = (voice: SpeechSynthesisVoice) => {
    const name = voice.name;
    let points = 0;
    if ((body === 'female' ? FEMALE : MALE).test(name)) points += 4;
    else if ((body === 'female' ? MALE : FEMALE).test(name)) points -= 4;
    if (/natural|online|neural|premium|enhanced/i.test(name)) points += 2;
    if (voice.localService) points += 1;
    return points;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
}

// --- Речь -------------------------------------------------------------------------------------------------

/** Конец предложения: знак препинания (и закрывающие кавычки/скобки) и пробел, или перевод строки. */
const SENTENCE_END = /[.!?…]+["»)\]]*\s+|\n+/g;

/** То, что читать вслух не нужно: эмодзи и разметка. */
function forSpeech(text: string) {
  return text
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[*_~`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SpeechStream {
  /** Весь текст ответа на сейчас — договорённые до конца предложения куски уходят в очередь. */
  feed: (textSoFar: string) => void;
  /** Ответ закончен: договорить остаток. */
  end: (fullText: string) => void;
  /** Замолчать. */
  cancel: () => void;
}

interface StreamHandlers {
  body: 'female' | 'male';
  /** Начал звучать следующий кусок: text — всё, что сказано к этому моменту (для реплики над головой). */
  onProgress?: (spoken: string) => void;
  /** Всё сказано (или голос недоступен / прервали — тогда spoken может быть неполным). */
  onDone?: (finished: boolean) => void;
}

let current: { cancel: () => void } | null = null;

/** Замолчать сейчас же (новый ответ, нажали микрофон, выключили голос). */
export function stopSpeaking() {
  current?.cancel();
  current = null;
  if (canSpeak()) speechSynthesis.cancel();
}

/**
 * Начать озвучивать ответ, который ещё пишется. Предыдущая речь прерывается.
 * Каждый кусок — отдельная фраза: так Chrome не обрывает длинную речь на 15-й секунде, а первое предложение
 * звучит сразу, не дожидаясь всего ответа.
 */
export function speakStream({ body, onProgress, onDone }: StreamHandlers): SpeechStream {
  stopSpeaking();
  const queue: string[] = [];
  let taken = 0;
  let spoken = '';
  let ended = false;
  let speaking = false;
  let finished = false;
  let watchdog = 0;

  const finish = (complete: boolean) => {
    if (finished) return;
    finished = true;
    window.clearTimeout(watchdog);
    if (current === handle) current = null;
    onDone?.(complete);
  };

  const next = () => {
    if (finished) return;
    const chunk = queue.shift();
    if (chunk === undefined) {
      speaking = false;
      if (ended) finish(true);
      return;
    }
    const text = forSpeech(chunk);
    if (!text) {
      spoken += chunk;
      next();
      return;
    }
    speaking = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    const voice = pickVoice(body);
    if (voice) utterance.voice = voice;
    utterance.rate = useVoiceStore.getState().rate;
    let done = false;
    const advance = () => {
      if (done) return;
      done = true;
      window.clearTimeout(watchdog);
      next();
    };
    utterance.onstart = () => {
      spoken += chunk;
      onProgress?.(spoken.trim());
    };
    utterance.onend = advance;
    utterance.onerror = (event) => {
      // Прервали сами (cancel) — молчим; иначе пробуем следующий кусок.
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      if (!spoken.endsWith(chunk)) spoken += chunk;
      advance();
    };
    // Бывает, что браузер не присылает onend (известная беда Chrome) — не зависаем навсегда.
    watchdog = window.setTimeout(() => {
      if (!spoken.endsWith(chunk)) spoken += chunk;
      advance();
    }, 4_000 + (text.length * 160) / utterance.rate);
    speechSynthesis.speak(utterance);
  };

  const take = (text: string, all: boolean) => {
    let end = taken;
    if (all) end = text.length;
    else for (const match of text.matchAll(SENTENCE_END)) if (match.index + match[0].length > taken) end = match.index + match[0].length;
    if (end <= taken) return;
    // Кусок до каждого конца предложения — отдельной фразой.
    const piece = text.slice(taken, end);
    taken = end;
    const parts = piece.split(/(?<=[.!?…]["»)\]]*\s+|\n+)/);
    for (const part of parts) if (part) queue.push(part);
    if (!speaking) next();
  };

  const handle = {
    feed: (textSoFar: string) => !finished && !ended && take(textSoFar, false),
    end: (fullText: string) => {
      if (finished || ended) return;
      take(fullText, true);
      ended = true;
      if (!speaking && queue.length === 0) finish(true);
    },
    cancel: () => {
      queue.length = 0;
      speechSynthesis.cancel();
      finish(false);
    },
  };

  if (!canSpeak()) {
    // Голоса нет — сразу «договорили».
    return { feed: () => undefined, end: () => onDone?.(false), cancel: () => undefined };
  }
  current = handle;
  return handle;
}

/** Сказать готовую фразу целиком (тихие минуты, рассказ после перерыва). */
export function speakText(text: string, handlers: StreamHandlers) {
  const stream = speakStream(handlers);
  stream.end(text);
  return stream;
}

/**
 * iOS Safari разрешает речь только после того, как первая фраза прозвучала в ответ на нажатие.
 * Вызывается из обработчиков нажатий (отправить, микрофон, включить голос): пустая беззвучная фраза «открывает» голос.
 */
let unlocked = false;
export function unlockSpeech() {
  if (unlocked || !canSpeak()) return;
  unlocked = true;
  const utterance = new SpeechSynthesisUtterance(' ');
  utterance.volume = 0;
  speechSynthesis.speak(utterance);
}

// --- Распознавание ----------------------------------------------------------------------------------------

/** Минимум того, что нам нужно от SpeechRecognition (в стандартных типах DOM его нет). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionClass() !== null;

export interface ListenHandlers {
  /** Распознанный на сейчас текст (промежуточный — пока говорите). */
  onText: (text: string) => void;
  /** Слушать закончили: text — итог (может быть пустым). */
  onEnd: (text: string) => void;
  /** Понятная ошибка (нет доступа к микрофону, нет связи). */
  onError: (message: string) => void;
}

const LISTEN_ERRORS: Record<string, string> = {
  'not-allowed': 'Нет доступа к микрофону — разрешите его для этого сайта в настройках браузера.',
  'service-not-allowed': 'Браузер не разрешает распознавание речи на этой странице.',
  'audio-capture': 'Микрофон не найден.',
  network: 'Распознавание речи недоступно: нет связи с сервисом браузера.',
  'language-not-supported': 'Браузер не умеет распознавать русскую речь.',
};

/** Начать слушать. Возвращает функцию «хватит» — после неё придёт onEnd с итоговым текстом. */
export function startListening(handlers: ListenHandlers): { stop: () => void; abort: () => void } {
  const Recognition = recognitionClass();
  if (!Recognition) {
    handlers.onError('Этот браузер не умеет распознавать речь — попробуйте Chrome, Edge или Safari.');
    return { stop: () => undefined, abort: () => undefined };
  }
  // Пока вы говорите, персонаж молчит.
  stopSpeaking();
  const recognition = new Recognition();
  recognition.lang = 'ru-RU';
  recognition.continuous = true;
  recognition.interimResults = true;
  let text = '';
  let aborted = false;
  recognition.onresult = (event) => {
    text = Array.from(event.results, (result) => result[0]?.transcript ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    handlers.onText(text);
  };
  recognition.onerror = (event) => {
    // no-speech — просто промолчали; aborted — отменили сами.
    const message = LISTEN_ERRORS[event.error];
    if (message) handlers.onError(message);
  };
  recognition.onend = () => handlers.onEnd(aborted ? '' : text);
  try {
    recognition.start();
  } catch {
    handlers.onError('Не получилось включить микрофон — попробуйте ещё раз.');
    handlers.onEnd('');
  }
  return {
    stop: () => recognition.stop(),
    abort: () => {
      aborted = true;
      recognition.abort();
    },
  };
}
