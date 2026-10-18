"use client";

import { useEffect, useRef, useState } from "react";
import { canvasToBlob, downloadBlob, fileStamp } from "@/lib/export";
import { FRAMES, frameUrl, type FrameInfo } from "@/lib/manifest";
import { play } from "@/lib/sound";
import { Img, Toast, useToast } from "./ui";

type Place = { x: number; y: number; scale: number };

/**
 * Treo tranh lên tường (DecorateActivity của app gốc): chọn phòng/khung ở dải dưới, kéo và
 * chụm hai ngón để chỉnh vị trí, kích thước tranh trong khung, rồi "Lưu".
 */
export default function Decorate({ art, onClose }: { art: HTMLCanvasElement; onClose: () => void }) {
  const [frame, setFrame] = useState<FrameInfo>(FRAMES[0]);
  const [place, setPlace] = useState<Place>({ x: 0, y: 0, scale: 1 });
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [toast, flash] = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: Place; ax: number; ay: number; dist: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = frameUrl(frame.id);
    setPlace({ x: 0, y: 0, scale: 1 });
    return () => {
      i.onload = null;
    };
  }, [frame]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = frame.width;
    c.height = frame.height;
    render(c.getContext("2d")!, frame, img, art, place);
  }, [art, frame, img, place]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveImage = async () => {
    play("tap");
    const c = document.createElement("canvas");
    const k = 2;
    c.width = frame.width * k;
    c.height = frame.height * k;
    const g = c.getContext("2d")!;
    g.scale(k, k);
    render(g, frame, img, art, place);
    downloadBlob(await canvasToBlob(c, "image/jpeg", 0.92), `tranh-treo-tuong-${fileStamp()}.jpg`);
    flash("Đã lưu ảnh");
  };

  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * frame.width, y: ((e.clientY - r.top) / r.height) * frame.height };
  };

  const begin = () => {
    const pts = [...pointers.current.values()];
    const ax = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const ay = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { start: place, ax, ay, dist };
  };

  return (
    <div className="decorate" role="dialog" aria-label="Treo tranh">
      <header className="decorate-top">
        <button type="button" className="decorate-back" aria-label="Quay lại" onClick={onClose}>
          <Img name="ic_decorate_back" />
        </button>
        <button type="button" className="decorate-help" aria-label="Hướng dẫn" onClick={() => flash("Bé có thể kéo và phóng to bức tranh cho đẹp hơn.")}>
          <Img name="ic_decroate_help" />
        </button>
        <button type="button" className="decorate-save" onClick={() => void saveImage()}>
          Lưu
        </button>
      </header>
      <div className="decorate-stage">
        <canvas
          ref={canvasRef}
          className="decorate-canvas"
          style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, local(e));
            begin();
          }}
          onPointerMove={(e) => {
            if (!pointers.current.has(e.pointerId) || !gesture.current) return;
            pointers.current.set(e.pointerId, local(e));
            const pts = [...pointers.current.values()];
            const ax = pts.reduce((a, p) => a + p.x, 0) / pts.length;
            const ay = pts.reduce((a, p) => a + p.y, 0) / pts.length;
            const g = gesture.current;
            let scale = g.start.scale;
            if (pts.length > 1 && g.dist > 0) scale = Math.max(0.4, Math.min(2.5, g.start.scale * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.dist)));
            setPlace({ x: g.start.x + ax - g.ax, y: g.start.y + ay - g.ay, scale });
          }}
          onPointerUp={(e) => {
            pointers.current.delete(e.pointerId);
            if (pointers.current.size) begin();
            else gesture.current = null;
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            gesture.current = null;
          }}
          onWheel={(e) => setPlace((p) => ({ ...p, scale: Math.max(0.4, Math.min(2.5, p.scale * Math.exp(-e.deltaY * 0.0015))) }))}
        />
        <p className="decorate-tip">Kéo và phóng to tranh cho đẹp hơn.</p>
      </div>
      <div className="frame-list">
        {FRAMES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`frame-item ${f.id === frame.id ? "is-active" : ""}`}
            onClick={() => {
              play("tap");
              setFrame(f);
            }}
            aria-label={`Khung ${f.id}`}
          >
            <Img name={`frame_preview_${f.id}.webp`} />
          </button>
        ))}
      </div>
      <Toast text={toast} />
    </div>
  );
}

function render(g: CanvasRenderingContext2D, frame: FrameInfo, img: HTMLImageElement | null, art: HTMLCanvasElement, place: Place) {
  g.clearRect(0, 0, frame.width, frame.height);
  const hole = frame.hole ?? { x: frame.width * 0.15, y: frame.height * 0.15, w: frame.width * 0.7, h: frame.height * 0.5 };
  // tranh phủ kín ô khung (cover), sau đó áp dịch chuyển/thu phóng của bé
  const base = Math.max(hole.w / art.width, hole.h / art.height);
  const sc = base * place.scale;
  const w = art.width * sc;
  const h = art.height * sc;
  g.fillStyle = "#fff";
  g.fillRect(hole.x, hole.y, hole.w, hole.h);
  g.drawImage(art, hole.x + (hole.w - w) / 2 + place.x, hole.y + (hole.h - h) / 2 + place.y, w, h);
  if (img) g.drawImage(img, 0, 0, frame.width, frame.height);
}
