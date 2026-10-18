"use client";

import { useEffect, useState } from "react";
import { canvasToBlob, downloadBlob, fileStamp, shareBlob } from "@/lib/export";
import { play } from "@/lib/sound";
import DecorateSheet from "./DecorateSheet";
import Icon from "./Icon";
import { Modal, Stars } from "./ui";

/** Hộp thoại khi vẽ xong (dialog_draw_done của app gốc): tải về, chia sẻ, đóng khung. */
export default function DoneDialog({
  title,
  stars,
  makeImage,
  onClose,
  onKeepColoring,
  onRestart,
  onHome,
}: {
  title: string;
  stars: number;
  makeImage: () => HTMLCanvasElement;
  onClose: () => void;
  onKeepColoring?: () => void;
  onRestart?: () => void;
  onHome?: () => void;
}) {
  // chụp tranh một lần khi mở hộp thoại
  const [canvas] = useState(makeImage);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [decorate, setDecorate] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  const name = `tranh-cua-be-${fileStamp()}.png`;

  return (
    <>
      <Modal open={!decorate} onClose={onClose} className="done-modal">
        <div className="done-burst" aria-hidden>
          🎉
        </div>
        <h3 className="modal-title">Tuyệt vời!</h3>
        {stars > 0 && <Stars n={stars} size={30} />}
        <div className="done-preview">{url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={title} />}</div>
        <div className="done-actions">
          <button
            type="button"
            className="round-action"
            disabled={!blob}
            onClick={() => {
              play("tap");
              if (blob) downloadBlob(blob, name);
              setMsg("Đã lưu ảnh vào máy");
            }}
          >
            <Icon name="download" />
            <span>Tải về</span>
          </button>
          <button
            type="button"
            className="round-action"
            disabled={!blob}
            onClick={async () => {
              play("tap");
              if (!blob) return;
              const r = await shareBlob(blob, name, title);
              if (r === "downloaded") setMsg("Máy không hỗ trợ chia sẻ, đã tải ảnh về");
            }}
          >
            <Icon name="share" />
            <span>Chia sẻ</span>
          </button>
          <button
            type="button"
            className="round-action"
            onClick={() => {
              play("tap");
              setDecorate(true);
            }}
          >
            <Icon name="frame" />
            <span>Đóng khung</span>
          </button>
        </div>
        {msg && <p className="modal-text small">{msg}</p>}
        <div className="modal-actions wrap">
          {onKeepColoring && (
            <button type="button" className="pill-btn ghost" onClick={onKeepColoring}>
              <Icon name="brush" size={18} /> Tô tiếp
            </button>
          )}
          {onRestart && (
            <button type="button" className="pill-btn ghost" onClick={onRestart}>
              <Icon name="refresh" size={18} /> Vẽ lại
            </button>
          )}
          {onHome && (
            <button type="button" className="pill-btn" onClick={onHome}>
              <Icon name="home" size={18} /> Trang chủ
            </button>
          )}
        </div>
      </Modal>
      {decorate && <DecorateSheet art={canvas} title={title} onClose={() => setDecorate(false)} />}
    </>
  );
}
