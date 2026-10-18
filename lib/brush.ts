// Các kiểu cọ — dựng lại từ DrawingBoardView của app gốc (trường V = kiểu cọ):
//   0 nét trơn · 1 sáp màu (đóng dấu mỗi size/2) · 2 bút dạ (alpha 127) ·
//   3 bút lông (đóng dấu mỗi 5px) · 4 bút máy (độ dày theo tốc độ) · 5 phun sơn (đóng dấu mỗi 5px)
// Toạ độ nét lưu theo "đơn vị thế giới"; lớp vẽ nhân thêm `scale` khi vẽ ra pixel.
import { asset } from "./manifest";

export type BrushId = "pen" | "crayon" | "marker" | "nib" | "fountain" | "air" | "eraser";

export type StrokeOp = { kind: "stroke"; brush: BrushId; color: string; size: number; pts: number[]; seed: number };
export type FillOp = { kind: "fill"; x: number; y: number; color: string };
export type ShapeId = "line" | "rect" | "ellipse" | "triangle" | "star" | "heart";
export type ShapeOp = { kind: "shape"; shape: ShapeId; color: string; size: number; filled: boolean; x0: number; y0: number; x1: number; y1: number };
export type Op = StrokeOp | FillOp | ShapeOp;

export type BrushInfo = { id: BrushId; title: string };
export const BRUSHES: BrushInfo[] = [
  { id: "pen", title: "Bút mực" },
  { id: "crayon", title: "Sáp màu" },
  { id: "marker", title: "Bút dạ" },
  { id: "nib", title: "Bút lông" },
  { id: "fountain", title: "Bút máy" },
  { id: "air", title: "Phun sơn" },
];

// Cỡ cọ (đơn vị thế giới). App gốc có 12 mức ic_line_3 … ic_line_45.
export const SIZES = [3, 5, 7, 9, 12, 15, 18, 21, 25, 30, 37, 45];

const STAMP_FILES = { crayon: "crayon", crayon2: "crayon2", nib: "nib", air: "air" } as const;
type StampName = keyof typeof STAMP_FILES;
const stampImages = new Map<StampName, HTMLImageElement>();
let stampsReady: Promise<void> | null = null;

export function loadStamps(): Promise<void> {
  if (!stampsReady) {
    stampsReady = Promise.all(
      (Object.keys(STAMP_FILES) as StampName[]).map(
        (name) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              stampImages.set(name, img);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = asset(`stamps/${STAMP_FILES[name]}.png`);
          }),
      ),
    ).then(() => undefined);
  }
  return stampsReady;
}

const tinted = new Map<string, HTMLCanvasElement>();
function tintedStamp(name: StampName, color: string): HTMLCanvasElement | null {
  const key = `${name}|${color}`;
  let c = tinted.get(key);
  if (c) return c;
  const img = stampImages.get(name);
  if (!img) return null;
  c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  if (tinted.size > 120) tinted.clear();
  tinted.set(key, c);
  return c;
}

/** Bộ sinh số ngẫu nhiên có hạt giống, để vẽ lại nét giống hệt khi hoàn tác. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

let scratch: HTMLCanvasElement | null = null;
function scratchCanvas(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  const g = scratch.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

/**
 * Vẽ một nét tăng dần: gọi `add` cho từng điểm mới, `finish` khi nhấc tay.
 * Bút dạ (bán trong suốt) được vẽ lên lớp tạm rồi mới ghép vào để chỗ chồng không đậm lên.
 */
export class StrokeRenderer {
  private n = 0;
  private carry = 0;
  private lastW = 0;
  private rand: () => number;
  private g: CanvasRenderingContext2D;
  private live: CanvasRenderingContext2D | null = null;

  constructor(
    private target: CanvasRenderingContext2D,
    private op: StrokeOp,
    private scale: number,
  ) {
    this.rand = rng(op.seed);
    if (op.brush === "marker") {
      this.live = scratchCanvas(target.canvas.width, target.canvas.height);
      this.g = this.live;
    } else {
      this.g = target;
    }
    this.g.save();
    this.g.setTransform(scale, 0, 0, scale, 0, 0);
    this.g.lineCap = "round";
    this.g.lineJoin = "round";
    this.g.strokeStyle = op.color;
    this.g.fillStyle = op.color;
    this.g.lineWidth = op.size;
    if (op.brush === "eraser") this.g.globalCompositeOperation = "destination-out";
  }

  /** Lớp tạm của bút dạ (để màn hình xem trước khi chưa nhấc tay). */
  get liveCanvas(): HTMLCanvasElement | null {
    return this.live?.canvas ?? null;
  }

