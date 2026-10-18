"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadStamps, type BrushId, type StrokeOp, type StrokeRenderer } from "@/lib/brush";
import { WORLD, loadDrawing, samplePath, type DrawingData } from "@/lib/drawing";
import { blobToImage, canvasToBlob } from "@/lib/export";
import { OpLayer, newSeed } from "@/lib/layer";
import { asset, categoryOf, findDrawing, thumbUrl } from "@/lib/manifest";
import { Particles } from "@/lib/particles";
import { setPref, usePrefs } from "@/lib/prefs";
import { play, vibrate } from "@/lib/sound";
import { Stage, type WorldPt } from "@/lib/stage";
import { loadWork, saveWork, type Phase } from "@/lib/storage";
import { guideDots, makeGuide, markSegment, progressPercent, scoreStars, type GuidePoint, type Pt } from "@/lib/trace";
import DoneDialog from "./DoneDialog";
import HelpDialog from "./HelpDialog";
import { BG_COLORS, Bubble, ColorPicker, Confirm, Img, ImgButton, Modal, PaletteRow, SizeList, StyleList, Toast, anchorOf, useToast } from "./ui";

type Tool = "brush" | "eraser";
type Popup = null | { id: "style" | "size" | "color" | "bg"; x: number };

const RES = 2; // pixel lớp vẽ / đơn vị thế giới → ảnh 1000×1000
const LINE_MS = 1000; // thời gian hiện một nét mẫu (ValueAnimator 1000ms)
const DASH = [9, 5]; // DashPathEffect(10, 5)
const BLUE = "#5cbdff";

/** Kiểu cọ mặc định theo chủ đề (PaintActivity: animal → sáp màu, flower → kiểu 2); vẽ nét cỡ 9, tô màu cỡ 18. */
const defaultStyle = (id: string): { brush: BrushId; size: number } => {
  const c = categoryOf(id).id;
  return { brush: c === "animal" ? "crayon" : c === "flower" ? "marker" : "pen", size: 9 };
};
const COLOR_SIZE = 18;

