// Hiệu ứng âm thanh tổng hợp bằng WebAudio (không cần file âm thanh) và rung nhẹ.
import { getPrefs } from "./prefs";

export type Sfx = "tap" | "pop" | "step" | "success" | "erase" | "fill" | "page";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.18, slide = 0) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ac.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

export function play(sfx: Sfx) {
  if (!getPrefs().sound) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  switch (sfx) {
    case "tap":
      tone(ac, 660, t, 0.07, "triangle", 0.12);
      break;
    case "pop":
      tone(ac, 520 + Math.random() * 380, t, 0.09, "sine", 0.1, 1.6);
      break;
    case "page":
      tone(ac, 420, t, 0.12, "triangle", 0.1, 1.5);
      break;
    case "erase":
      tone(ac, 300, t, 0.1, "sawtooth", 0.04, 0.6);
      break;
    case "fill":
      tone(ac, 380, t, 0.18, "sine", 0.16, 2.2);
      break;
    case "step":
      [784, 988, 1175].forEach((f, i) => tone(ac, f, t + i * 0.07, 0.16, "triangle", 0.14));
      break;
    case "success":
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ac, f, t + i * 0.1, 0.3, "triangle", 0.15));
      break;
  }
}

export function vibrate(ms = 15) {
  if (!getPrefs().vibration) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* không hỗ trợ */
  }
}
