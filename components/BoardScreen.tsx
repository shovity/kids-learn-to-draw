"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SHAPE_COUNT, drawShape, loadShapes, loadStamps, shapeUrl, type BrushId, type ShapeOp, type StrokeOp, type StrokeRenderer } from "@/lib/brush";
import { blobToImage, canvasToBlob } from "@/lib/export";
import { OpLayer, newSeed } from "@/lib/layer";
import { Particles } from "@/lib/particles";
import { play, vibrate } from "@/lib/sound";
import { Stage, type WorldPt } from "@/lib/stage";
import { loadWork, removeWork, saveWork } from "@/lib/storage";
import DoneDialog from "./DoneDialog";
import { ALL_COLORS, BG_COLORS, Bubble, ColorPicker, Confirm, Img, ImgButton, PaletteRow, SizeList, Toast, anchorOf, useToast } from "./ui";

type Tool = "brush" | "eraser" | "shape";
type Popup = null | { id: "pen" | "color" | "size" | "shape" | "bg"; x: number };

// 5 cây bút của bảng vẽ (ic_pen_N + ic_pen_sample_N) ứng với các kiểu cọ.
const PENS: { brush: BrushId; title: string }[] = [
  { brush: "pen", title: "Bút chì" },
  { brush: "air", title: "Cọ mềm" },
  { brush: "fountain", title: "Bút dạ" },
  { brush: "marker", title: "Bút highlight" },
  { brush: "crayon", title: "Bút sáp" },
];

