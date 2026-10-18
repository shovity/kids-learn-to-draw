// Một lớp vẽ có lịch sử thao tác để hoàn tác/làm lại bằng cách vẽ lại từ ảnh nền.
import { renderShape, renderStroke, StrokeRenderer, type Op, type StrokeOp } from "./brush";
import { alphaBarrier, colorBarrier, dilate, floodRegion, hexToRgb } from "./fill";

export type ClearOp = { kind: "clear" };
export type LayerOp = Op | ClearOp;

/** Cách tìm biên khi đổ màu: theo độ đục của một lớp khác, hoặc theo màu của chính lớp này. */
export type FillMode =
  | { type: "alpha"; source: () => HTMLCanvasElement }
  | { type: "color" }
  /** vùng kín cho sẵn (toạ độ thế giới); không trúng vùng nào thì dùng `fallback` */
  | { type: "regions"; regions: () => Path2D[]; fallback: FillMode };

const MAX_OPS = 40;
const KEEP_OPS = 25;

export class OpLayer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  ops: LayerOp[] = [];
  redoOps: LayerOp[] = [];
  private active: StrokeRenderer | null = null;
  private activeOp: StrokeOp | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly scale: number,
    private fillMode: FillMode = { type: "color" },
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  }

  get canUndo() {
    return this.ops.length > 0;
  }
  get canRedo() {
    return this.redoOps.length > 0;
  }
  get isEmpty() {
    return !this.base && this.ops.length === 0;
  }

  /** Đặt ảnh nền (tranh đã lưu) và xoá lịch sử. */
  setBase(img: CanvasImageSource | null) {
    this.ops = [];
    this.redoOps = [];
    if (img) {
      const c = document.createElement("canvas");
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      this.base = c;
    } else {
      this.base = null;
    }
    this.redraw();
  }

  beginStroke(op: StrokeOp): StrokeRenderer {
    this.activeOp = op;
    this.active = new StrokeRenderer(this.ctx, op, this.scale);
    return this.active;
  }

  /** Lớp tạm đang vẽ dở (bút dạ), để màn hình ghép vào khi xem trước. */
  get liveCanvas(): HTMLCanvasElement | null {
    return this.active?.liveCanvas ?? null;
  }

  endStroke() {
    if (!this.active || !this.activeOp) return;
    this.active.finish();
    this.push(this.activeOp);
    this.active = null;
    this.activeOp = null;
  }

  /** Thực hiện và ghi lại một thao tác (đổ màu, hình, xoá hết). Trả về false nếu không có tác dụng. */
  apply(op: LayerOp): boolean {
    if (op.kind === "fill" && !this.renderFill(op)) return false;
    if (op.kind === "shape") renderShape(this.ctx, op, this.scale);
    if (op.kind === "clear") this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (op.kind === "stroke") renderStroke(this.ctx, op, this.scale);
    this.push(op);
    return true;
  }

  private push(op: LayerOp) {
    this.ops.push(op);
    this.redoOps = [];
    if (this.ops.length > MAX_OPS) this.flatten(this.ops.length - KEEP_OPS);
  }

  /** Gộp `count` thao tác cũ nhất vào ảnh nền để giới hạn chi phí vẽ lại. */
  private flatten(count: number) {
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    if (this.base) g.drawImage(this.base, 0, 0);
    for (const op of this.ops.slice(0, count)) this.renderOp(g, op);
    this.base = c;
    this.ops = this.ops.slice(count);
  }

  undo() {
    const op = this.ops.pop();
    if (!op) return;
    this.redoOps.push(op);
    this.redraw();
  }

  redo() {
    const op = this.redoOps.pop();
    if (!op) return;
    this.ops.push(op);
    this.renderOp(this.ctx, op);
  }

  redraw() {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.base) g.drawImage(this.base, 0, 0);
    for (const op of this.ops) this.renderOp(g, op);
  }

  private renderOp(g: CanvasRenderingContext2D, op: LayerOp) {
    if (op.kind === "stroke") renderStroke(g, op, this.scale);
    else if (op.kind === "shape") renderShape(g, op, this.scale);
    else if (op.kind === "fill") this.renderFill(op, g);
    else g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private renderFill(op: Extract<Op, { kind: "fill" }>, g = this.ctx, mode: FillMode = this.fillMode): boolean {
    if (mode.type === "regions") {
      const hitCtx = regionHitContext();
      const path = mode.regions().find((p) => hitCtx.isPointInPath(p, op.x, op.y));
      if (!path) return this.renderFill(op, g, mode.fallback);
      g.save();
      g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.fillStyle = op.color;
      g.strokeStyle = op.color;
      g.lineWidth = 2.5; // phủ khe răng cưa dọc mép vùng
      g.lineJoin = "round";
      g.fill(path);
      g.stroke(path);
      g.restore();
      return true;
    }
    const w = this.canvas.width;
    const h = this.canvas.height;
    const own = g.getImageData(0, 0, w, h);
    let blocked: (i: number) => boolean;
    let grow = 0;
    if (mode.type === "alpha") {
      const src = mode.source();
      const sg = src.getContext("2d", { willReadFrequently: true })!;
      blocked = alphaBarrier(sg.getImageData(0, 0, w, h).data);
      grow = Math.max(1, Math.round(this.scale));
    } else {
      const sx = Math.floor(op.x * this.scale), sy = Math.floor(op.y * this.scale);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;
      blocked = colorBarrier(own.data, sy * w + sx);
      grow = 1;
    }
    let mask = floodRegion(w, h, op.x * this.scale, op.y * this.scale, blocked);
    if (!mask) return false;
    if (grow) mask = dilate(mask, w, h, grow);
    const [r, gg, b] = hexToRgb(op.color);
    const d = own.data;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const j = i * 4;
      d[j] = r;
      d[j + 1] = gg;
      d[j + 2] = b;
      d[j + 3] = 255;
    }
    g.putImageData(own, 0, 0);
    return true;
  }
}

let hitCanvas: CanvasRenderingContext2D | null = null;
function regionHitContext() {
  if (!hitCanvas) hitCanvas = document.createElement("canvas").getContext("2d")!;
  return hitCanvas;
}

export const newSeed = () => (Math.random() * 2 ** 31) | 0;
