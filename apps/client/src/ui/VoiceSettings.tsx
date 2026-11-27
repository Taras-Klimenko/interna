import { useEffect, useState } from 'react';
import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';
import {
  RATE_MAX,
  RATE_MIN,
  canListen,
  canSpeak,
  onVoicesChanged,
  pickVoice,
  russianVoices,
  speakText,
  unlockSpeech,
  useVoiceStore,
} from '../audio/voice';

/** Голос персонажа в настройках ⚙: отвечать вслух, каким голосом и как быстро. */
export function VoiceSettings() {
  const reply = useVoiceStore((s) => s.reply);
  const voice = useVoiceStore((s) => s.voice);
  const rate = useVoiceStore((s) => s.rate);
  const setVoice = useVoiceStore((s) => s.set);
  const body = useWorldStore((s) => s.world.character.appearance.body);
  const name = useWorldStore((s) => s.world.character.name.trim()) || DEFAULT_CHARACTER_NAME;
  // Список голосов браузер отдаёт не сразу — перерисовываемся, когда он появится.
  const [voices, setVoices] = useState(russianVoices);
  useEffect(() => onVoicesChanged(() => setVoices(russianVoices())), []);

  if (!canSpeak()) {
    return (
      <section>
        <h3 className="settings-heading">Голос</h3>
        <p className="settings-note">Этот браузер не умеет говорить вслух.</p>
      </section>
    );
  }

  const auto = pickVoice(body);
  const listen = () => {
    unlockSpeech();
    speakText(`Привет! Я ${name}. Вот так звучит мой голос.`, { body });
  };

  return (
    <section>
      <h3 className="settings-heading">Голос</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={reply}
          onChange={(e) => {
            unlockSpeech();
            setVoice({ reply: e.target.checked });
          }}
        />
        Отвечать голосом
      </label>
      {voices.length === 0 ? (
        <p className="settings-note">Русских голосов в системе не нашлось — будет говорить голосом по умолчанию, может быть с акцентом.</p>
      ) : (
        <label className="settings-row settings-voice">
          <span>Голос</span>
          <select value={voice ?? ''} onChange={(e) => setVoice({ voice: e.target.value || null })} aria-label="Голос персонажа">
            <option value="">Авто{auto && !voice ? ` (${shortName(auto.name)})` : ''}</option>
            {voices.map((item) => (
              <option key={item.voiceURI} value={item.voiceURI}>
                {shortName(item.name)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="settings-row">
        <span>Скорость</span>
        <input
          type="range"
          min={RATE_MIN}
          max={RATE_MAX}
          step={0.05}
          value={rate}
          onChange={(e) => setVoice({ rate: Number(e.target.value) })}
          aria-label="Скорость речи"
        />
      </label>
      <button type="button" className="chip chip-small" onClick={listen}>
        ▶ Послушать
      </button>
      <p className="settings-note">
        Голоса — из браузера и системы.
        {canListen() && ' Микрофон в чате: речь распознаёт браузер (в Chrome и Edge — сервисы Google и Microsoft, в Safari — Apple).'}
      </p>
    </section>
  );
}

/** «Microsoft Svetlana Online (Natural) - Russian (Russia)» → «Microsoft Svetlana Online (Natural)». */
function shortName(name: string) {
  return name.replace(/\s+-\s+.*$/, '');
}
