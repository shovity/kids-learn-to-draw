// Khung canvas dùng chung: vừa khít tờ giấy vào màn hình, chụm hai ngón để phóng to/di chuyển
// (như ScaleGestureDetector + ma trận l0 của DrawingBoardView), lăn chuột để phóng to trên máy tính.

export type WorldPt = { x: number; y: number; pressure: number };

export type StageHandlers = {
  /** Vẽ nội dung tờ giấy; ngữ cảnh đã đặt sẵn phép biến đổi thế giới → màn hình và cắt theo tờ giấy. */
  draw(g: CanvasRenderingContext2D): void;
  /** Vẽ lớp phủ theo toạ độ màn hình (CSS px, đã nhân DPR). */
  overlay?(g: CanvasRenderingContext2D): void;
  /** Còn hiệu ứng chuyển động thì vòng lặp tiếp tục chạy. */
  animating?(): boolean;
  down(p: WorldPt): void;
  move(pts: WorldPt[]): void;
  up(p: WorldPt): void;
  /** Ngón thứ hai chạm vào: huỷ nét đang vẽ dở. */
  cancel(): void;
  onViewChange?(zoomed: boolean): void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export class Stage {
  private g: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  /** tỉ lệ vừa khít (CSS px / đơn vị thế giới) */
  private fitScale = 1;
  zoom = 1;
  private panX = 0;
  private panY = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private drawingPointer: number | null = null;
  private pinch: { dist: number; cx: number; cy: number; zoom: number; panX: number; panY: number } | null = null;
  private raf = 0;
  private dirty = true;
  private ro: ResizeObserver;
  private disposed = false;
  readonly padding: number;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly worldW: number,
    readonly worldH: number,
    private h: StageHandlers,
    opts: { padding?: number } = {},
  ) {
    this.padding = opts.padding ?? 12;
    this.g = canvas.getContext("2d")!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("lostpointercapture", this.onLost);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.resize();
    this.loop();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("lostpointercapture", this.onLost);
    c.removeEventListener("wheel", this.onWheel);
  }

  invalidate() {
    this.dirty = true;
  }

  /** Số pixel màn hình (CSS) cho một đơn vị thế giới ở mức phóng hiện tại. */
  get pxPerUnit() {
    return this.fitScale * this.zoom;
  }

  resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.h.onViewChange?.(false);
    this.invalidate();
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cssW = r.width;
    this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    const p = this.padding;
    this.fitScale = Math.min((r.width - 2 * p) / this.worldW, (r.height - 2 * p) / this.worldH);
    this.clampPan();
    this.invalidate();
  }

  /** Gốc toạ độ tờ giấy trên màn hình (CSS px). */
  private origin() {
    const s = this.pxPerUnit;
    return {
      ox: (this.cssW - this.worldW * s) / 2 + this.panX,
      oy: (this.cssH - this.worldH * s) / 2 + this.panY,
    };
  }

  /** Rect tờ giấy theo CSS px so với canvas. */
  paperRect() {
    const { ox, oy } = this.origin();
    const s = this.pxPerUnit;
    return { x: ox, y: oy, w: this.worldW * s, h: this.worldH * s };
  }

  toWorld(clientX: number, clientY: number, pressure = 0.5): WorldPt {
    const r = this.canvas.getBoundingClientRect();
    const { ox, oy } = this.origin();
    const s = this.pxPerUnit;
    return { x: (clientX - r.left - ox) / s, y: (clientY - r.top - oy) / s, pressure };
  }

  /** Thế giới → CSS px trong canvas. */
  toScreen(x: number, y: number) {
    const { ox, oy } = this.origin();
    const s = this.pxPerUnit;
    return { x: ox + x * s, y: oy + y * s };
  }

  private clampPan() {
    // không cho kéo tờ giấy ra khỏi màn hình quá nửa
    const s = this.pxPerUnit;
    const maxX = Math.max(0, (this.worldW * s - this.cssW) / 2 + this.cssW * 0.35);
    const maxY = Math.max(0, (this.worldH * s - this.cssH) / 2 + this.cssH * 0.35);
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
  }

  private zoomAt(cssX: number, cssY: number, nextZoom: number) {
    nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    const before = this.toWorldCss(cssX, cssY);
    this.zoom = nextZoom;
    const { ox, oy } = this.origin();
    const s = this.pxPerUnit;
    this.panX += cssX - (ox + before.x * s);
    this.panY += cssY - (oy + before.y * s);
    if (this.zoom === 1) {
      this.panX = 0;
      this.panY = 0;
    }
    this.clampPan();
    this.h.onViewChange?.(this.zoom > 1.01);
    this.invalidate();
  }

  private toWorldCss(cssX: number, cssY: number) {
    const { ox, oy } = this.origin();
    const s = this.pxPerUnit;
    return { x: (cssX - ox) / s, y: (cssY - oy) / s };
  }

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* bỏ qua */
    }
    this.pointers.set(e.pointerId, this.local(e));
    if (this.pointers.size === 1) {
      this.drawingPointer = e.pointerId;
      this.h.down(this.toWorld(e.clientX, e.clientY, e.pressure));
    } else if (this.pointers.size === 2) {
      if (this.drawingPointer !== null) {
        this.drawingPointer = null;
        this.h.cancel();
      }
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        zoom: this.zoom,
        panX: this.panX,
        panY: this.panY,
      };
    }
    this.invalidate();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, this.local(e));
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      // phóng quanh tâm lúc bắt đầu chụm rồi dời theo tâm hiện tại
      this.zoom = this.pinch.zoom;
      this.panX = this.pinch.panX;
      this.panY = this.pinch.panY;
      this.zoomAt(this.pinch.cx, this.pinch.cy, this.pinch.zoom * (dist / Math.max(1, this.pinch.dist)));
      this.panX += cx - this.pinch.cx;
      this.panY += cy - this.pinch.cy;
      this.clampPan();
      this.invalidate();
      return;
    }
    if (e.pointerId === this.drawingPointer) {
      const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      const list = (evs.length ? evs : [e]).map((ev) => this.toWorld(ev.clientX, ev.clientY, ev.pressure));
      this.h.move(list);
      this.invalidate();
    }
  };

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.drawingPointer) {
      this.drawingPointer = null;
      if (e.type === "pointercancel") this.h.cancel();
      else this.h.up(this.toWorld(e.clientX, e.clientY, e.pressure));
    }
    if (this.pointers.size < 2) this.pinch = null;
    this.invalidate();
  };

  private onLost = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.onUp(new PointerEvent("pointercancel", { pointerId: e.pointerId }));
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, this.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    } else {
      this.panX -= e.deltaX;
      this.clampPan();
      this.invalidate();
    }
  };

  private loop = () => {
    if (this.disposed) return;
    const anim = this.h.animating?.() ?? false;
    if (this.dirty || anim) {
      this.dirty = false;
      this.render();
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private render() {
    const g = this.g;
    const d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const { x, y, w, h } = this.paperRect();
    // bóng đổ của tờ giấy
    g.setTransform(d, 0, 0, d, 0, 0);
    g.save();
    g.shadowColor = "rgba(40, 60, 100, 0.18)";
    g.shadowBlur = 18;
    g.shadowOffsetY = 6;
    g.fillStyle = "#fff";
    g.beginPath();
    g.roundRect(x, y, w, h, 14);
    g.fill();
    g.restore();
    g.save();
    g.beginPath();
    g.roundRect(x, y, w, h, 14);
    g.clip();
    const s = this.pxPerUnit;
    g.setTransform(d * s, 0, 0, d * s, d * x, d * y);
    this.h.draw(g);
    g.restore();
    if (this.h.overlay) {
      g.setTransform(d, 0, 0, d, 0, 0);
      this.h.overlay(g);
    }
  }

  /** Ảnh chụp vùng màn hình quanh một điểm (cho kính lúp). */
  get screenCanvas() {
    return this.canvas;
  }
  get devicePixelRatio() {
    return this.dpr;
  }
  get size() {
    return { w: this.cssW, h: this.cssH };
  }
}
