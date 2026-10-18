"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BrushId } from "@/lib/brush";
import { ui } from "@/lib/manifest";
import { play } from "@/lib/sound";

// Bảng màu đầy đủ (bảng vẽ, màu nền) — các màu tươi gần với ColorRecyclerAdapter của app gốc.
export const ALL_COLORS = [
  "#000000", "#5b5b5b", "#9e9e9e", "#ffffff", "#7a4a2a", "#b5835a",
  "#e53935", "#ff6b81", "#ff9fb2", "#ff7a2f", "#ffa94d", "#ffd2a1",
  "#ffd23f", "#fff176", "#c6e65a", "#4caf50", "#26c281", "#a5e8c4",
  "#00bcd4", "#5cbdff", "#b3e5fc", "#1e6fe8", "#5c6bc0", "#a3b4ff",
  "#8e44ad", "#b388ff", "#e1bee7", "#e056a0", "#f48fb1", "#ffe0ec",
];

export const BG_COLORS = [
  "#ffffff", "#fff8e1", "#fdecef", "#e8f5e9", "#e3f2fd",
  "#ede7f6", "#fff3e0", "#f5f5f5", "#fffde7", "#e0f7fa",
  "#ffe0b2", "#f8bbd0", "#c8e6c9", "#bbdefb", "#d1c4e9",
];

/** Cỡ cọ (nhãn ic_line_N của app gốc = độ dày theo đơn vị thế giới). */
export const LINE_SIZES = [3, 5, 7, 9, 12, 15, 18, 21, 25, 30, 37, 45];

/** 6 kiểu cọ của dialog_paint_style, theo thứ tự V = 0…5. */
export const PAINT_STYLES: { id: BrushId; title: string }[] = [
  { id: "pen", title: "Bút chì" },
  { id: "crayon", title: "Sáp màu" },
  { id: "marker", title: "Sáp mềm" },
  { id: "nib", title: "Bút lông dẹt" },
  { id: "fountain", title: "Bút máy" },
  { id: "air", title: "Cọ phun" },
];

export function Img({ name, alt = "", className, style }: { name: string; alt?: string; className?: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={ui(name)} alt={alt} className={className} style={style} draggable={false} />;
}

/** Nút ảnh của app gốc (icon thường / icon _sel khi đang chọn). */
export function ImgButton({
  icon,
  label,
  onClick,
  sel,
  disabled,
  className = "",
}: {
  icon: string;
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  sel?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`img-btn ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={sel}
      disabled={disabled}
      onClick={(e) => {
        play("tap");
        onClick?.(e);
      }}
    >
      <Img name={sel ? `${icon}_sel` : icon} />
    </button>
  );
}

/** Tâm ngang (px) của nút vừa bấm, để đặt mũi tên của bong bóng. */
export const anchorOf = (e: React.MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return r.left + r.width / 2;
};

/** Bong bóng bật lên phía trên thanh công cụ (BubbleLinearLayout của app gốc). */
export function Bubble({ anchor, width, onClose, children, bottom = 74 }: { anchor: number; width: number; onClose: () => void; children: ReactNode; bottom?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const vw = typeof window === "undefined" ? 400 : window.innerWidth;
  const w = Math.min(width, vw - 16);
  const left = Math.max(8, Math.min(vw - w - 8, anchor - w / 2));
  const arrow = Math.max(18, Math.min(w - 18, anchor - left));
  return (
    <div className="bubble-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bubble" role="dialog" style={{ left, width: w, bottom: `calc(${bottom}px + var(--safe-b))` }}>
        {children}
        <span className="bubble-arrow" style={{ left: arrow }} />
      </div>
    </div>
  );
}

export function SizeList({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  return (
    <div className="size-list">
      {LINE_SIZES.map((n) => (
        <button
          key={n}
          type="button"
          className={`size-row ${n === value ? "is-active" : ""}`}
          aria-label={`Cỡ ${n}`}
          onClick={() => {
            play("tap");
            onChange(n);
          }}
        >
          <Img name={n === value ? `ic_line_deep_${n}` : `ic_line_${n}`} />
          <span className="size-num">{n}</span>
        </button>
      ))}
    </div>
  );
}

export function StyleList({ value, onChange }: { value: BrushId; onChange: (b: BrushId) => void }) {
  return (
    <div className="style-list">
      {PAINT_STYLES.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className={`style-row ${s.id === value ? "is-active" : ""}`}
          aria-label={s.title}
          onClick={() => {
            play("tap");
            onChange(s.id);
          }}
        >
          <Img name={`ic_paint_style_${i + 1}`} className="style-sample" />
          <span className="style-logo">
            <Img name={`ic_style_${i + 1}_logo`} />
          </span>
        </button>
      ))}
    </div>
  );
}

/** Hàng màu tròn 45px viền #cecec8, màu đang chọn có chấm xám giữa (item_recyclerview). */
export function PaletteRow({ colors, value, onChange, className = "" }: { colors: string[]; value: string | null; onChange: (c: string) => void; className?: string }) {
  return (
    <div className={`palette ${className}`}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className="color-dot"
          style={{ background: c }}
          aria-label={`Màu ${c}`}
          aria-pressed={value?.toLowerCase() === c.toLowerCase()}
          onClick={() => {
            play("pop");
            onChange(c);
          }}
        >
          {value?.toLowerCase() === c.toLowerCase() && <span className="chosen" />}
        </button>
      ))}
    </div>
  );
}

export function StarsImg({ n, className = "stars-img" }: { n: number; className?: string }) {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return <Img name={`ic_star_${k}`} alt={`${k} sao`} className={className} />;
}

/** CircleProgressBar 20dp màu xanh ngọc của thẻ tranh. */
export function CircleProgress({ pct }: { pct: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg className="circle-progress" viewBox="0 0 20 20" aria-label={`${pct}%`}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="#a2fad1" strokeWidth="2" />
      <circle cx="10" cy="10" r={r} fill="none" stroke="#04d49c" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 10 10)" />
    </svg>
  );
}

export function Modal({ open, onClose, children, className = "" }: { open: boolean; onClose?: () => void; children: ReactNode; className?: string }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => onClose && e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className}`} role="dialog">
        {children}
      </div>
    </div>
  );
}

