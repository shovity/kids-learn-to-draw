"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStamps, type BrushId, type StrokeOp, type StrokeRenderer } from "@/lib/brush";
import { WORLD, fillRegions, loadDrawing, samplePath, type DrawingData } from "@/lib/drawing";
import { blobToImage, canvasToBlob } from "@/lib/export";
import { OpLayer, newSeed } from "@/lib/layer";
import { asset, categoryOf, drawingTitle, findDrawing, thumbUrl } from "@/lib/manifest";
import { Particles } from "@/lib/particles";
import { setPref, usePrefs } from "@/lib/prefs";
import { play, vibrate } from "@/lib/sound";
import { Stage, type WorldPt } from "@/lib/stage";
import { loadWork, removeWork, saveWork, type Phase } from "@/lib/storage";
import { hitRatio, isStepDone, makeGuide, markSegment, progressPercent, type GuidePoint } from "@/lib/trace";
import DoneDialog from "./DoneDialog";
import Icon from "./Icon";
import { ALL_COLORS, BG_COLORS, BrushPicker, CustomColor, IconButton, Modal, Sheet, SizePicker, Swatches, Toast } from "./ui";

type Tool = "brush" | "eraser" | "fill";
type SheetId = null | "brush" | "size" | "colors" | "bg" | "ink" | "help";

const RES = 2; // pixel lớp vẽ / đơn vị thế giới → ảnh 1000×1000
const INK_COLORS = ["#2b2b2b", "#5d4037", "#1e4fa8", "#7b1fa2", "#c62828", "#2e7d32"];
const INK_SIZES = [4, 6, 8, 11];

/** Số sao theo độ chính xác khi tô nét (app gốc có "score level" 0–3 sao). */
export function starsFor(scores: number[]): number {
  if (!scores.length) return 1;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return avg >= 0.93 ? 3 : avg >= 0.82 ? 2 : 1;
}

