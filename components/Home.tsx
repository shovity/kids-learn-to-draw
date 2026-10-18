"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { blobToImage, fileStamp, shareBlob } from "@/lib/export";
import { CATEGORIES, DRAWINGS, thumbUrl } from "@/lib/manifest";
import { setPref, usePrefs } from "@/lib/prefs";
import { play } from "@/lib/sound";
import { listWorks, loadWork, onWorksChange, removeWork, type WorkSummary } from "@/lib/storage";
import Icon from "./Icon";
import { CircleProgress, Confirm, Img, Modal, StarsImg, Toast, useToast } from "./ui";

type Tab = "learn" | "board" | "mine";
// Thanh tab dưới của MainActivity: ảnh động main_tab_enlarge_0/1/3.
const TABS: { id: Tab; title: string; gif: number }[] = [
  { id: "learn", title: "Học vẽ", gif: 0 },
  { id: "board", title: "Bảng vẽ", gif: 1 },
  { id: "mine", title: "Của bé", gif: 3 },
];

function useWorks() {
  const [works, setWorks] = useState<WorkSummary[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void listWorks()
        // bỏ qua dữ liệu kiểu cũ (ảnh chụp tranh giấy)
        .then((w) => alive && setWorks(w.filter((x) => x.kind === "learn" || x.kind === "board")))
        .catch(() => alive && setWorks([]));
    load();
    const off = onWorksChange(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return works;
}

/** URL tạm cho ảnh thu nhỏ lưu trong IndexedDB. */
function useBlobUrls(works: WorkSummary[] | null) {
  const urls = useMemo(() => new Map((works ?? []).filter((w) => w.thumb).map((w) => [w.id, URL.createObjectURL(w.thumb!)])), [works]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

const readTab = (): Tab => {
  if (typeof window === "undefined") return "learn";
  const h = window.location.hash.slice(1);
  return h === "board" || h === "mine" ? h : "learn";
};

/** Ghép ảnh đầy đủ của một tác phẩm đã lưu (để chia sẻ). */
async function workImage(id: string): Promise<Blob | null> {
  const w = await loadWork(id);
  if (!w) return null;
  const W = w.w ?? 500, H = w.h ?? 500;
  const k = 1000 / Math.max(W, H);
  const c = document.createElement("canvas");
  c.width = Math.round(W * k);
  c.height = Math.round(H * k);
  const g = c.getContext("2d")!;
  g.fillStyle = w.bg;
  g.fillRect(0, 0, c.width, c.height);
  const draw = async (b?: Blob, cover = false) => {
    if (!b) return;
    const img = await blobToImage(b);
    if (!cover) return g.drawImage(img, 0, 0, c.width, c.height);
    const s = Math.max(c.width / img.width, c.height / img.height);
    g.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s);
  };
  if (w.kind === "board") {
    await draw(w.ink, true); // ảnh nền
    await draw(w.paint);
  } else {
    await draw(w.paint);
    await draw(w.ink);
  }
  return new Promise((r) => c.toBlob((b) => r(b), "image/png"));
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("learn");
  const [settings, setSettings] = useState(false);
  const works = useWorks();
  const thumbs = useBlobUrls(works);

  useEffect(() => {
    setTab(readTab());
    const onHash = () => setTab(readTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (t: Tab) => {
    if (t === tab) return;
    play("tap");
    setTab(t);
    history.replaceState(null, "", t === "learn" ? window.location.pathname : `#${t}`);
  };

  return (
    <div className="screen home">
      <main className="home-body">
        {tab === "learn" && <LearnTab works={works} thumbs={thumbs} />}
        {tab === "board" && <BoardTab works={works} thumbs={thumbs} />}
        {tab === "mine" && <MineTab works={works} thumbs={thumbs} onSettings={() => setSettings(true)} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab ${tab === t.id ? "is-active" : ""}`} aria-current={tab === t.id} onClick={() => go(t.id)}>
            {tab === t.id ? <Img key={`on-${t.id}`} name={`main_tab_enlarge_${t.gif}.gif`} /> : <Img name={`main_tab_off_${t.gif}`} />}
            <span>{t.title}</span>
          </button>
        ))}
      </nav>

      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}

// ---------------- Học vẽ ----------------

const CAT_KEY = "ktd-cat";

function LearnTab({ works, thumbs }: { works: WorkSummary[] | null; thumbs: Map<string, string> }) {
  const router = useRouter();
  const [cat, setCat] = useState(CATEGORIES[0].id);
  const [picked, setPicked] = useState<WorkSummary | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const c = sessionStorage.getItem(CAT_KEY);
      if (c && CATEGORIES.some((x) => x.id === c)) setCat(c);
    } catch {
      /* bỏ qua */
    }
  }, []);

  useEffect(() => {
    tabsRef.current?.querySelector(".is-active")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [cat]);

  const byId = useMemo(() => new Map((works ?? []).filter((w) => w.kind === "learn").map((w) => [w.id, w])), [works]);
  const list = DRAWINGS.filter((d) => d.category === cat);

  return (
    <>
      <div className="banner">
        <Img name="ic_home_banner.webp" alt="Bé học vẽ" />
      </div>
      <div className="cat-tabs" role="tablist" ref={tabsRef}>
        {CATEGORIES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === cat}
            className={`cat-tab ${x.id === cat ? "is-active" : ""}`}
            onClick={() => {
              play("tap");
              setCat(x.id);
              try {
                sessionStorage.setItem(CAT_KEY, x.id);
              } catch {
                /* bỏ qua */
              }
            }}
          >
            {x.title}
          </button>
        ))}
      </div>
      <div className="grid">
        {list.map((d) => {
          const w = byId.get(d.id);
          return (
            <WorkCard
              key={d.id}
              image={(w && thumbs.get(w.id)) || thumbUrl(d.id)}
              work={w}
              cover={!w}
              onOpen={() => {
                play("tap");
                if (w) setPicked(w);
                else router.push(`/draw/${d.id}/`);
              }}
            />
          );
        })}
      </div>
      {picked && <ContinueDialog work={picked} image={thumbs.get(picked.id) ?? thumbUrl(picked.id)} onClose={() => setPicked(null)} />}
    </>
  );
}

/** Thẻ tranh (fragment_recy_home_item): vòng tiến độ / dấu xong ở góc phải, sao ở góc trái dưới. */
function WorkCard({ image, work, onOpen, onLongPress, cover }: { image?: string; work?: WorkSummary; onOpen: () => void; onLongPress?: () => void; cover?: boolean }) {
  const press = useLongPress(onLongPress);
  const learn = work?.kind === "learn";
  return (
    <button type="button" className={`card ${cover ? "is-cover" : ""}`} onClick={() => !press.fired() && onOpen()} {...press.handlers}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image ? <img src={image} alt="" loading="lazy" draggable={false} /> : <span className="card-blank" />}
      {learn && (work.phase === "done" ? <Img name="ic_painted_finish" className="card-finish" /> : <CircleProgress pct={work.progress} />)}
      {learn && (work.dots ?? 0) > 0 && <StarsImg n={work.stars} className="card-stars" />}
    </button>
  );
}

function useLongPress(cb?: () => void) {
  const timer = useRef(0);
  const firedRef = useRef(false);
  const handlers = cb
    ? {
        onPointerDown: () => {
          firedRef.current = false;
          timer.current = window.setTimeout(() => {
            firedRef.current = true;
            play("pop");
            cb();
          }, 550);
        },
        onPointerUp: () => window.clearTimeout(timer.current),
        onPointerLeave: () => window.clearTimeout(timer.current),
        onPointerCancel: () => window.clearTimeout(timer.current),
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : {};
  return { handlers, fired: () => firedRef.current };
}

/** dialog_continue_or_restart: ảnh tranh đang vẽ, nút "Vẽ tiếp" và "Vẽ lại". */
function ContinueDialog({ work, image, onClose }: { work: WorkSummary; image: string; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const href = work.kind === "board" ? `/board/?id=${work.id}` : `/draw/${work.id}/`;
  return (
    <Modal open onClose={onClose} className="continue-dialog">
      <button type="button" className="dialog-x" aria-label="Đóng" onClick={onClose}>
        <Img name="home_close_img" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="continue-img" src={image} alt="" />
      <button
        type="button"
        className="blue-pill continue-btn"
        onClick={() => {
          play("tap");
          router.push(href);
        }}
      >
        Vẽ tiếp
      </button>
      <button
        type="button"
        className="restart-btn"
        disabled={busy}
        onClick={async () => {
          play("tap");
          setBusy(true);
          await removeWork(work.id);
          router.push(work.kind === "board" ? "/board/" : href);
        }}
      >
        <Img name="home_restart_img" />
        <span>Vẽ lại</span>
      </button>
    </Modal>
  );
}

/** dialog_delete_share: ảnh tác phẩm và ba nút vẽ lại / xoá / chia sẻ. */
function WorkDialog({ work, image, onClose }: { work: WorkSummary; image?: string; onClose: () => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [toast, flash] = useToast();
  return (
    <>
      <Modal open={!confirm} onClose={onClose} className="work-dialog">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img className="continue-img" src={image} alt="" />}
        <div className="work-actions">
          <button
            type="button"
            aria-label="Vẽ lại"
            onClick={async () => {
              play("tap");
              await removeWork(work.id);
              router.push(work.kind === "board" ? "/board/" : `/draw/${work.id}/`);
            }}
          >
            <Img name="ic_dialog_redraw" />
          </button>
          <button type="button" aria-label="Xoá" onClick={() => setConfirm(true)}>
            <Img name="ic_dialog_delete" />
          </button>
          <button
            type="button"
            aria-label="Chia sẻ"
            onClick={async () => {
              play("tap");
              const b = await workImage(work.id);
              if (!b) return;
              const r = await shareBlob(b, `tranh-cua-be-${fileStamp()}.png`, "Tranh của bé");
              if (r === "downloaded") flash("Máy không hỗ trợ chia sẻ, đã lưu ảnh");
            }}
          >
            <Img name="ic_dialog_share" />
          </button>
        </div>
      </Modal>
      <Confirm
        open={confirm}
        text="Xoá bức tranh này?"
        ok="Xoá"
        onCancel={() => setConfirm(false)}
        onOk={() => {
          play("erase");
          void removeWork(work.id);
          onClose();
        }}
      />
      <Toast text={toast} />
    </>
  );
}

// ---------------- Bảng vẽ ----------------

function BoardTab({ works, thumbs }: { works: WorkSummary[] | null; thumbs: Map<string, string> }) {
  const router = useRouter();
  const [picked, setPicked] = useState<WorkSummary | null>(null);
  const boards = (works ?? []).filter((w) => w.kind === "board");
  return (
    <div className="board-list">
      <div className="grid">
        <button
          type="button"
          className="card card-new"
          aria-label="Bảng vẽ mới"
          onClick={() => {
            play("tap");
            router.push("/board/");
          }}
        >
          <Img name="ic_whiteboard_empty" />
        </button>
        {boards.map((w) => (
          <WorkCard
            key={w.id}
            image={thumbs.get(w.id)}
            work={w}
            cover
            onOpen={() => {
              play("tap");
              router.push(`/board/?id=${w.id}`);
            }}
            onLongPress={() => setPicked(w)}
          />
        ))}
      </div>
      {picked && <WorkDialog work={picked} image={thumbs.get(picked.id)} onClose={() => setPicked(null)} />}
    </div>
  );
}

// ---------------- Của bé ----------------

function MineTab({ works, thumbs, onSettings }: { works: WorkSummary[] | null; thumbs: Map<string, string>; onSettings: () => void }) {
  const [seg, setSeg] = useState<"doing" | "done">("doing");
  const [cont, setCont] = useState<WorkSummary | null>(null);
  const [picked, setPicked] = useState<WorkSummary | null>(null);
  const [toast, flash] = useToast();
  const learn = (works ?? []).filter((w) => w.kind === "learn");
  const list = learn.filter((w) => (seg === "doing" ? w.phase !== "done" : w.phase === "done"));
  return (
    <div className="mine">
      <div className="mine-head">
        <div className="mine-tabs" role="tablist">
          {(["doing", "done"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={seg === k}
              className={seg === k ? "is-active" : ""}
              onClick={() => {
                play("tap");
                setSeg(k);
              }}
            >
              {k === "doing" ? "Đang vẽ" : "Đã xong"}
            </button>
          ))}
        </div>
        <button type="button" className="mine-settings" aria-label="Cài đặt" onClick={onSettings}>
          <Icon name="settings" size={24} stroke={2} />
        </button>
      </div>
      {works && list.length === 0 ? (
        <div className="empty">
          <Img name="ic_user_work_empty" />
          <p>{seg === "doing" ? "Tranh bé đang vẽ sẽ hiện ở đây" : "Tranh bé vẽ xong sẽ hiện ở đây"}</p>
        </div>
      ) : (
        <div className="grid">
          {list.map((w) => (
            <WorkCard
              key={w.id}
              image={thumbs.get(w.id)}
              work={w}
              onOpen={() => {
                play("tap");
                if (w.phase === "done") setPicked(w);
                else {
                  setCont(w);
                  flash("Nhấn giữ để xoá tranh");
                }
              }}
              onLongPress={() => setPicked(w)}
            />
          ))}
        </div>
      )}
      {cont && <ContinueDialog work={cont} image={thumbs.get(cont.id) ?? thumbUrl(cont.id)} onClose={() => setCont(null)} />}
      {picked && <WorkDialog work={picked} image={thumbs.get(picked.id)} onClose={() => setPicked(null)} />}
      <Toast text={toast} />
    </div>
  );
}

// ---------------- Cài đặt (activity_new_setting) ----------------

function Settings({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs();
  const [confirm, setConfirm] = useState(false);
  const [toast, flash] = useToast();
  const clearAll = async () => {
    const all = await listWorks();
    await Promise.all(all.map((w) => removeWork(w.id)));
    setConfirm(false);
    flash("Đã xoá tất cả tranh");
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="settings" role="dialog" aria-label="Cài đặt">
      <div className="settings-top">
        <span className="settings-title">Cài đặt</span>
        <button type="button" className="settings-back" aria-label="Đóng" onClick={onClose}>
          <Img name="setting_btn_back" />
        </button>
      </div>
      <label className="setting-row">
        <Img name="setting_ic_sound" />
        <span>Âm thanh</span>
        <input type="checkbox" className="switch" checked={prefs.sound} onChange={(e) => setPref("sound", e.target.checked)} />
      </label>
      <label className="setting-row">
        <Img name="setting_ic_vibration" />
        <span>Rung</span>
        <input type="checkbox" className="switch" checked={prefs.vibration} onChange={(e) => setPref("vibration", e.target.checked)} />
      </label>
      <div className="setting-row">
        <Img name="setting_ic_version" />
        <span>Phiên bản 3.7 (web)</span>
      </div>
      <div className="setting-row">
        <Img name="setting_ic_privacy" />
        <span>Tranh chỉ lưu trên máy này, không gửi đi đâu</span>
      </div>
      <button type="button" className="setting-row" onClick={() => setConfirm(true)}>
        <Img name="setting_ic_delete" />
        <span>Xoá tất cả tranh của bé</span>
      </button>
      <Confirm open={confirm} text="Xoá tất cả tranh? Không thể khôi phục lại." ok="Xoá hết" onCancel={() => setConfirm(false)} onOk={() => void clearAll()} />
      <Toast text={toast} />
    </div>
  );
}
