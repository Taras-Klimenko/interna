import { useEffect, useState } from 'react';
import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';
import { useAccountStore } from '../store/accountStore';
import { useSyncStore } from '../api/worldSync';
import { useChatStore } from '../store/chatStore';
import { ROOM_TEMPLATES } from '../store/roomTemplates';
import { CharacterEditor } from './CharacterEditor';
import { PersonalityFields } from './PersonalityFields';

type Step = 'welcome' | 'room' | 'look' | 'about' | 'done';

/** Сколько висит приветствие над головой, если сервер разговоров недоступен. */
const LOCAL_GREETING_MS = 9_000;

/**
 * Знакомство для нового человека: выбрать комнату, внешность, имя и характер персонажа — и он здоровается.
 * Показывается, пока у мира не стоит onboarded (у миров из прежних версий оно ставится само — им не показываем).
 * Если вы вошли, ждём первой сверки с сервером: на другом устройстве знакомство уже могло быть пройдено.
 */
export function Onboarding() {
  const onboarded = useWorldStore((s) => s.world.onboarded);
  const account = useAccountStore((s) => s.status);
  const sync = useSyncStore((s) => s.state);
  const [step, setStep] = useState<Step>('welcome');

  const ready = account === 'local' || account === 'disabled' || (account === 'signed-in' && sync !== 'idle');
  if (onboarded !== false || !ready) return null;

  if (step === 'look') {
    return (
      <CharacterEditor
        title="Кто будет жить с вами"
        subtitle="Шаг 2 из 3 · внешность можно поменять потом — в панели персонажа"
        footer={
          <>
            <button type="button" className="onboarding-back" onClick={() => setStep('room')}>
              Назад
            </button>
            <button type="button" className="book-submit" onClick={() => setStep('about')}>
              Дальше
            </button>
          </>
        }
      />
    );
  }

  if (step === 'welcome') {
    return (
      <div className="onboarding-backdrop">
        <div className="onboarding-card" role="dialog" aria-labelledby="onboarding-title">
          <h1 id="onboarding-title" className="login-title">
            Interna
          </h1>
          <p className="login-text">
            Уютная комната с вашими вещами — книгами, музыкой, фотографиями — и тем, кто в ней живёт. Сначала обставим комнату и
            познакомимся: это пара минут.
          </p>
          <button type="button" className="book-submit login-submit" onClick={() => setStep('room')}>
            Начать
          </button>
        </div>
      </div>
    );
  }

  if (step === 'done') return <Done onFinish={() => setStep('welcome')} />;

  // Комната и характер — в боковой панели: комната за ней видна и меняется сразу.
  return (
    <aside className="sheet onboarding-sheet" aria-label="Знакомство">
      <header className="sheet-header">
        <div>
          <h2 className="sheet-title">{step === 'room' ? 'Какая будет комната' : 'Имя и характер'}</h2>
          <p className="sheet-subtitle">{step === 'room' ? 'Шаг 1 из 3 · всё можно переставить потом' : 'Шаг 3 из 3'}</p>
        </div>
      </header>
      <div className="sheet-body">{step === 'room' ? <RoomChoice /> : <PersonalityFields />}</div>
      <div className="onboarding-actions">
        <button type="button" className="onboarding-back" onClick={() => setStep(step === 'room' ? 'welcome' : 'look')}>
          Назад
        </button>
        <button type="button" className="book-submit" onClick={() => setStep(step === 'room' ? 'look' : 'done')}>
          Дальше
        </button>
      </div>
    </aside>
  );
}

/** Шаблоны комнат: выбранный сразу появляется за панелью. */
function RoomChoice() {
  const applyTemplate = useWorldStore((s) => s.applyTemplate);
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <ul className="template-list">
      {ROOM_TEMPLATES.map((template) => (
        <li key={template.id}>
          <button
            type="button"
            className="template"
            aria-pressed={chosen === template.id}
            onClick={() => {
              setChosen(template.id);
              applyTemplate(template.id);
            }}
          >
            <span className="template-label">{template.label}</span>
            <span className="template-description">{template.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Последний шаг: что можно делать в комнате — и персонаж здоровается. */
function Done({ onFinish }: { onFinish: () => void }) {
  const name = useWorldStore((s) => s.world.character.name.trim()) || DEFAULT_CHARACTER_NAME;
  // Разговоры работают только после входа по инвайт-коду.
  const signedIn = useAccountStore((s) => s.status === 'signed-in');

  const finish = () => {
    useWorldStore.getState().setOnboarded();
    onFinish();
    void greet(name);
  };

  // Enter — «В комнату».
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Enter' && finish();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card" role="dialog" aria-labelledby="onboarding-done">
        <h2 id="onboarding-done" className="login-title">
          Готово!
        </h2>
        <ul className="onboarding-tips">
          <li>Нажмите на предмет — лампу, растение, шкаф, колонку, рамку, — чтобы что-то с ним сделать.</li>
          <li>
            {signedIn
              ? `Поговорите: кнопка «Поговорить» или клик по персонажу. ${name} помнит, что вы рассказываете, и знает, что стоит в комнате.`
              : 'Разговаривать с персонажем можно после входа по инвайт-коду — ссылка «Войти» вверху слева.'}
          </li>
          <li>«Обставить» — переставить мебель и добавить новую. На полку можно поставить свои книги, в колонку — музыку.</li>
          <li>🌼 «Гулять» — прогулка по полю за домом.</li>
        </ul>
        <button type="button" className="book-submit login-submit" onClick={finish}>
          В комнату
        </button>
      </div>
    </div>
  );
}

/** Первое приветствие: если разговоры работают — его пишет модель, иначе — короткая фраза над головой. */
async function greet(name: string) {
  const chat = useChatStore.getState();
  await chat.ensureLoaded();
  if (useChatStore.getState().status === 'ready' && (await useChatStore.getState().react([{ type: 'meeting' }], 'Знакомство'))) return;
  useChatStore.getState().say(`Привет! Я ${name}. Похоже, теперь это наш общий дом.`, LOCAL_GREETING_MS);
}