export default function DrawScreen({ id }: { id: string }) {
  const router = useRouter();
  const info = findDrawing(id)!;
  const prefs = usePrefs();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [data, setData] = useState<DrawingData | null>(null);
  const [error, setError] = useState(false);
  const [phase, setPhase] = useState<Phase>("trace");
  const [step, setStep] = useState(0);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState<BrushId>("crayon");
  const [color, setColor] = useState(info.palette[0] ?? "#ff6b81");
  const [size, setSize] = useState(18);
  const [inkColor, setInkColor] = useState(INK_COLORS[0]);
  const [inkSize, setInkSize] = useState(6);
  const [bg, setBg] = useState("#ffffff");
  const [sheet, setSheet] = useState<SheetId>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  // Trạng thái dùng trong vòng lặp vẽ (ref để không phải dựng lại Stage).
  const s = useRef({
    stage: null as Stage | null,
    ink: null as OpLayer | null,
    paint: null as OpLayer | null,
    lines: [] as Path2D[],
    guide: [] as GuidePoint[],
    stepStartOps: 0,
    handStart: 0,
    handLen: 1,
    scores: [] as number[],
    active: null as { layer: OpLayer; op: StrokeOp; r: StrokeRenderer } | null,
    forceHandUntil: 0,
    last: null as WorldPt | null,
    pointer: null as WorldPt | null,
    downAt: null as WorldPt | null,
    lastPop: 0,
    particles: new Particles(),
    hand: null as HTMLImageElement | null,
    dirty: false,
    saveTimer: 0 as number | ReturnType<typeof setTimeout>,
    loaded: false,
    // bản sao state để handler đọc
    phase: "trace" as Phase,
    step: 0,
    tool: "brush" as Tool,
    brush: "crayon" as BrushId,
    color: "",
    size: 18,
    inkColor: INK_COLORS[0],
    inkSize: 6,
    bg: "#ffffff",
    magnifier: false,
  }).current;
  s.phase = phase;
  s.step = step;
  s.tool = tool;
  s.brush = brush;
  s.color = color;
  s.size = size;
  s.inkColor = inkColor;
  s.inkSize = inkSize;
  s.bg = bg;
  s.magnifier = prefs.magnifier;

  const total = data?.lines.length ?? info.steps;
  const tracing = phase === "trace";

  const flash = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 2200);
  }, []);

  // ---------- lưu ----------
  const composite = useCallback(
    (px: number, withBg = true) => {
      const c = document.createElement("canvas");
      c.width = c.height = px;
      const g = c.getContext("2d")!;
      if (withBg) {
        g.fillStyle = s.bg;
        g.fillRect(0, 0, px, px);
      }
      if (s.paint) g.drawImage(s.paint.canvas, 0, 0, px, px);
      if (s.ink) g.drawImage(s.ink.canvas, 0, 0, px, px);
      return c;
    },
    [s],
  );

  const save = useCallback(async () => {
    if (!s.loaded || !s.ink || !s.paint) return;
    window.clearTimeout(s.saveTimer as number);
    if (!s.dirty) return;
    s.dirty = false;
    const empty = s.ink.isEmpty && s.paint.isEmpty && s.step === 0 && s.phase === "trace";
    if (empty) return;
    const [ink, paint, thumb] = await Promise.all([
      canvasToBlob(s.ink.canvas),
      canvasToBlob(s.paint.canvas),
      canvasToBlob(composite(320), "image/jpeg", 0.85),
    ]);
    await saveWork(
      {
        id,
        kind: "learn",
        drawingId: id,
        phase: s.phase,
        step: s.step,
        progress: s.phase === "trace" ? progressPercent(s.step, s.lines.length) : 100,
        bg: s.bg,
        stars: s.phase === "trace" ? 0 : starsFor(s.scores),
        updatedAt: Date.now(),
      },
      { ink, paint, thumb },
    );
  }, [composite, id, s]);

  const scheduleSave = useCallback(
    (delay = 1200) => {
      s.dirty = true;
      window.clearTimeout(s.saveTimer as number);
      s.saveTimer = window.setTimeout(() => void save(), delay);
    },
    [s, save],
  );

  // ---------- các bước tô nét ----------
  const setupStep = useCallback(
    (i: number, d: DrawingData) => {
      const line = d.lines[i];
      if (!line) {
        s.guide = [];
        return;
      }
      const { points, length } = samplePath(line.d, 4);
      s.guide = makeGuide(points);
      s.handLen = length;
      s.handStart = performance.now();
      s.stepStartOps = s.ink?.ops.length ?? 0;
      s.stage?.invalidate();
    },
    [s],
  );

  /** Tính lại các điểm đã chạm từ những nét còn lại của bước hiện tại (sau hoàn tác/làm lại). */
  const recomputeHits = useCallback(() => {
    if (!s.ink) return;
    for (const g of s.guide) g.hit = false;
    for (const op of s.ink.ops.slice(s.stepStartOps)) {
      if (op.kind !== "stroke" || op.brush === "eraser") continue;
      const r = op.size / 2 + 7;
      const p = op.pts;
      for (let i = 0; i < p.length; i += 2) {
        const j = Math.max(0, i - 2);
        markSegment(s.guide, { x: p[j], y: p[j + 1] }, { x: p[i], y: p[i + 1] }, r);
      }
    }
  }, [s]);

  const enterColor = useCallback(() => {
    setPhase("color");
    s.phase = "color";
    setTool("brush");
    const cat = categoryOf(id).id;
    setBrush(cat === "flower" ? "marker" : "crayon");
    setSize(18);
    setColor(info.palette[0] ?? "#ff6b81");
    s.particles.celebrate(WORLD, WORLD);
    play("success");
    vibrate(40);
    flash("Giỏi quá! Giờ mình tô màu nhé 🎨");
    s.stage?.resetView();
  }, [flash, id, info.palette, s]);

  const completeStep = useCallback(
    (skipped = false) => {
      if (!data) return;
      s.scores.push(skipped ? Math.min(0.5, hitRatio(s.guide)) : hitRatio(s.guide));
      const end = s.guide[s.guide.length - 1];
      if (end && !skipped) s.particles.burst(end.x, end.y, 24, 4);
      const next = s.step + 1;
      setStep(next);
      s.step = next;
      if (next >= data.lines.length) {
        s.guide = [];
        enterColor();
      } else {
        if (!skipped) {
          play("step");
          vibrate(20);
        } else play("page");
        setupStep(next, data);
      }
      scheduleSave(300);
    },
    [data, enterColor, s, scheduleSave, setupStep],
  );

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
        s.ink = new OpLayer(WORLD, WORLD, RES);
        const regions = fillRegions(d);
        s.paint = new OpLayer(WORLD, WORLD, RES, {
          type: "regions",
          regions: () => regions,
          fallback: { type: "alpha", source: () => s.ink!.canvas },
        });
        let st = 0;
        let ph: Phase = "trace";
        if (work) {
          if (work.ink) s.ink.setBase(await blobToImage(work.ink));
          if (work.paint) s.paint.setBase(await blobToImage(work.paint));
          st = Math.min(work.step, d.lines.length);
          ph = work.phase;
          setBg(work.bg);
          s.bg = work.bg;
          setStars(work.stars);
          // bài cũ đã qua một số bước: coi như các bước đó đạt (không rõ điểm)
          s.scores = Array.from({ length: st }, () => (work.stars >= 3 ? 1 : work.stars === 2 ? 0.88 : 0.75));
        }
        if (!alive) return;
        if (ph === "trace" && st >= d.lines.length) ph = "color";
        setStep(st);
        s.step = st;
        setPhase(ph);
        s.phase = ph;
        if (ph !== "trace") setBrush(categoryOf(id).id === "flower" ? "marker" : "crayon");
        setData(d);
        if (ph === "trace") setupStep(st, d);
        s.loaded = true;
        s.stage?.invalidate();
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, s, setupStep]);

  // ---------- Stage ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const strokeLayer = () => (s.phase === "trace" ? s.ink! : s.paint!);

    const startStroke = (p: WorldPt) => {
      const tr = s.phase === "trace";
      const op: StrokeOp = tr
        ? { kind: "stroke", brush: "pen", color: s.inkColor, size: s.inkSize, pts: [p.x, p.y], seed: newSeed() }
        : {
            kind: "stroke",
            brush: s.tool === "eraser" ? "eraser" : s.brush,
            color: s.color,
            size: s.size,
            pts: [p.x, p.y],
            seed: newSeed(),
          };
      const layer = strokeLayer();
      const r = layer.beginStroke(op);
      r.add(p.x, p.y);
      s.active = { layer, op, r };
      if (tr) markSegment(s.guide, p, p, op.size / 2 + 7);
    };

    const stage = new Stage(canvas, WORLD, WORLD, {
      animating: () => s.phase === "trace" || s.particles.active,
      onViewChange: setZoomed,
      draw: (g) => {
        g.fillStyle = s.bg;
        g.fillRect(0, 0, WORLD, WORLD);
        const paint = s.paint!;
        g.drawImage(paint.canvas, 0, 0, WORLD, WORLD);
        if (paint.liveCanvas) {
          g.globalAlpha = 0.5;
          g.drawImage(paint.liveCanvas, 0, 0, WORLD, WORLD);
          g.globalAlpha = 1;
        }
        g.drawImage(s.ink!.canvas, 0, 0, WORLD, WORLD);
        if (s.phase === "trace") drawGuide(g);
        s.particles.draw(g);
      },
      overlay: (g) => {
        if (!s.magnifier || !s.active || !s.pointer) return;
        drawLoupe(g, stage, s.pointer);
      },
      down: (p) => {
        s.pointer = p;
        s.downAt = p;
        s.last = p;
        if (s.phase !== "trace" && s.tool === "fill") return;
        startStroke(p);
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
          if (s.phase === "trace") {
            const fresh = markSegment(s.guide, s.last, p, a.op.size / 2 + 7);
            if (fresh > 0) {
              const now = performance.now();
              s.particles.burst(p.x, p.y, 3 + Math.min(4, fresh), 2.2);
              if (now - s.lastPop > 140) {
                s.lastPop = now;
                play("pop");
              }
            }
          }
          s.last = p;
        }
      },
      up: (p) => {
        s.pointer = null;
        if (s.phase !== "trace" && s.tool === "fill" && !s.active) {
          const d0 = s.downAt;
          if (d0 && Math.hypot(p.x - d0.x, p.y - d0.y) < 12) {
            if (s.paint!.apply({ kind: "fill", x: p.x, y: p.y, color: s.color })) {
              play("fill");
              s.particles.burst(p.x, p.y, 10, 2.6);
              rerender();
              scheduleSave();
            }
          }
          return;
        }
        const a = s.active;
        if (!a) return;
        a.layer.endStroke();
        s.active = null;
        rerender();
        scheduleSave();
        if (s.phase === "trace" && isStepDone(s.guide)) completeStep();
      },
      cancel: () => {
        s.pointer = null;
        const a = s.active;
        if (!a) return;
        a.layer.endStroke();
        a.layer.undo();
        a.layer.redoOps.pop();
        s.active = null;
        if (s.phase === "trace") recomputeHits();
        rerender();
      },
    });
    s.stage = stage;

    function drawGuide(g: CanvasRenderingContext2D) {
      const lines = data!.lines;
      const i = s.step;
      g.lineCap = "round";
      g.lineJoin = "round";
      // các nét sắp tới: thật mờ để bé thấy hình tổng thể
      g.strokeStyle = "rgba(90, 110, 160, 0.09)";
      for (let k = i + 1; k < lines.length; k++) {
        g.lineWidth = lines[k].w;
        g.stroke(s.lines[k]);
      }
      const path = s.lines[i];
      if (!path) return;
      const w = lines[i].w;
      const t = performance.now();
      // dải sáng quanh nét cần tô
      g.strokeStyle = "rgba(255, 196, 0, 0.32)";
      g.lineWidth = w + 16;
      g.stroke(path);
      // phần đã tô trúng chuyển xanh
      g.fillStyle = "rgba(60, 200, 110, 0.5)";
      for (const p of s.guide) {
        if (!p.hit) continue;
        g.beginPath();
        g.arc(p.x, p.y, w / 2 + 5, 0, Math.PI * 2);
        g.fill();
      }
      // nét đứt chạy
      g.setLineDash([8, 9]);
      g.lineDashOffset = -t / 40;
      g.strokeStyle = "#ff8a00";
      g.lineWidth = 2.6;
      g.stroke(path);
      g.setLineDash([]);
      // chấm xuất phát nhấp nháy
      const start = s.guide[0];
      if (start && !start.hit) {
        const pulse = 1 + 0.25 * Math.sin(t / 180);
        g.fillStyle = "#4cd97b";
        g.beginPath();
        g.arc(start.x, start.y, 7 * pulse, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#fff";
        g.lineWidth = 2.5;
        g.stroke();
      }
      // bàn tay minh hoạ đi dọc nét (lặp lại cho tới khi bé bắt đầu tô)
      const anyHit = s.guide.some((p) => p.hit);
      const dur = Math.min(3200, 700 + s.handLen * 5);
      const elapsed = t - s.handStart;
      if ((!anyHit || t < s.forceHandUntil) && s.hand?.complete && s.guide.length) {
        const cycle = elapsed % (dur + 900);
        const k = Math.min(1, cycle / dur);
        const idx = Math.min(s.guide.length - 1, Math.floor(k * (s.guide.length - 1)));
        const hp = s.guide[idx];
        // vết của bàn tay
        g.strokeStyle = "rgba(255, 138, 0, 0.75)";
        g.lineWidth = 4;
        g.beginPath();
        for (let q = 0; q <= idx; q++) g.lineTo(s.guide[q].x, s.guide[q].y);
        g.stroke();
        const hw = 34;
        const hh = (hw * 171) / 129;
        g.globalAlpha = cycle > dur ? Math.max(0, 1 - (cycle - dur) / 600) : 1;
        g.drawImage(s.hand, hp.x - hw * 0.25, hp.y - hh * 0.02, hw, hh);
        g.globalAlpha = 1;
      }
    }

    return () => {
      stage.dispose();
      s.stage = null;
    };
  }, [completeStep, data, recomputeHits, rerender, s, scheduleSave]);

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
  }, [bg, phase, s]);

  // ---------- hành động ----------
  const undo = () => {
    const layer = tracing ? s.ink : s.paint;
    if (!layer) return;
    if (tracing && layer.ops.length <= s.stepStartOps) return;
    layer.undo();
    if (tracing) recomputeHits();
    play("erase");
    rerender();
    scheduleSave();
    s.stage?.invalidate();
  };
  const redo = () => {
    const layer = tracing ? s.ink : s.paint;
    if (!layer) return;
    layer.redo();
    if (tracing) recomputeHits();
    rerender();
    scheduleSave();
    s.stage?.invalidate();
    if (tracing && isStepDone(s.guide)) completeStep();
  };
  const canUndo = tracing ? (s.ink?.ops.length ?? 0) > s.stepStartOps : !!s.paint?.canUndo;
  const canRedo = tracing ? !!s.ink?.canRedo : !!s.paint?.canRedo;

  const replayHint = () => {
    s.handStart = performance.now();
    s.forceHandUntil = s.handStart + Math.min(3200, 700 + s.handLen * 5);
  };

  const finish = async () => {
    setPhase("done");
    s.phase = "done";
    const st = starsFor(s.scores);
    setStars(st);
    s.dirty = true;
    await save();
    s.particles.celebrate(WORLD, WORLD);
    play("success");
    vibrate(60);
    window.setTimeout(() => setDoneOpen(true), 700);
  };

  const restart = async () => {
    // chặn mọi lần lưu còn chờ (kể cả pagehide khi tải lại) để không ghi lại bản vừa xoá
    s.loaded = false;
    window.clearTimeout(s.saveTimer as number);
    await removeWork(id);
    window.location.reload();
  };

  const goHome = async () => {
    await save();
    router.push("/");
  };

  const changeBg = (c: string) => {
    setBg(c);
    s.bg = c;
    scheduleSave();
  };

  const allPalette = useMemo(() => {
    const seen = new Set(info.palette.map((c) => c.toLowerCase()));
    return [...info.palette, ...ALL_COLORS.filter((c) => !seen.has(c.toLowerCase()))];
  }, [info.palette]);

  if (error) {
    return (
      <div className="screen center-msg">
        <p>Không tải được tranh. Kiểm tra mạng rồi thử lại nhé!</p>
        <button type="button" className="pill-btn" onClick={() => window.location.reload()}>
          Thử lại
        </button>
      </div>
    );
  }

  const pct = tracing ? progressPercent(step, total) : 100;

  return (
    <div className={`screen draw-screen ${tracing ? "is-trace" : "is-color"}`}>
      <header className="draw-top">
        <IconButton icon="close" label="Về trang chủ" onClick={goHome} />
        <div className="draw-progress">
          <div className="draw-title">
            {tracing ? "Vẽ theo nét" : phase === "done" ? "Đã xong" : "Tô màu"} <small>· {drawingTitle(id)}</small>
          </div>
          <div className="bar">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="pct" aria-label={tracing ? `Bước ${Math.min(step + 1, total)} trên ${total}` : undefined}>
          {tracing ? `${Math.min(step + 1, total)}/${total}` : `${pct}%`}
        </span>
        <IconButton
          icon={prefs.magnifier ? "zoom" : "zoomOff"}
          label="Kính lúp"
          active={prefs.magnifier}
          onClick={() => {
            setPref("magnifier", !prefs.magnifier);
            flash(prefs.magnifier ? "Tắt kính lúp" : "Bật kính lúp: phóng to chỗ đang vẽ");
          }}
        />
        <IconButton icon="help" label="Hướng dẫn" onClick={() => setSheet("help")} />
        {!tracing && <IconButton icon="check" label="Xong" className="done-btn" onClick={() => void finish()} />}
      </header>

      <div className="stage-wrap">
        <canvas ref={canvasRef} className="stage" />
        {!data && <div className="loading-dot" aria-label="Đang tải" />}
        <button type="button" className="ref-card" onClick={() => setRefOpen(true)} aria-label="Xem tranh mẫu">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(id)} alt="" />
        </button>
        {zoomed && (
          <button type="button" className="fit-btn" onClick={() => s.stage?.resetView()} aria-label="Vừa màn hình">
            <Icon name="fit" size={22} />
          </button>
        )}
      </div>

      {tracing ? (
        <footer className="toolbar">
          <IconButton icon="undo" label="Hoàn tác" onClick={undo} disabled={!canUndo} />
          <IconButton icon="redo" label="Làm lại" onClick={redo} disabled={!canRedo} />
          <button type="button" className="icon-btn" aria-label="Màu bút" onClick={() => setSheet("ink")}>
            <span className="ink-dot" style={{ background: inkColor, width: 8 + inkSize * 2, height: 8 + inkSize * 2 }} />
          </button>
          <IconButton icon="hand" label="Xem cách vẽ" onClick={replayHint} />
          <button
            type="button"
            className="pill-btn skip-btn"
            onClick={() => {
              completeStep(true);
            }}
          >
            Bỏ qua <Icon name="next" size={20} />
          </button>
        </footer>
      ) : (
        <footer className="color-bar">
          <div className="palette-row">
            {info.palette.map((c) => (
              <button
                key={c}
                type="button"
                className={`paint-chip ${color === c && tool !== "eraser" ? "is-active" : ""}`}
                style={{ ["--c" as string]: c }}
                aria-label={`Màu ${c}`}
                onClick={() => {
                  play("pop");
                  setColor(c);
                  if (tool === "eraser") setTool("brush");
                }}
              />
            ))}
            <button type="button" className="paint-chip more" aria-label="Thêm màu" onClick={() => setSheet("colors")}>
              <Icon name="plus" size={22} />
            </button>
          </div>
          <div className="toolbar">
            <IconButton icon="brush" label="Kiểu cọ" active={tool === "brush"} onClick={() => (tool === "brush" ? setSheet("brush") : setTool("brush"))} />
            <IconButton icon="size" label="Cỡ cọ" onClick={() => setSheet("size")} />
            <IconButton icon="bucket" label="Thùng sơn" active={tool === "fill"} onClick={() => setTool("fill")} />
            <IconButton icon="eraser" label="Tẩy" active={tool === "eraser"} onClick={() => setTool("eraser")} />
            <IconButton icon="bg" label="Màu nền" onClick={() => setSheet("bg")} />
            <IconButton icon="undo" label="Hoàn tác" onClick={undo} disabled={!canUndo} />
            <IconButton icon="redo" label="Làm lại" onClick={redo} disabled={!canRedo} />
          </div>
        </footer>
      )}

      <Sheet open={sheet === "brush"} onClose={() => setSheet(null)} title="Chọn cọ">
        <BrushPicker
          value={brush}
          color={color}
          onChange={(b) => {
            setBrush(b);
            setTool("brush");
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet open={sheet === "size"} onClose={() => setSheet(null)} title="Cỡ cọ">
        <SizePicker
          value={size}
          color={tool === "eraser" ? "#bbb" : color}
          onChange={(v) => {
            setSize(v);
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet open={sheet === "colors"} onClose={() => setSheet(null)} title="Hộp màu">
        <Swatches
          colors={allPalette}
          value={color}
          onChange={(c) => {
            setColor(c);
            if (tool === "eraser") setTool("brush");
            setSheet(null);
          }}
          big
        />
        <CustomColor value={color} onChange={setColor} />
      </Sheet>
      <Sheet open={sheet === "bg"} onClose={() => setSheet(null)} title="Màu nền">
        <Swatches
          colors={BG_COLORS}
          value={bg}
          onChange={(c) => {
            changeBg(c);
            setSheet(null);
          }}
          big
        />
        <CustomColor value={bg} onChange={changeBg} />
      </Sheet>
      <Sheet open={sheet === "ink"} onClose={() => setSheet(null)} title="Bút vẽ nét">
        <Swatches colors={INK_COLORS} value={inkColor} onChange={setInkColor} big />
        <div className="sizes">
          {INK_SIZES.map((v) => (
            <button key={v} type="button" className={`size-dot ${v === inkSize ? "is-active" : ""}`} aria-label={`Cỡ ${v}`} onClick={() => setInkSize(v)}>
              <span style={{ width: v * 2, height: v * 2, background: inkColor }} />
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === "help"} onClose={() => setSheet(null)} title="Cách chơi">
        <ol className="help-list">
          <li>
            <b>Vẽ theo nét:</b> đặt ngón tay vào <span className="dot green" /> chấm xanh rồi đi theo <span className="dash" /> nét cam. Chỗ tô trúng sẽ chuyển xanh.
          </li>
          <li>Tô trúng gần hết nét là sang bước tiếp. Chạm <Icon name="hand" size={18} /> để xem lại cách vẽ, hoặc <b>Bỏ qua</b> nếu khó quá.</li>
          <li>
            <b>Tô màu:</b> chọn màu ở dưới, dùng cọ <Icon name="brush" size={18} /> hoặc thùng sơn <Icon name="bucket" size={18} /> chạm vào ô cần tô.
          </li>
          <li>Hai ngón tay để phóng to, di chuyển tranh. Bấm <Icon name="check" size={18} /> khi tô xong.</li>
          <li>Tranh tự lưu trong máy, xem lại ở mục &ldquo;Tranh của bé&rdquo;.</li>
        </ol>
        <button type="button" className="pill-btn danger-ghost" onClick={() => setConfirmRestart(true)}>
          <Icon name="refresh" size={18} /> Vẽ lại từ đầu
        </button>
      </Sheet>

      <Modal open={refOpen} onClose={() => setRefOpen(false)} className="ref-modal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl(id)} alt="Tranh mẫu" />
        <button type="button" className="pill-btn" onClick={() => setRefOpen(false)}>
          Đóng
        </button>
      </Modal>

      <Modal open={confirmRestart} onClose={() => setConfirmRestart(false)}>
        <h3 className="modal-title">Vẽ lại từ đầu?</h3>
        <p className="modal-text">Tranh đang vẽ sẽ bị xoá.</p>
        <div className="modal-actions">
          <button type="button" className="pill-btn ghost" onClick={() => setConfirmRestart(false)}>
            Thôi
          </button>
          <button type="button" className="pill-btn danger" onClick={() => void restart()}>
            Vẽ lại
          </button>
        </div>
      </Modal>

      {doneOpen && (
        <DoneDialog
          title={drawingTitle(id)}
          stars={stars}
          makeImage={() => composite(1000)}
          onClose={() => setDoneOpen(false)}
          onKeepColoring={() => setDoneOpen(false)}
          onRestart={() => {
            setDoneOpen(false);
            setConfirmRestart(true);
          }}
          onHome={() => void goHome()}
        />
      )}

      <Toast text={toast} />
    </div>
  );
}

/** Kính lúp: phóng to vùng quanh ngón tay, đặt ở góc đối diện (MagnifierView của app gốc). */
function drawLoupe(g: CanvasRenderingContext2D, stage: Stage, p: WorldPt) {
  const { x, y } = stage.toScreen(p.x, p.y);
  const { w } = stage.size;
  const R = Math.min(78, w * 0.16);
  const zoom = 2;
  const left = x > w / 2;
  const cx = left ? R + 12 : w - R - 12;
  const cy = R + 12;
  const d = stage.devicePixelRatio;
  const src = stage.screenCanvas;
  const sr = (R / zoom) * d;
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
  g.clip();
  g.drawImage(src, x * d - sr, y * d - sr, sr * 2, sr * 2, cx - R, cy - R, R * 2, R * 2);
  g.restore();
  g.strokeStyle = "#4aa8ff";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "rgba(74,168,255,.7)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx - 8, cy);
  g.lineTo(cx + 8, cy);
  g.moveTo(cx, cy - 8);
  g.lineTo(cx, cy + 8);
  g.stroke();
}
