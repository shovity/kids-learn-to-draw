"use client";

import { useState } from "react";
import { play } from "@/lib/sound";
import { Img, Modal } from "./ui";

// dialog_first_in của app gốc: hai trang ảnh động hướng dẫn thao tác hai ngón tay.
const PAGES = [
  { gif: "paint_first_pic_01.gif", title: "Kéo tranh bằng hai ngón tay" },
  { gif: "paint_first_pic_02.gif", title: "Chụm hai ngón tay để phóng to, thu nhỏ" },
];

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === PAGES.length - 1;
  return (
    <Modal open onClose={onClose} className="first-in">
      <h3>{PAGES[i].title}</h3>
      <Img name={PAGES[i].gif} className="first-in-img" />
      <button
        type="button"
        className="first-in-btn"
        aria-label={last ? "Đã hiểu" : "Tiếp"}
        onClick={() => {
          play("tap");
          if (last) onClose();
          else setI(i + 1);
        }}
      >
        <span>{last ? "Đã hiểu!" : "TIẾP"}</span>
      </button>
    </Modal>
  );
}
