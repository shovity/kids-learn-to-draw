"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadStamps, renderShape, shapePath, type BrushId, type ShapeId, type ShapeOp, type StrokeOp, type StrokeRenderer } from "@/lib/brush";
import { blobToImage, canvasToBlob } from "@/lib/export";
import { OpLayer, newSeed } from "@/lib/layer";
import { Particles } from "@/lib/particles";
import { play, vibrate } from "@/lib/sound";
import { Stage, type WorldPt } from "@/lib/stage";
import { loadWork, removeWork, saveWork } from "@/lib/storage";
import DoneDialog from "./DoneDialog";
import Icon from "./Icon";
import { ALL_COLORS, BG_COLORS, BrushPicker, CustomColor, IconButton, Modal, Sheet, SizePicker, Swatches, Toast } from "./ui";

type Tool = "brush" | "eraser" | "fill" | "shape";
type SheetId = null | "brush" | "size" | "shape" | "bg" | "colors";

const SHAPES: { id: ShapeId; title: string }[] = [
  { id: "line", title: "Đường thẳng" },
  { id: "rect", title: "Hình chữ nhật" },
  { id: "ellipse", title: "Hình tròn" },
  { id: "triangle", title: "Tam giác" },
  { id: "star", title: "Ngôi sao" },
  { id: "heart", title: "Trái tim" },
];