/** Bảng vẽ tự do (WhiteBoardActivity của app gốc). */
export default function BoardScreen() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [pen, setPen] = useState(0);
  const [shape, setShape] = useState(3);
  const [filled, setFilled] = useState(true);
  const [color, setColor] = useState("#5cbdff");
  const [size, setSize] = useState(9);
  const [eraserSize, setEraserSize] = useState(25);
  const [bg, setBg] = useState("#ffffff");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [popup, setPopup] = useState<Popup>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [toast, flash] = useToast();
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const s = useRef({
    stage: null as Stage | null,
    layer: null as OpLayer | null,
    photo: null as HTMLCanvasElement | null,
    active: null as { op: StrokeOp; r: StrokeRenderer } | null,
    shapeDraft: null as ShapeOp | null,
    last: null as WorldPt | null,
    particles: new Particles(),
    dirty: false,
    saveTimer: 0,
    tool: "brush" as Tool,
    pen: 0,
    shape: 3,
    filled: true,
    color: "",
    size: 9,
    eraserSize: 25,
    bg: "#ffffff",
    id: "",
  }).current;
  Object.assign(s, { tool, pen, shape, filled, color, size, eraserSize, bg });

  // ?id=board_… để mở lại; không có thì tạo tờ mới vừa khít khung vẽ.
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([loadStamps(), loadShapes()]);
      const q = new URLSearchParams(window.location.search).get("id");
      const work = q ? await loadWork(q) : undefined;
      if (!alive) return;
      const r = canvasRef.current?.getBoundingClientRect();
      const ratio = r && r.width > 0 ? r.height / r.width : 1.3;
      const d = work?.w && work.h ? { w: work.w, h: work.h } : { w: 800, h: Math.round(800 * Math.max(0.5, Math.min(2.2, ratio))) };
      s.id = work?.id ?? `board_${Date.now()}`;
      const layer = new OpLayer(d.w, d.h, 1.6);
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
      }
      s.layer = layer;
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
      canvasToBlob(composite(360), "image/jpeg", 0.85),
      s.photo ? canvasToBlob(s.photo, "image/jpeg", 0.88) : Promise.resolve(undefined),
    ]);
    await saveWork({ id: s.id, kind: "board", phase: "done", step: 0, progress: 100, bg: s.bg, stars: 0, updatedAt: Date.now(), w: l.width, h: l.height }, { paint, thumb, ink });
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
    const stage = new Stage(
      canvas,
      dims.w,
      dims.h,
      {
        animating: () => s.particles.active,
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
            g.globalAlpha = 0.8;
            drawShape(g, s.shapeDraft);
            g.globalAlpha = 1;
          }
          s.particles.draw(g);
        },
        down: (p) => {
          s.last = p;
          if (s.tool === "shape") {
            s.shapeDraft = { kind: "shape", shape: s.shape, color: s.color, filled: s.filled, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
            return;
          }
          const eraser = s.tool === "eraser";
          const op: StrokeOp = { kind: "stroke", brush: eraser ? "eraser" : PENS[s.pen].brush, color: s.color, size: (eraser ? s.eraserSize : s.size) * 1.6, pts: [p.x, p.y], seed: newSeed() };
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
        up: () => {
          if (s.shapeDraft) {
            const sh = s.shapeDraft;
            s.shapeDraft = null;
            if (Math.abs(sh.x1 - sh.x0) > 8 && Math.abs(sh.y1 - sh.y0) > 8) {
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
      },
      { flat: true, padding: 0 },
    );
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
  const toggle = (id: NonNullable<Popup>["id"]) => (e: React.MouseEvent<HTMLElement>) => {
    const x = anchorOf(e);
    setPopup((p) => (p?.id === id ? null : { id, x }));
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

  const exit = async () => {
    await save();
    router.push("/#board");
  };

  return (
    <div className="screen board-screen">
      <header className="board-top">
        <ImgButton icon="paint_close_btn" label="Thoát" className="top-close" onClick={() => (layer && !layer.isEmpty ? setConfirmExit(true) : void exit())} />
        <ImgButton
          icon="paint_undo_btn"
          label="Hoàn tác"
          className={`top-undo ${layer?.canUndo ? "" : "dim"}`}
          onClick={() => {
            if (!layer?.canUndo) return;
            layer.undo();
            play("erase");
            rerender();
            scheduleSave();
            s.stage?.invalidate();
          }}
        />
        <ImgButton
          icon="paint_redo_btn"
          label="Làm lại"
          className={`top-redo ${layer?.canRedo ? "" : "dim"}`}
          onClick={() => {
            if (!layer?.canRedo) return;
            layer.redo();
            rerender();
            scheduleSave();
            s.stage?.invalidate();
          }}
        />
        <ImgButton
          icon="paint_done_btn"
          label="Xong"
          className="top-done"
          onClick={async () => {
            if (layer?.isEmpty && !s.photo) {
              flash("Bé chưa vẽ gì cả");
              return;
            }
            s.dirty = true;
            await save();
            s.particles.celebrate(dims?.w ?? 800, dims?.h ?? 800);
            play("success");
            vibrate(40);
            window.setTimeout(() => setDoneOpen(true), 400);
          }}
        />
      </header>

      <div className="board-area">
        <canvas ref={canvasRef} className="stage" />
        {!dims && <div className="loading-ring" />}
      </div>

      <footer className="board-bar">
        <ImgButton
          icon="ic_whiteboard_brush"
          label="Bút vẽ"
          sel={tool === "brush"}
          onClick={(e) => {
            if (tool !== "brush") {
              setTool("brush");
              setPopup(null);
            } else toggle("pen")(e);
          }}
        />
        <ImgButton icon="ic_whiteboard_color" label="Chọn màu" onClick={toggle("color")} />
        <ImgButton icon="ic_whiteboard_size" label="Cỡ bút" sel={popup?.id === "size"} onClick={toggle("size")} />
        <ImgButton
          icon="ic_whiteboard_erase"
          label="Tẩy"
          sel={tool === "eraser"}
          onClick={(e) => {
            if (tool !== "eraser") {
              setTool("eraser");
              setPopup(null);
            } else toggle("size")(e);
          }}
        />
        <ImgButton
          icon="ic_whiteboard_geometry"
          label="Hình khối"
          sel={tool === "shape"}
          onClick={(e) => {
            setTool("shape");
            toggle("shape")(e);
          }}
        />
        <ImgButton icon="ic_whiteboard_bg" label="Nền" sel={popup?.id === "bg"} onClick={toggle("bg")} />
      </footer>

      {popup?.id === "pen" && (
        <Bubble anchor={popup.x} width={290} onClose={() => setPopup(null)}>
          <div className="pen-list">
            {PENS.map((p, i) => (
              <button
                key={p.brush}
                type="button"
                className={`pen-row ${i === pen ? "is-active" : ""}`}
                aria-label={p.title}
                onClick={() => {
                  play("tap");
                  setPen(i);
                  setPopup(null);
                }}
              >
                <Img name={`ic_pen_sample_${i + 1}`} className="pen-sample" />
                <Img name={`ic_pen_${i + 1}`} className="pen-icon" />
              </button>
            ))}
          </div>
        </Bubble>
      )}
      {popup?.id === "color" && (
        <Bubble anchor={popup.x} width={310} onClose={() => setPopup(null)}>
          <PaletteRow
            className="quick-colors"
            colors={ALL_COLORS}
            value={color}
            onChange={(c) => {
              setColor(c);
              setPickerKey((k) => k + 1);
            }}
          />
          <ColorPicker key={pickerKey} value={color} onChange={setColor} />
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
      {popup?.id === "shape" && (
        <Bubble anchor={popup.x} width={330} onClose={() => setPopup(null)}>
          <div className="shape-mode">
            <button type="button" className={filled ? "is-active" : ""} onClick={() => setFilled(true)}>
              Hình đặc
            </button>
            <button type="button" className={!filled ? "is-active" : ""} onClick={() => setFilled(false)}>
              Hình viền
            </button>
          </div>
          <div className="shape-grid">
            {Array.from({ length: SHAPE_COUNT }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={n === shape ? "is-active" : ""}
                aria-label={`Hình ${n}`}
                onClick={() => {
                  play("tap");
                  setShape(n);
                  setTool("shape");
                  setPopup(null);
                  flash("Kéo trên giấy để vẽ hình");
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shapeUrl(n, filled)} alt="" draggable={false} />
              </button>
            ))}
          </div>
        </Bubble>
      )}
      {popup?.id === "bg" && (
        <Bubble anchor={popup.x} width={300} onClose={() => setPopup(null)}>
          <PaletteRow
            className="bg-grid"
            colors={BG_COLORS}
            value={hasPhoto ? null : bg}
            onChange={(c) => {
              setBg(c);
              if (s.photo) {
                s.photo = null;
                setHasPhoto(false);
              }
              scheduleSave();
            }}
          />
          <button type="button" className="photo-btn" onClick={() => photoRef.current?.click()}>
            <Img name="ic_whiteboard_photo" />
            <span>{hasPhoto ? "Đổi ảnh nền" : "Chọn ảnh làm nền"}</span>
          </button>
        </Bubble>
      )}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pickPhoto(f);
          e.target.value = "";
          setPopup(null);
        }}
      />

      <Confirm open={confirmExit} text="Thoát bây giờ? Tranh đã được lưu." ok="Có" onCancel={() => setConfirmExit(false)} onOk={() => void exit()} />
      {doneOpen && layer && <DoneDialog makeImage={() => composite(1400)} onClose={() => setDoneOpen(false)} />}
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
