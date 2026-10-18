"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WORLD, loadDrawing, type DrawingData } from "@/lib/drawing";
import { blobToImage, canvasToBlob } from "@/lib/export";
import { drawingTitle, thumbUrl } from "@/lib/manifest";
import { play, vibrate } from "@/lib/sound";
import { saveWork } from "@/lib/storage";
import Icon from "./Icon";
import { IconButton, Modal, Toast } from "./ui";

/**
 * Vẽ ra giấy (PaperActivity của app gốc): hiện từng nét theo thứ tự để bé chép ra giấy thật,
 * nút trước/sau, xem tranh tô màu và chụp ảnh tranh bé đã vẽ.
 */
export default function PaperScreen({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<DrawingData | null>(null);
  const [error, setError] = useState(false);
  const [step, setStep] = useState(0); // số nét đang hiện (1..total); total+1 = đã xong
  const [showColor, setShowColor] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDrawing(id)
      .then((d) => {
        setData(d);
        setStep(1);
      })
      .catch(() => setError(true));
  }, [id]);

  const total = data?.lines.length ?? 0;
  const done = data != null && step > total;

  const go = (delta: number) => {
    const next = Math.max(1, Math.min(total + 1, step + delta));
    if (next === step) return;
    setStep(next);
    if (next > total) {
      play("success");
      vibrate(40);
    } else play("page");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const savePhoto = async (file: File) => {
    try {
      const img = await blobToImage(file);
      const max = 1400;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const t = document.createElement("canvas");
      const tk = 320 / Math.max(c.width, c.height);
      t.width = Math.round(c.width * tk);
      t.height = Math.round(c.height * tk);
      t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
      const now = Date.now();
      await saveWork(
        { id: `photo_${now}`, kind: "photo", drawingId: id, phase: "done", step: total, progress: 100, bg: "#ffffff", stars: 0, updatedAt: now },
        { paint: await canvasToBlob(c, "image/jpeg", 0.88), thumb: await canvasToBlob(t, "image/jpeg", 0.85) },
      );
      play("success");
      setToast("Đã lưu ảnh vào “Tranh của bé” 📸");
      window.setTimeout(() => setToast(null), 2600);
    } catch {
      setToast("Không mở được ảnh");
      window.setTimeout(() => setToast(null), 2200);
    }
  };

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

  return (
    <div className="screen paper-screen">
      <header className="draw-top">
        <IconButton icon="back" label="Về trang chủ" onClick={() => router.push("/")} />
        <div className="draw-progress">
          <div className="draw-title">
            Vẽ ra giấy <small>· {drawingTitle(id)}</small>
          </div>
          <div className="bar">
            <span style={{ width: `${total ? (Math.min(step, total) / total) * 100 : 0}%` }} />
          </div>
        </div>
        <span className="pct">{done ? "Xong" : `${step}/${total}`}</span>
        <IconButton icon="eye" label="Xem màu" active={showColor} onClick={() => setShowColor((v) => !v)} />
        <IconButton icon="image" label="Tranh mẫu" onClick={() => setRefOpen(true)} />
      </header>

      <div className="paper-stage">
        <div className="paper-sheet">
          {data ? (
            <svg viewBox={`0 0 ${WORLD} ${WORLD}`} className="paper-svg" role="img" aria-label={`Bước ${step}`}>
              {(showColor || done) && data.blocks.map((b, i) => <path key={`b${i}`} d={b.d} fill={b.fill} />)}
              {data.lines.map((l, i) => {
                if (!done && i >= step) return null;
                const current = !done && i === step - 1;
                return (
                  <path
                    key={current ? `cur${step}` : `l${i}`}
                    d={l.d}
                    pathLength={current ? 1 : undefined}
                    className={current ? "paper-current" : undefined}
                    fill="none"
                    stroke={current ? "#ff4d6d" : "#2b2b2b"}
                    strokeWidth={current ? l.w + 2 : l.w}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </svg>
          ) : (
            <div className="loading-dot" />
          )}
        </div>
        {done && (
          <div className="paper-done">
            <p>🎉 Bé chép xong rồi! Chụp ảnh tranh của bé nhé.</p>
          </div>
        )}
      </div>

      <footer className="paper-nav">
        <button type="button" className="nav-btn" onClick={() => go(-1)} disabled={step <= 1} aria-label="Nét trước">
          <Icon name="back" size={34} />
        </button>
        <div className="paper-mid">
          <button type="button" className="pill-btn" onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={20} /> Chụp tranh
          </button>
          {done && (
            <Link className="pill-btn ghost" href={`/draw/${id}/`}>
              <Icon name="pencil" size={18} /> Vẽ trên màn hình
            </Link>
          )}
        </div>
        <button type="button" className="nav-btn primary" onClick={() => go(1)} disabled={done} aria-label="Nét tiếp">
          <Icon name="next" size={34} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void savePhoto(f);
            e.target.value = "";
          }}
        />
      </footer>

      <Modal open={refOpen} onClose={() => setRefOpen(false)} className="ref-modal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl(id)} alt="Tranh mẫu" />
        <button type="button" className="pill-btn" onClick={() => setRefOpen(false)}>
          Đóng
        </button>
      </Modal>
      <Toast text={toast} />
    </div>
  );
}