/** Bảng vẽ tự do (WhiteBoardActivity của app gốc). */
export default function BoardScreen() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [workId, setWorkId] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState<BrushId>("pen");
  const [shape, setShape] = useState<ShapeId>("ellipse");
  const [filled, setFilled] = useState(false);
  const [color, setColor] = useState("#1e6fe8");
  const [size, setSize] = useState(9);
  const [bg, setBg] = useState("#ffffff");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const s = useRef({
    stage: null as Stage | null,
    layer: null as OpLayer | null,
    photo: null as HTMLCanvasElement | null,
    active: null as { op: StrokeOp; r: StrokeRenderer } | null,
    shapeDraft: null as ShapeOp | null,
    last: null as WorldPt | null,
    downAt: null as WorldPt | null,
    particles: new Particles(),
    dirty: false,
    saveTimer: 0 as number,
    createdAt: Date.now(),
    tool: "brush" as Tool,
    brush: "pen" as BrushId,
    shape: "ellipse" as ShapeId,
    filled: false,
    color: "",
    size: 9,
    bg: "#ffffff",
    id: "",
  }).current;
  Object.assign(s, { tool, brush, shape, filled, color, size, bg });

  // Chọn tranh: ?id=board_… để mở lại, không có thì tạo mới theo hướng màn hình.
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadStamps();
      const q = new URLSearchParams(window.location.search).get("id");
      const work = q ? await loadWork(q) : undefined;
      if (!alive) return;
      const portrait = window.innerHeight >= window.innerWidth;
      const d = work?.w && work.h ? { w: work.w, h: work.h } : portrait ? { w: 800, h: 1060 } : { w: 1200, h: 820 };
      const id = work?.id ?? `board_${Date.now()}`;
      s.id = id;
      const layer = new OpLayer(d.w, d.h, 1.6, { type: "color" });
      if (work?.paint) layer.setBase(await blobToImage(work.paint));
      if (work?.ink) {
        const img = await blobToImage(work.ink);
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d")!.drawImage(img, 0, 0);
        s.photo = c;
        setHasPhoto(true);
      }
      if (work) {
        setBg(work.bg);
        s.bg = work.bg;
        s.createdAt = Number(id.split("_")[1]) || Date.now();
      }
      s.layer = layer;
      setWorkId(id);
      setDims(d);
    })();
    return () => {
      alive = false;
    };
  }, [s]);

  const composite = useCallback(
    (maxPx: number) => {
      const l = s.layer!;
      const k = maxPx / Math.max(l.width, l.height);
      const c = document.createElement("canvas");
      c.width = Math.round(l.width * k);
      c.height = Math.round(l.height * k);
      const g = c.getContext("2d")!;
      g.fillStyle = s.bg;
      g.fillRect(0, 0, c.width, c.height);
      if (s.photo) drawCover(g, s.photo, c.width, c.height);
      g.drawImage(l.canvas, 0, 0, c.width, c.height);
      return c;
    },
    [s],
  );

  const save = useCallback(async () => {
    const l = s.layer;
    if (!l || !s.dirty) return;
    window.clearTimeout(s.saveTimer);
    s.dirty = false;
    if (l.isEmpty && !s.photo) {
      await removeWork(s.id);
      return;
    }
    const [paint, thumb, ink] = await Promise.all([
      canvasToBlob(l.canvas),
      canvasToBlob(composite(320), "image/jpeg", 0.85),
      s.photo ? canvasToBlob(s.photo, "image/jpeg", 0.88) : Promise.resolve(undefined),
    ]);
    await saveWork(
      { id: s.id, kind: "board", phase: "done", step: 0, progress: 100, bg: s.bg, stars: 0, updatedAt: Date.now(), w: l.width, h: l.height },
      { paint, thumb, ink },
    );
  }, [composite, s]);

  const scheduleSave = useCallback(
    (delay = 1200) => {
      s.dirty = true;
      window.clearTimeout(s.saveTimer);
      s.saveTimer = window.setTimeout(() => void save(), delay);
    },
    [s, save],
  );

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
    const canvas = canvasRef.current;
    if (!canvas || !dims || !s.layer) return;
    const layer = s.layer;
    const stage = new Stage(canvas, dims.w, dims.h, {
      animating: () => s.particles.active,
      onViewChange: setZoomed,
      draw: (g) => {
        g.fillStyle = s.bg;
        g.fillRect(0, 0, dims.w, dims.h);
        if (s.photo) drawCover(g, s.photo, dims.w, dims.h);
        g.drawImage(layer.canvas, 0, 0, dims.w, dims.h);
        if (layer.liveCanvas) {
          g.globalAlpha = 0.5;
          g.drawImage(layer.liveCanvas, 0, 0, dims.w, dims.h);
          g.globalAlpha = 1;
        }
        if (s.shapeDraft) {
          // xem trước hình đang kéo (vẽ ở toạ độ thế giới, scale 1)
          renderShapeWorld(g, s.shapeDraft);
        }
        s.particles.draw(g);
      },
      down: (p) => {
        s.downAt = p;
        s.last = p;
        if (s.tool === "fill") return;
        if (s.tool === "shape") {
          s.shapeDraft = { kind: "shape", shape: s.shape, color: s.color, size: s.size, filled: s.filled, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
          return;
        }
        const op: StrokeOp = { kind: "stroke", brush: s.tool === "eraser" ? "eraser" : s.brush, color: s.color, size: s.size, pts: [p.x, p.y], seed: newSeed() };
        const r = layer.beginStroke(op);
        r.add(p.x, p.y);
        s.active = { op, r };
      },
      move: (pts) => {
        for (const p of pts) {
          if (s.shapeDraft) {
            s.shapeDraft.x1 = p.x;
            s.shapeDraft.y1 = p.y;
            continue;
          }
          const a = s.active;
          if (!a || !s.last || Math.hypot(p.x - s.last.x, p.y - s.last.y) < 0.6) continue;
          a.op.pts.push(p.x, p.y);
          a.r.add(p.x, p.y);
          s.last = p;
        }
      },
      up: (p) => {
        if (s.tool === "fill") {
          const d0 = s.downAt;
          if (d0 && Math.hypot(p.x - d0.x, p.y - d0.y) < 14 && layer.apply({ kind: "fill", x: p.x, y: p.y, color: s.color })) {
            play("fill");
            s.particles.burst(p.x, p.y, 10, 3);
            rerender();
            scheduleSave();
          }
          return;
        }
        if (s.shapeDraft) {
          const sh = s.shapeDraft;
          s.shapeDraft = null;
          if (Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0) > 6) {
            layer.apply(sh);
            play("pop");
            rerender();
            scheduleSave();
          }
          return;
        }
        if (!s.active) return;
        layer.endStroke();
        s.active = null;
        rerender();
        scheduleSave();
      },
      cancel: () => {
        s.shapeDraft = null;
        if (!s.active) return;
        layer.endStroke();
        layer.undo();
        layer.redoOps.pop();
        s.active = null;
        rerender();
      },
    });
    s.stage = stage;
    return () => {
      stage.dispose();
      s.stage = null;
    };
  }, [dims, rerender, s, scheduleSave]);

  useEffect(() => {
    s.stage?.invalidate();
  }, [bg, hasPhoto, s]);

  const layer = s.layer;
  const flash = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2200);
  };

  const pickPhoto = async (f: File) => {
    try {
      const img = await blobToImage(f);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      s.photo = c;
      setHasPhoto(true);
      scheduleSave();
    } catch {
      flash("Không mở được ảnh");
    }
  };

  return (
    <div className="screen draw-screen board-screen">
      <header className="draw-top">
        <IconButton
          icon="back"
          label="Về trang chủ"
          onClick={async () => {
            await save();
            router.push("/");
          }}
        />
        <div className="draw-progress">
          <div className="draw-title">Bảng vẽ</div>
        </div>
        <IconButton icon="trash" label="Xoá hết" onClick={() => setConfirmClear(true)} disabled={!layer || (layer.isEmpty && !hasPhoto)} />
        <IconButton
          icon="check"
          label="Xong"
          className="done-btn"
          onClick={async () => {
            s.dirty = true;
            await save();
            s.particles.celebrate(dims?.w ?? 800, dims?.h ?? 800);
            play("success");
            vibrate(40);
            window.setTimeout(() => setDoneOpen(true), 500);
          }}
        />
      </header>

      <div className="stage-wrap">
        <canvas ref={canvasRef} className="stage" />
        {!workId && <div className="loading-dot" />}
        {zoomed && (
          <button type="button" className="fit-btn" onClick={() => s.stage?.resetView()} aria-label="Vừa màn hình">
            <Icon name="fit" size={22} />
          </button>
        )}
      </div>

      <footer className="color-bar">
        <div className="palette-row">
          {ALL_COLORS.map((c) => (
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
          <button type="button" className="paint-chip more" aria-label="Tự chọn màu" onClick={() => setSheet("colors")}>
            <Icon name="palette" size={22} />
          </button>
        </div>
        <div className="toolbar">
          <IconButton icon="brush" label="Kiểu cọ" active={tool === "brush"} onClick={() => (tool === "brush" ? setSheet("brush") : setTool("brush"))} />
          <IconButton icon="shapes" label="Hình khối" active={tool === "shape"} onClick={() => (tool === "shape" ? setSheet("shape") : setTool("shape"))} />
          <IconButton icon="size" label="Cỡ cọ" onClick={() => setSheet("size")} />
          <IconButton icon="bucket" label="Thùng sơn" active={tool === "fill"} onClick={() => setTool("fill")} />
          <IconButton icon="eraser" label="Tẩy" active={tool === "eraser"} onClick={() => setTool("eraser")} />
          <IconButton icon="bg" label="Nền" onClick={() => setSheet("bg")} />
          <IconButton
            icon="undo"
            label="Hoàn tác"
            disabled={!layer?.canUndo}
            onClick={() => {
              layer?.undo();
              play("erase");
              rerender();
              scheduleSave();
              s.stage?.invalidate();
            }}
          />
          <IconButton
            icon="redo"
            label="Làm lại"
            disabled={!layer?.canRedo}
            onClick={() => {
              layer?.redo();
              rerender();
              scheduleSave();
              s.stage?.invalidate();
            }}
          />
        </div>
      </footer>

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
      <Sheet open={sheet === "shape"} onClose={() => setSheet(null)} title="Hình khối">
        <div className="shape-grid">
          {SHAPES.map((sh) => (
            <button
              key={sh.id}
              type="button"
              className={`shape-item ${shape === sh.id ? "is-active" : ""}`}
              onClick={() => {
                play("tap");
                setShape(sh.id);
                setTool("shape");
                setSheet(null);
              }}
            >
              <ShapeIcon shape={sh.id} filled={filled} color={color} />
              <span>{sh.title}</span>
            </button>
          ))}
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={filled} onChange={(e) => setFilled(e.target.checked)} />
          <span>Tô đặc hình</span>
        </label>
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
          colors={ALL_COLORS}
          value={color}
          onChange={(c) => {
            setColor(c);
            setSheet(null);
          }}
          big
        />
        <CustomColor value={color} onChange={setColor} />
      </Sheet>
      <Sheet open={sheet === "bg"} onClose={() => setSheet(null)} title="Nền tranh">
        <Swatches
          colors={BG_COLORS}
          value={bg}
          onChange={(c) => {
            setBg(c);
            scheduleSave();
          }}
          big
        />
        <CustomColor
          value={bg}
          onChange={(c) => {
            setBg(c);
            scheduleSave();
          }}
        />
        <div className="modal-actions wrap">
          <button type="button" className="pill-btn" onClick={() => photoRef.current?.click()}>
            <Icon name="image" size={18} /> Chọn ảnh nền
          </button>
          {hasPhoto && (
            <button
              type="button"
              className="pill-btn ghost"
              onClick={() => {
                s.photo = null;
                setHasPhoto(false);
                scheduleSave();
              }}
            >
              Bỏ ảnh nền
            </button>
          )}
        </div>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickPhoto(f);
            e.target.value = "";
            setSheet(null);
          }}
        />
      </Sheet>

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)}>
        <h3 className="modal-title">Xoá hết bảng vẽ?</h3>
        <div className="modal-actions">
          <button type="button" className="pill-btn ghost" onClick={() => setConfirmClear(false)}>
            Thôi
          </button>
          <button
            type="button"
            className="pill-btn danger"
            onClick={() => {
              layer?.apply({ kind: "clear" });
              s.photo = null;
              setHasPhoto(false);
              setConfirmClear(false);
              play("erase");
              rerender();
              scheduleSave();
              s.stage?.invalidate();
            }}
          >
            Xoá
          </button>
        </div>
      </Modal>

      {doneOpen && layer && (
        <DoneDialog
          title="Bảng vẽ của bé"
          stars={0}
          makeImage={() => composite(1400)}
          onClose={() => setDoneOpen(false)}
          onKeepColoring={() => setDoneOpen(false)}
          onHome={() => router.push("/")}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}

function drawCover(g: CanvasRenderingContext2D, img: HTMLCanvasElement, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Xem trước hình đang kéo, vẽ theo transform hiện tại của Stage (toạ độ thế giới). */
function renderShapeWorld(g: CanvasRenderingContext2D, op: ShapeOp) {
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = op.size;
  g.strokeStyle = op.color;
  g.fillStyle = op.color;
  g.globalAlpha = 0.85;
  g.beginPath();
  shapePath(g, op);
  if (op.filled && op.shape !== "line") g.fill();
  else g.stroke();
  g.restore();
}

function ShapeIcon({ shape, filled, color }: { shape: ShapeId; filled: boolean; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    renderShape(g, { kind: "shape", shape, color, size: 4, filled, x0: 8, y0: 8, x1: 52, y1: 52 }, 1);
  }, [shape, filled, color]);
  return <canvas ref={ref} width={60} height={60} />;
}
