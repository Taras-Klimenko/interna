import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { characterBody } from './player';
import { useChatStore } from '../store/chatStore';

/** Над головой персонажа (рост модели около 1,7 м). */
const BUBBLE_HEIGHT = 2.05;

/** Реплика персонажа над его головой: пока он отвечает и ещё несколько секунд после. */
export function SpeechBubble() {
  const bubble = useChatStore((s) => s.bubble);
  const group = useRef<Group>(null);
  const [, rerender] = useState(0);

  // Реплика провисела своё — прячем.
  useEffect(() => {
    if (!bubble || !Number.isFinite(bubble.until)) return;
    const id = window.setTimeout(() => {
      if (useChatStore.getState().bubble === bubble) useChatStore.setState({ bubble: null });
      rerender((n) => n + 1);
    }, Math.max(0, bubble.until - Date.now()));
    return () => window.clearTimeout(id);
  }, [bubble]);

  useFrame(() => {
    group.current?.position.set(characterBody.x, BUBBLE_HEIGHT, characterBody.z);
  });

  if (!bubble) return null;
  return (
    <group ref={group} position={[characterBody.x, BUBBLE_HEIGHT, characterBody.z]}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="speech-bubble" data-thinking={!bubble.text}>
          {bubble.text || <span className="speech-dots" aria-label="думает">•••</span>}
        </div>
      </Html>
    </group>
  );
}