export default function DrawScreen({ id }: { id: string }) {
  const router = useRouter();
  const info = findDrawing(id)!;
  const prefs = usePrefs();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const def = defaultStyle(id);

  const [data, setData] = useState<DrawingData | null>(null);
  const [error, setError] = useState(false);
  const [phase, setPhase] = useState<Phase>("trace");
  const [shown, setShown] = useState(0);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState<BrushId>(def.brush);
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(def.size);
  const [eraserSize, setEraserSize] = useState(25);
  const [bg, setBg] = useState("#ffffff");
  const [popup, setPopup] = useState<Popup>(null);
  const [refBig, setRefBig] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [toast, flash] = useToast();
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  // Trạng thái dùng trong vòng lặp vẽ (ref để không phải dựng lại Stage).
  const s = useRef({
    stage: null as Stage | null,
    ink: null as OpLayer | null,
    paint: null as OpLayer | null,
    lines: [] as Path2D[],
    linePts: [] as Pt[][],
    anim: null as null | { idx: number; start: number },
    dots: [] as GuidePoint[],
    hit: 0,
    total: 0,
    active: null as { layer: OpLayer; op: StrokeOp; r: StrokeRenderer } | null,
    last: null as WorldPt | null,
    pointer: null as WorldPt | null,
    lastPop: 0,
    particles: new Particles(),
    hand: null as HTMLImageElement | null,
    dirty: false,
    saveTimer: 0 as number,
    loaded: false,
    started: false,
    phase: "trace" as Phase,
    shown: 0,
    tool: "brush" as Tool,
    brush: def.brush,
    color: "",
    size: 9,
    eraserSize: 25,
    bg: "#ffffff",
    magnifier: false,
  }).current;
  Object.assign(s, { phase, shown, tool, brush, color, size, eraserSize, bg, magnifier: prefs.magnifier });

  const total = data?.lines.length ?? info.steps;
  const tracing = phase === "trace";

  // ---------- lưu ----------
  const composite = useCallback(
    (px: number) => {
      const c = document.createElement("canvas");
      c.width = c.height = px;
      const g = c.getContext("2d")!;
      g.fillStyle = s.bg;
      g.fillRect(0, 0, px, px);
      if (s.paint) g.drawImage(s.paint.canvas, 0, 0, px, px);
      if (s.ink) g.drawImage(s.ink.canvas, 0, 0, px, px);
      return c;
    },
    [s],
  );

  const save = useCallback(async () => {
    if (!s.loaded || !s.ink || !s.paint) return;
    window.clearTimeout(s.saveTimer);
    if (!s.dirty) return;
    s.dirty = false;
    if (s.ink.isEmpty && s.paint.isEmpty && s.shown === 0) return;
    const [ink, paint, thumb] = await Promise.all([canvasToBlob(s.ink.canvas), canvasToBlob(s.paint.canvas), canvasToBlob(composite(360), "image/jpeg", 0.85)]);
    await saveWork(
      {
        id,
        kind: "learn",
        phase: s.phase,
        step: s.shown,
        progress: s.phase === "trace" ? progressPercent(s.shown, s.lines.length) : 100,
        hit: s.hit,
        dots: s.total,
        bg: s.bg,
        stars: scoreStars(s.hit, s.total),
        updatedAt: Date.now(),
      },
      { ink, paint, thumb },
    );
  }, [composite, id, s]);

  const scheduleSave = useCallback(
    (delay = 1200) => {
      s.dirty = true;
      window.clearTimeout(s.saveTimer);
      s.saveTimer = window.setTimeout(() => void save(), delay);
    },
    [s, save],
  );

  // ---------- nét mẫu ----------
  /** Hiện nét tiếp theo (DrawingBoardView.W): chạy hoạt hoạ 1 giây rồi rải chấm xanh dọc nét. */
  const showNext = useCallback(() => {
    if (!data || s.anim || s.shown >= data.lines.length) return;
    s.started = true;
    s.dots = [];
    const next = s.shown + 1;
    s.shown = next;
    setShown(next);
    s.anim = { idx: next - 1, start: performance.now() };
    play("step");
    s.stage?.invalidate();
    scheduleSave(400);
  }, [data, s, scheduleSave]);

  /** Bấm "tiếp" sau nét cuối: sang tô màu (PaintActivity.c1 khi c0 = true). */
  const enterColor = useCallback(() => {
    s.dots = [];
    s.anim = null;
    setPhase("color");
    s.phase = "color";
    setTool("brush");
    setBrush(def.brush);
    setSize(COLOR_SIZE);
    setColor(info.palette[0] ?? "#ff6b81");
    setPopup(null);
    s.particles.celebrate(WORLD, WORLD);
    play("success");
    vibrate(40);
    s.stage?.resetView();
    scheduleSave(300);
  }, [def.brush, info.palette, s, scheduleSave]);

  const onNext = () => {
    if (!data) return;
    if (s.shown >= data.lines.length) enterColor();
    else showNext();
  };

  // ---------- nạp dữ liệu ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, work] = await Promise.all([loadDrawing(id), loadWork(id), loadStamps()]);
        if (!alive) return;
        const hand = new Image();
        hand.src = asset("stamps/hand.png");
        s.hand = hand;
        s.lines = d.lines.map((l) => new Path2D(l.d));
        s.linePts = d.lines.map((l) => samplePath(l.d, 3).points);
        s.ink = new OpLayer(WORLD, WORLD, RES);
        s.paint = new OpLayer(WORLD, WORLD, RES);
        let st = 0;
        let ph: Phase = "trace";
        if (work) {
          if (work.ink) s.ink.setBase(await blobToImage(work.ink));
          if (work.paint) s.paint.setBase(await blobToImage(work.paint));
          st = Math.min(work.step, d.lines.length);
          ph = work.phase;
          s.hit = work.hit ?? 0;
          s.total = work.dots ?? 0;
          setBg(work.bg);
          s.bg = work.bg;
        }
        if (!alive) return;
        s.shown = st;
        setShown(st);
        setPhase(ph);
        s.phase = ph;
        if (ph !== "trace") {
          setColor(info.palette[0] ?? "#ff6b81");
          setSize(COLOR_SIZE);
        }
        else if (st > 0) {
          // vẽ tiếp: rải lại chấm của nét đang dở; tổng chấm = chấm của mọi nét đã hiện
          s.started = true;
          s.dots = makeGuide(guideDots(s.linePts[st - 1], 4));
          s.total = s.linePts.slice(0, st).reduce((n, pts) => n + guideDots(pts, 4).length, 0);
          s.hit = Math.min(s.hit, s.total);
        }
        setData(d);
        s.loaded = true;
        s.stage?.invalidate();
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, info.palette, s]);

  // tranh mới: xem toàn bộ tranh mẫu một lúc rồi tự bắt đầu nét đầu tiên (PaintActivity.i)
  useEffect(() => {
    if (!data || s.started || s.phase !== "trace" || s.shown > 0) return;
    const t = window.setTimeout(() => !s.started && showNext(), 1600);
    return () => window.clearTimeout(t);
  }, [data, s, showNext]);

  // ---------- Stage ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const layerFor = () => (s.phase === "trace" ? s.ink! : s.paint!);

    const stage = new Stage(
      canvas,
      WORLD,
      WORLD,
      {
        animating: () => !!s.anim || s.particles.active,
        draw: (g) => {
          g.fillStyle = s.bg;
          g.fillRect(0, 0, WORLD, WORLD);
          drawGuide(g);
          const paint = s.paint!;
          g.drawImage(paint.canvas, 0, 0, WORLD, WORLD);
          for (const layer of [paint, s.ink!]) {
            if (layer.liveCanvas) {
              g.globalAlpha = 0.5;
              g.drawImage(layer.liveCanvas, 0, 0, WORLD, WORLD);
              g.globalAlpha = 1;
            }
          }
          g.drawImage(s.ink!.canvas, 0, 0, WORLD, WORLD);
          drawDots(g);
          s.particles.draw(g);
        },
        overlay: (g) => {
          if (s.magnifier && s.active && s.pointer) drawLoupe(g, stage, s.pointer);
        },
        down: (p) => {
          // chưa bấm Start thì chưa được vẽ (setIsCanDraw(false))
          if (s.phase === "trace" && s.shown === 0) return;
          s.pointer = p;
          s.last = p;
          const eraser = s.tool === "eraser";
          const op: StrokeOp = { kind: "stroke", brush: eraser ? "eraser" : s.brush, color: s.color, size: eraser ? s.eraserSize : s.size, pts: [p.x, p.y], seed: newSeed() };
          const layer = layerFor();
          const r = layer.beginStroke(op);
          r.add(p.x, p.y);
          s.active = { layer, op, r };
          setDrawing(true);
          if (!eraser) hitDots(p, p, op.size);
        },
        move: (pts) => {
          for (const p of pts) {
            s.pointer = p;
            const a = s.active;
            if (!a || !s.last) continue;
            if (Math.hypot(p.x - s.last.x, p.y - s.last.y) < 0.6) continue;
            // StrokeRenderer đọc điểm từ op.pts nên phải push trước khi add
            a.op.pts.push(p.x, p.y);
            a.r.add(p.x, p.y);
            if (a.op.brush !== "eraser") hitDots(s.last, p, a.op.size);
            s.last = p;
          }
        },
        up: () => {
          s.pointer = null;
          const a = s.active;
          if (!a) return;
          a.layer.endStroke();
          s.active = null;
          setDrawing(false);
          rerender();
          scheduleSave();
        },
        cancel: () => {
          s.pointer = null;
          const a = s.active;
          if (!a) return;
          a.layer.endStroke();
          a.layer.undo();
          a.layer.redoOps.pop();
          s.active = null;
          setDrawing(false);
          rerender();
        },
      },
      { flat: true, padding: 10 },
    );
    s.stage = stage;

    /** Ngón tay đi qua chấm xanh (trong bán kính = độ dày nét bút): chấm xám lại, bắn pháo hoa. */
    function hitDots(a: Pt, b: Pt, size: number) {
      if (!s.dots.length) return;
      const fresh = markSegment(s.dots, a, b, Math.max(size, 8));
      if (!fresh.length) return;
      s.hit = Math.min(s.total, s.hit + fresh.length);
      for (const d of fresh) s.particles.burst(d.x, d.y, 6, 2.2);
      const now = performance.now();
      if (now - s.lastPop > 120) {
        s.lastPop = now;
        play("pop");
      }
    }

    function drawGuide(g: CanvasRenderingContext2D) {
      const lines = data!.lines;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "#000";
      // tranh mới chưa bấm Start: hiện trọn tranh mẫu nét liền (DrawingBoardView.D)
      if (s.phase === "trace" && s.shown === 0) {
        lines.forEach((l, k) => {
          g.lineWidth = l.w;
          g.stroke(s.lines[k]);
        });
        return;
      }
      // các nét đã qua: nét đứt màu đen
      const cur = s.phase === "trace" ? s.shown - 1 : lines.length;
      g.setLineDash(DASH);
      for (let k = 0; k < Math.min(cur, lines.length); k++) {
        g.lineWidth = lines[k].w;
        g.stroke(s.lines[k]);
      }
      if (s.phase !== "trace" || cur < 0) {
        g.setLineDash([]);
        return;
      }
      // nét hiện tại: chạy dần trong 1 giây, có bàn tay ở đầu nét
      const pts = s.linePts[cur];
      g.lineWidth = lines[cur].w;
      const a = s.anim;
      if (a && a.idx === cur) {
        const k = Math.min(1, (performance.now() - a.start) / LINE_MS);
        const n = Math.max(1, Math.floor(k * (pts.length - 1)));
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i <= n; i++) g.lineTo(pts[i].x, pts[i].y);
        g.stroke();
        g.setLineDash([]);
        const tip = pts[n];
        g.fillStyle = BLUE;
        g.beginPath();
        g.arc(tip.x, tip.y, 5.5, 0, Math.PI * 2);
        g.fill();
        if (s.hand?.complete) {
          const hw = 34;
          const hh = (hw * s.hand.height) / Math.max(1, s.hand.width);
          g.drawImage(s.hand, tip.x, tip.y, hw, hh);
        }
        if (k >= 1) {
          s.anim = null;
          s.dots = makeGuide(guideDots(pts, 4));
          s.total += s.dots.length;
        }
      } else {
        g.stroke(s.lines[cur]);
        g.setLineDash([]);
      }
    }

    function drawDots(g: CanvasRenderingContext2D) {
      if (s.phase !== "trace") return;
      const r = s.stage ? 3.5 / s.stage.pxPerUnit : 4; // 3dp trên màn hình
      for (const d of s.dots) {
        g.fillStyle = d.hit ? "rgba(211,211,211,.83)" : "rgba(92,189,255,.83)";
        g.beginPath();
        g.arc(d.x, d.y, r, 0, Math.PI * 2);
        g.fill();
      }
    }

    return () => {
      stage.dispose();
      s.stage = null;
    };
  }, [data, rerender, s, scheduleSave]);

  // lưu khi rời trang / ẩn tab
  useEffect(() => {
    const flush = () => void save();
    const onVis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [save]);

  useEffect(() => {
    s.stage?.invalidate();
  }, [bg, phase, shown, s]);

  // ---------- hành động ----------
  const layer = tracing ? s.ink : s.paint;
  const undo = () => {
    if (!layer?.canUndo) return;
    layer.undo();
    play("erase");
    rerender();
    scheduleSave();
    s.stage?.invalidate();
  };
  const redo = () => {
    if (!layer?.canRedo) return;
    layer.redo();
    rerender();
    scheduleSave();
    s.stage?.invalidate();
  };

  const finish = async () => {
    if (s.ink?.isEmpty && s.paint?.isEmpty) {
      flash("Bé chưa vẽ gì cả");
      return;
    }
    setPopup(null);
    if (s.phase === "color") {
      setPhase("done");
      s.phase = "done";
    }
    s.dirty = true;
    await save();
    s.particles.celebrate(WORLD, WORLD);
    play("success");
    vibrate(60);
    window.setTimeout(() => setDoneOpen(true), 500);
  };

  const goHome = async () => {
    s.dirty = true;
    await save();
    router.push("/");
  };

  const toggle = (id: NonNullable<Popup>["id"]) => (e: React.MouseEvent<HTMLElement>) => {
    const x = anchorOf(e);
    setPopup((p) => (p?.id === id ? null : { id, x }));
  };

  if (error) {
    return (
      <div className="screen center-msg">
        <p>Không tải được tranh. Bé kiểm tra mạng rồi thử lại nhé!</p>
        <button type="button" className="retry-btn" onClick={() => window.location.reload()}>
          Thử lại
        </button>
      </div>
    );
  }

  const pct = tracing ? progressPercent(shown, total) : 100;
  const pickColor = (c: string) => {
    setColor(c);
    if (tool === "eraser") setTool("brush");
  };

  return (
    <div className="screen paint-screen">
      <header className="paint-top">
        <ImgButton icon="paint_close_btn" label="Thoát" className="top-close" onClick={() => setConfirmExit(true)} />
        <ImgButton
          icon={prefs.magnifier ? "ic_magnifier_on" : "ic_magnifier_off"}
          label="Kính lúp"
          className="top-magnifier"
          onClick={() => {
            setPref("magnifier", !prefs.magnifier);
            flash(prefs.magnifier ? "Đã tắt kính lúp" : "Đã bật kính lúp");
          }}
        />
        <span className="paint-pct">{pct}%</span>
        <ImgButton icon="iv_operate_help" label="Hướng dẫn" className="top-help" onClick={() => setHelp(true)} />
        <ImgButton icon="paint_done_btn" label="Xong" className="top-done" onClick={() => void finish()} />
        <div className="paint-progress">
          <span style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="paint-area">
        <canvas ref={canvasRef} className="stage" />
        {!data && <div className="loading-ring" aria-label="Đang tải" />}
        {!tracing && !drawing && (
          <button type="button" className="ref-card" onClick={() => setRefBig(true)} aria-label="Xem tranh mẫu">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl(id)} alt="" />
          </button>
        )}
        {!tracing && <PaletteRow className="paint-palette" colors={info.palette} value={tool === "eraser" ? null : color} onChange={pickColor} />}
        {tracing && data && (
          <button type="button" className="next-btn" aria-label={shown === 0 ? "Bắt đầu" : "Nét tiếp"} onClick={onNext}>
            {shown === 0 ? <span className="blue-pill">Bắt đầu</span> : <Img name="paint_next_btn" />}
          </button>
        )}
      </div>

      <footer className="paint-bar">
        <ImgButton
          icon="paint_draw_btn"
          label="Kiểu cọ"
          sel={tool === "brush"}
          onClick={(e) => {
            if (tool !== "brush") {
              setTool("brush");
              setPopup(null);
            } else toggle("style")(e);
          }}
        />
        <ImgButton icon="paint_size_btn" label="Cỡ cọ" sel={popup?.id === "size"} onClick={toggle("size")} />
        <ImgButton icon="paint_color_btn" label="Chọn màu" sel={popup?.id === "color"} onClick={toggle("color")} />
        {!tracing && <ImgButton icon="paint_bg_color_btn" label="Màu nền" sel={popup?.id === "bg"} onClick={toggle("bg")} />}
        <ImgButton
          icon="paint_eraser_btn"
          label="Tẩy"
          sel={tool === "eraser"}
          onClick={(e) => {
            if (tool !== "eraser") {
              setTool("eraser");
              setPopup(null);
            } else toggle("size")(e);
          }}
        />
        <ImgButton icon="paint_undo_btn" label="Hoàn tác" className={layer?.canUndo ? "" : "dim"} onClick={undo} />
        <ImgButton icon="paint_redo_btn" label="Làm lại" className={layer?.canRedo ? "" : "dim"} onClick={redo} />
      </footer>

      {popup?.id === "style" && (
        <Bubble anchor={popup.x} width={230} onClose={() => setPopup(null)}>
          <StyleList
            value={brush}
            onChange={(b) => {
              setBrush(b);
              setPopup(null);
            }}
          />
        </Bubble>
      )}
      {popup?.id === "size" && (
        <Bubble anchor={popup.x} width={230} onClose={() => setPopup(null)}>
          <SizeList
            value={tool === "eraser" ? eraserSize : size}
            onChange={(v) => {
              if (tool === "eraser") setEraserSize(v);
              else setSize(v);
              setPopup(null);
            }}
          />
        </Bubble>
      )}
      {popup?.id === "color" && (
        <Bubble anchor={popup.x} width={300} onClose={() => setPopup(null)}>
          <ColorPicker value={color} onChange={pickColor} />
        </Bubble>
      )}
      {popup?.id === "bg" && (
        <Bubble anchor={popup.x} width={300} onClose={() => setPopup(null)}>
          <PaletteRow
            className="bg-grid"
            colors={BG_COLORS}
            value={bg}
            onChange={(c) => {
              setBg(c);
              scheduleSave();
            }}
          />
        </Bubble>
      )}

      <Modal open={refBig} onClose={() => setRefBig(false)} className="ref-modal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl(id)} alt="Tranh mẫu" onClick={() => setRefBig(false)} />
      </Modal>

      <Confirm open={confirmExit} text="Thoát bây giờ?" ok="Có" onCancel={() => setConfirmExit(false)} onOk={() => void goHome()} />
      {help && <HelpDialog onClose={() => setHelp(false)} />}

      {doneOpen && (
        <DoneDialog
          refImage={thumbUrl(id)}
          stars={tracing ? undefined : scoreStars(s.hit, s.total)}
          makeImage={() => composite(1000)}
          onClose={() => setDoneOpen(false)}
        />
      )}

      <Toast text={toast} />
    </div>
  );
}

/** Kính lúp (MagnifierView 120dp ở góc trên): phóng to vùng quanh ngón tay. */
function drawLoupe(g: CanvasRenderingContext2D, stage: Stage, p: WorldPt) {
  const { x, y } = stage.toScreen(p.x, p.y);
  const S = 120;
  const zoom = 2;
  const left = x < S + 30 && y < S + 30;
  const bx = left ? stage.size.w - S - 5 : 5;
  const by = 5;
  const d = stage.devicePixelRatio;
  const sr = (S / 2 / zoom) * d;
  g.save();
  g.beginPath();
  g.roundRect(bx, by, S, S, 10);
  g.fillStyle = "#fff";
  g.fill();
  g.clip();
  g.drawImage(stage.screenCanvas, x * d - sr, y * d - sr, sr * 2, sr * 2, bx, by, S, S);
  g.restore();
  g.strokeStyle = BLUE;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(bx, by, S, S, 10);
  g.stroke();
  g.fillStyle = BLUE;
  g.beginPath();
  g.arc(bx + S / 2, by + S / 2, 2.5, 0, Math.PI * 2);
  g.fill();
}