/** Hộp hỏi kiểu dialog_exit: câu hỏi và hai nút chữ xanh. */
export function Confirm({ open, text, ok, cancel = "Thôi", onOk, onCancel }: { open: boolean; text: string; ok: string; cancel?: string; onOk: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} className="confirm">
      <p>{text}</p>
      <div className="confirm-actions">
        <button type="button" onClick={onCancel}>
          {cancel}
        </button>
        <button type="button" onClick={onOk}>
          {ok}
        </button>
      </div>
    </Modal>
  );
}

export function Toast({ text }: { text: string | null }) {
  return <div className={`toast ${text ? "show" : ""}`}>{text}</div>;
}

export function useToast() {
  const [text, setText] = useState<string | null>(null);
  const flash = (t: string) => {
    setText(t);
    window.setTimeout(() => setText((x) => (x === t ? null : x)), 2200);
  };
  return [text, flash] as const;
}

// ---------------- Bộ chọn màu (holocolorpicker: vòng màu + thanh đậm nhạt + thanh độ trong) ----------------

type Hsv = { h: number; s: number; v: number; a: number };

function hexToHsv(hex: string): Hsv {
  const m = hex.replace("#", "");
  const n = (i: number) => parseInt(m.slice(i, i + 2), 16) / 255;
  const r = n(0), g = n(2), b = n(4);
  const a = m.length >= 8 ? parseInt(m.slice(6, 8), 16) / 255 : 1;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((h * 60) + 360) % 360, s: max ? d / max : 0, v: max, a };
}

function hsvToHex({ h, s, v, a }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const x = (u: number) => Math.round(u * 255).toString(16).padStart(2, "0");
  return `#${x(f(5))}${x(f(3))}${x(f(1))}${a < 0.995 ? x(a) : ""}`;
}

/** Vị trí 0–1 trên thanh đậm nhạt (SVBar): trái trắng → giữa màu thuần → phải đen. */
const svPos = (c: Hsv) => (c.v >= 0.999 ? c.s / 2 : 0.5 + (1 - c.v) / 2);
const fromSvPos = (p: number): Pick<Hsv, "s" | "v"> => (p <= 0.5 ? { s: p * 2, v: 1 } : { s: 1, v: 1 - (p - 0.5) * 2 });

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [c, setC] = useState<Hsv>(() => hexToHsv(value));
  const old = useRef(value);
  const ring = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ring.current;
    if (!cv) return;
    const g = cv.getContext("2d")!;
    const S = cv.width, R = S / 2;
    g.clearRect(0, 0, S, S);
    const grad = g.createConicGradient(-Math.PI / 2, R, R);
    for (let i = 0; i <= 12; i++) grad.addColorStop(i / 12, `hsl(${i * 30}, 100%, 50%)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.arc(R, R, R - 26, 0, Math.PI * 2, true);
    g.fill();
  }, []);

  const set = (next: Hsv) => {
    setC(next);
    onChange(hsvToHex(next));
  };
  const pure = hsvToHex({ h: c.h, s: 1, v: 1, a: 1 });
  const solid = hsvToHex({ ...c, a: 1 });

  const onRing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    const h = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
    set({ ...c, h, s: c.s || 1, v: c.v || 1 });
  };
  const bar = (fn: (p: number) => void) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.getBoundingClientRect();
    fn(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };
  const ang = ((c.h - 90) * Math.PI) / 180;

  return (
    <div className="color-picker">
      <div className="cp-ring">
        <canvas ref={ring} width={360} height={360} onPointerDown={onRing} onPointerMove={onRing} />
        <span className="cp-knob" style={{ left: `${50 + Math.cos(ang) * 46.4}%`, top: `${50 + Math.sin(ang) * 46.4}%`, background: pure }} />
        <button type="button" className="cp-center" aria-label="Dùng lại màu cũ" onClick={() => set(hexToHsv(old.current))}>
          <span style={{ background: old.current }} />
          <span style={{ background: hsvToHex(c) }} />
        </button>
      </div>
      <label className="cp-label">Đậm nhạt</label>
      <div className="cp-bar" style={{ background: `linear-gradient(90deg, #fff, ${pure}, #000)` }} onPointerDown={bar((p) => set({ ...c, ...fromSvPos(p) }))} onPointerMove={bar((p) => set({ ...c, ...fromSvPos(p) }))}>
        <span className="cp-thumb" style={{ left: `${svPos(c) * 100}%`, background: solid }} />
      </div>
      <label className="cp-label">Độ trong</label>
      <div className="cp-bar cp-alpha" onPointerDown={bar((a) => set({ ...c, a: Math.max(0.05, a) }))} onPointerMove={bar((a) => set({ ...c, a: Math.max(0.05, a) }))}>
        <span className="cp-fill" style={{ background: `linear-gradient(90deg, transparent, ${solid})` }} />
        <span className="cp-thumb" style={{ left: `${c.a * 100}%`, background: hsvToHex(c) }} />
      </div>
    </div>
  );
}
