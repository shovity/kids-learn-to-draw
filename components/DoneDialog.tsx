"use client";

import { useEffect, useState } from "react";
import { canvasToBlob, downloadBlob, fileStamp, shareBlob } from "@/lib/export";
import { ui } from "@/lib/manifest";
import { play } from "@/lib/sound";
import Decorate from "./Decorate";
import { Img, StarsImg, Toast, useToast } from "./ui";

/** dialog_draw_done của app gốc: "Share my work" — Lưu / Đóng khung / Chia sẻ. */
export default function DoneDialog({
  refImage,
  stars,
  makeImage,
  onClose,
}: {
  refImage?: string;
  stars?: number;
  makeImage: () => HTMLCanvasElement;
  onClose: () => void;
}) {
  // chụp tranh một lần khi mở hộp thoại
  const [canvas] = useState(makeImage);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [decorate, setDecorate] = useState(false);
  const [toast, flash] = useToast();

  useEffect(() => {
    let u: string | null = null;
    void canvasToBlob(canvas).then((b) => {
      setBlob(b);
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [canvas]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !decorate && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decorate, onClose]);

  const name = `tranh-cua-be-${fileStamp()}.png`;

  if (decorate) return <Decorate art={canvas} onClose={() => setDecorate(false)} />;

  return (
    <div className="done-dialog" role="dialog" aria-label="Chia sẻ tác phẩm" style={{ backgroundImage: `url(${ui("dialog_bg.webp")})` }}>
      <button type="button" className="done-close" aria-label="Đóng" onClick={onClose}>
        <Img name="dialog_close_btn" />
      </button>
      <h2 className="done-title">Chia sẻ tác phẩm</h2>
      <div className="done-cards">
        <div className="done-work">{url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="Tranh của bé" />}</div>
        {refImage && (
          <div className="done-ref">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refImage} alt="Tranh mẫu" />
          </div>
        )}
      </div>
      {stars !== undefined && <StarsImg n={stars} className="done-stars" />}
      <div className="done-actions">
        <button
          type="button"
          disabled={!blob}
          onClick={() => {
            play("tap");
            if (!blob) return;
            downloadBlob(blob, name);
            flash("Đã lưu ảnh");
          }}
        >
          <Img name="dialog_download_btn" />
          <span>Lưu</span>
        </button>
        <button
          type="button"
          onClick={() => {
            play("tap");
            setDecorate(true);
          }}
        >
          <Img name="dialog_frame_btn" />
          <span>Đóng khung</span>
        </button>
        <button
          type="button"
          disabled={!blob}
          onClick={async () => {
            play("tap");
            if (!blob) return;
            const r = await shareBlob(blob, name, "Tranh của bé");
            if (r === "downloaded") flash("Máy không hỗ trợ chia sẻ, đã lưu ảnh");
          }}
        >
          <Img name="dialog_share_btn" />
          <span>Chia sẻ</span>
        </button>
      </div>
      <Toast text={toast} />
    </div>
  );
}