  add(x: number, y: number) {
    const p = this.op.pts;
    // Điểm đã có sẵn trong op.pts (được push trước khi gọi add).
    this.n++;
    const i = this.n - 1;
    const b = this.op.brush;
    if (b === "pen" || b === "marker" || b === "eraser") {
      if (i === 0) return;
      const g = this.g;
      g.beginPath();
      if (i === 1) {
        g.moveTo(p[0], p[1]);
        g.lineTo((p[0] + x) / 2, (p[1] + y) / 2);
      } else {
        const ax = p[2 * i - 4], ay = p[2 * i - 3], bx = p[2 * i - 2], by = p[2 * i - 1];
        g.moveTo((ax + bx) / 2, (ay + by) / 2);
        g.quadraticCurveTo(bx, by, (bx + x) / 2, (by + y) / 2);
      }
      g.stroke();
    } else if (b === "fountain") {
      if (i === 0) {
        this.lastW = this.op.size * 0.7;
        return;
      }
      const px = p[2 * i - 2], py = p[2 * i - 1];
      const speed = Math.hypot(x - px, y - py);
      // chậm → nét to, nhanh → nét mảnh (giống hàm B(...) của app gốc)
      const target = this.op.size * Math.max(0.3, Math.min(1.15, 1.2 - speed * 0.045));
      const w = this.lastW + (target - this.lastW) * 0.35;
      const g = this.g;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(x, y);
      g.stroke();
      this.lastW = w;
    } else {
      this.stampTo(i, x, y);
    }
  }

  private stampTo(i: number, x: number, y: number) {
    const b = this.op.brush;
    const size = this.op.size;
    const name: StampName = b === "crayon" ? (this.op.seed % 2 ? "crayon" : "crayon2") : b === "nib" ? "nib" : "air";
    const img = tintedStamp(name, this.op.color);
    const d = b === "crayon" ? size * 1.15 : b === "nib" ? size * 1.25 : size * 1.8;
    const spacing = b === "crayon" ? Math.max(1, size / 2) : b === "nib" ? Math.max(0.6, size / 14) : Math.max(0.8, size / 7);
    const g = this.g;
    const stamp = (sx: number, sy: number) => {
      if (!img) {
        g.beginPath();
        g.arc(sx, sy, size / 2, 0, Math.PI * 2);
        g.fill();
        return;
      }
      if (b === "crayon") {
        const a = this.rand() * Math.PI * 2;
        g.save();
        g.translate(sx, sy);
        g.rotate(a);
        g.drawImage(img, -d / 2, -d / 2, d, d);
        g.restore();
      } else {
        g.drawImage(img, sx - d / 2, sy - d / 2, d, d);
      }
    };
    if (i === 0) {
      stamp(x, y);
      return;
    }
    const px = this.op.pts[2 * i - 2], py = this.op.pts[2 * i - 1];
    const len = Math.hypot(x - px, y - py);
    let t = spacing - this.carry;
    while (t <= len) {
      stamp(px + ((x - px) * t) / len, py + ((y - py) * t) / len);
      t += spacing;
    }
    this.carry = len - (t - spacing);
  }

  finish() {
    const p = this.op.pts;
    const n = p.length / 2;
    const b = this.op.brush;
    const g = this.g;
    if (b === "pen" || b === "marker" || b === "eraser") {
      if (n === 1) {
        g.beginPath();
        g.arc(p[0], p[1], this.op.size / 2, 0, Math.PI * 2);
        g.fill();
      } else {
        const ax = p[2 * n - 4], ay = p[2 * n - 3];
        g.beginPath();
        g.moveTo((ax + p[2 * n - 2]) / 2, (ay + p[2 * n - 1]) / 2);
        g.lineTo(p[2 * n - 2], p[2 * n - 1]);
        g.stroke();
      }
    } else if (b === "fountain" && n === 1) {
      g.beginPath();
      g.arc(p[0], p[1], this.op.size * 0.35, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    if (this.live) {
      const t = this.target;
      t.save();
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalAlpha = 0.5;
      t.drawImage(this.live.canvas, 0, 0);
      t.restore();
      this.live = null;
    }
  }
}

/** Vẽ lại trọn một nét (dùng khi hoàn tác/làm lại). */
export function renderStroke(ctx: CanvasRenderingContext2D, op: StrokeOp, scale: number) {
  const r = new StrokeRenderer(ctx, op, scale);
  const pts = op.pts;
  for (let i = 0; i < pts.length; i += 2) r.add(pts[i], pts[i + 1]);
  r.finish();
}

export function shapePath(g: CanvasRenderingContext2D | Path2D, op: Pick<ShapeOp, "shape" | "x0" | "y0" | "x1" | "y1">) {
  const { x0, y0, x1, y1 } = op;
  const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
  const cx = (l + r) / 2, cy = (t + b) / 2, w = r - l, h = b - t;
  switch (op.shape) {
    case "line":
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      break;
    case "rect":
      g.rect(l, t, w, h);
      break;
    case "ellipse":
      g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "triangle":
      g.moveTo(cx, t);
      g.lineTo(r, b);
      g.lineTo(l, b);
      g.closePath();
      break;
    case "star":
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 === 0 ? 1 : 0.45;
        const x = cx + (Math.cos(a) * w * rr) / 2, y = cy + (Math.sin(a) * h * rr) / 2 + h * 0.05;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      break;
    case "heart":
      g.moveTo(cx, b);
      g.bezierCurveTo(l - w * 0.05, cy + h * 0.1, l + w * 0.05, t - h * 0.15, cx, t + h * 0.28);
      g.bezierCurveTo(r - w * 0.05, t - h * 0.15, r + w * 0.05, cy + h * 0.1, cx, b);
      g.closePath();
      break;
  }
}

export function renderShape(ctx: CanvasRenderingContext2D, op: ShapeOp, scale: number) {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = op.size;
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.beginPath();
  shapePath(ctx, op);
  if (op.filled && op.shape !== "line") ctx.fill();
  else ctx.stroke();
  ctx.restore();
}
