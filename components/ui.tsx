"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { BRUSHES, SIZES, StrokeRenderer, loadStamps, type BrushId } from "@/lib/brush";
import { play } from "@/lib/sound";
import Icon, { type IconName } from "./Icon";

// Bảng màu đầy đủ (bảng vẽ tự do và nút "thêm màu").
export const ALL_COLORS = [
  "#1d1d1f", "#5b5b5b", "#9e9e9e", "#ffffff", "#7a4a2a", "#b5835a",
  "#e53935", "#ff6b81", "#ff9fb2", "#ff7a2f", "#ffa94d", "#ffd2a1",
  "#ffd23f", "#fff176", "#c6e65a", "#4caf50", "#26c281", "#a5e8c4",
  "#00bcd4", "#4fc3f7", "#b3e5fc", "#1e6fe8", "#5c6bc0", "#a3b4ff",
  "#8e44ad", "#b388ff", "#e1bee7", "#e056a0", "#f48fb1", "#ffe0ec",
];

export const BG_COLORS = ["#ffffff", "#fff8e1", "#fdecef", "#e8f5e9", "#e3f2fd", "#ede7f6", "#fff3e0", "#f5f5f5", "#fffde7", "#e0f7fa"];

export function IconButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  className = "",
  badge,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? "is-active" : ""} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => {
        play("tap");
        onClick?.();
      }}
    >
      <Icon name={icon} />
      {badge}
    </button>
  );
}

/** Hộp chọn trượt từ dưới lên; chạm ra ngoài để đóng. */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${wide ? "sheet-wide" : ""}`} role="dialog" aria-label={title}>
        {title && (
          <div className="sheet-head">
            <h3>{title}</h3>
            <button type="button" className="sheet-close" aria-label="Đóng" onClick={onClose}>
              <Icon name="close" size={22} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, children, className = "" }: { open: boolean; onClose?: () => void; children: ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => onClose && e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className}`} role="dialog">
        {children}
      </div>
    </div>
  );
}

export function Swatches({ colors, value, onChange, big }: { colors: string[]; value: string; onChange: (c: string) => void; big?: boolean }) {
  return (
    <div className={`swatches ${big ? "swatches-big" : ""}`}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${c.toLowerCase() === value.toLowerCase() ? "is-active" : ""}`}
          style={{ ["--c" as string]: c }}
          aria-label={`Màu ${c}`}
          onClick={() => {
            play("pop");
            onChange(c);
          }}
        />
      ))}
    </div>
  );
}

/** Màu tuỳ chọn bằng bộ chọn màu của trình duyệt (thay ColorPicker HSV của app gốc). */
export function CustomColor({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <label className="custom-color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>Tự chọn màu</span>
    </label>
  );
}

export function SizePicker({ value, onChange, color }: { value: number; onChange: (s: number) => void; color: string }) {
  return (
    <div className="sizes">
      {SIZES.map((s) => (
        <button
          key={s}
          type="button"
          className={`size-dot ${s === value ? "is-active" : ""}`}
          aria-label={`Cỡ ${s}`}
          onClick={() => {
            play("tap");
            onChange(s);
          }}
        >
          <span style={{ width: Math.max(4, s * 0.9), height: Math.max(4, s * 0.9), background: color }} />
        </button>
      ))}
    </div>
  );
}

/** Ô xem trước từng kiểu cọ: vẽ một đường lượn sóng bằng chính cọ đó. */
function BrushPreview({ brush, color }: { brush: BrushId; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    void loadStamps().then(() => {
      const c = ref.current;
      if (!alive || !c) return;
      const g = c.getContext("2d")!;
      g.clearRect(0, 0, c.width, c.height);
      const pts: number[] = [];
      const op = { kind: "stroke" as const, brush, color, size: 9, pts, seed: 7 };
      const r = new StrokeRenderer(g, op, 2);
      for (let i = 0; i <= 40; i++) {
        const x = 8 + i * 1.6;
        const y = 18 + Math.sin(i / 6.4) * 8;
        pts.push(x, y);
        r.add(x, y);
      }
      r.finish();
    });
    return () => {
      alive = false;
    };
  }, [brush, color]);
  return <canvas ref={ref} width={160} height={72} className="brush-preview" />;
}

export function BrushPicker({ value, onChange, color }: { value: BrushId; onChange: (b: BrushId) => void; color: string }) {
  return (
    <div className="brushes">
      {BRUSHES.map((b) => (
        <button
          key={b.id}
          type="button"
          className={`brush-item ${b.id === value ? "is-active" : ""}`}
          onClick={() => {
            play("tap");
            onChange(b.id);
          }}
        >
          <BrushPreview brush={b.id} color={color} />
          <span>{b.title}</span>
        </button>
      ))}
    </div>
  );
}

export function Stars({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${n} sao`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < n ? "on" : ""}>
          <Icon name="star" size={size} stroke={1.6} fill="currentColor" />
        </span>
      ))}
    </span>
  );
}

export function Toast({ text }: { text: string | null }) {
  return <div className={`toast ${text ? "show" : ""}`}>{text}</div>;
}
