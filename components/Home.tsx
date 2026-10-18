"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadBlob, fileStamp, shareBlob } from "@/lib/export";
import { CATEGORIES, DRAWINGS, categoryOf, drawingTitle, thumbUrl, type DrawingInfo } from "@/lib/manifest";
import { setPref, usePrefs } from "@/lib/prefs";
import { play } from "@/lib/sound";
import { listWorks, loadWork, onWorksChange, removeWork, type WorkSummary } from "@/lib/storage";
import Icon from "./Icon";
import { Modal, Sheet, Stars } from "./ui";

type Tab = "learn" | "board" | "mine";
const TABS: { id: Tab; title: string; icon: "pencil" | "palette" | "image" }[] = [
  { id: "learn", title: "Học vẽ", icon: "pencil" },
  { id: "board", title: "Bảng vẽ", icon: "palette" },
  { id: "mine", title: "Tranh của bé", icon: "image" },
];

function useWorks() {
  const [works, setWorks] = useState<WorkSummary[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void listWorks()
        .then((w) => alive && setWorks(w))
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
    play("tap");
    setTab(t);
    history.replaceState(null, "", t === "learn" ? window.location.pathname : `#${t}`);
  };

  return (
    <div className="screen home">
      <header className="home-top">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon-192.png`} alt="" className="brand-icon" />
          <div>
            <h1>Bé Học Vẽ</h1>
            <p>{tab === "learn" ? "Chọn một bức tranh để vẽ nhé!" : tab === "board" ? "Vẽ bất cứ thứ gì bé thích" : "Những bức tranh bé đã vẽ"}</p>
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label="Cài đặt" onClick={() => setSettings(true)}>
          <Icon name="settings" />
        </button>
      </header>

      <main className="home-body">
        {tab === "learn" && <LearnTab works={works} />}
        {tab === "board" && <BoardTab works={works} thumbs={thumbs} />}
        {tab === "mine" && <MineTab works={works} thumbs={thumbs} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab ${tab === t.id ? "is-active" : ""}`} onClick={() => go(t.id)}>
            <Icon name={t.icon} size={24} />
            <span>{t.title}</span>
          </button>
        ))}
      </nav>

      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

// ---------------- Học vẽ ----------------

const CAT_KEY = "ktd-cat";

function LearnTab({ works }: { works: WorkSummary[] | null }) {
  const [cat, setCat] = useState(CATEGORIES[0].id);
  const [picked, setPicked] = useState<DrawingInfo | null>(null);

  useEffect(() => {
    try {
      const c = sessionStorage.getItem(CAT_KEY);
      if (c && CATEGORIES.some((x) => x.id === c)) setCat(c);
    } catch {
      /* bỏ qua */
    }
  }, []);

  const byId = useMemo(() => new Map((works ?? []).filter((w) => w.kind === "learn").map((w) => [w.id, w])), [works]);
  const list = DRAWINGS.filter((d) => d.category === cat);
  const c = CATEGORIES.find((x) => x.id === cat)!;

  return (
    <>
      <div className="chips" role="tablist">
        {CATEGORIES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === cat}
            className={`chip ${x.id === cat ? "is-active" : ""}`}
            style={{ ["--cat" as string]: x.color }}
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
            <span className="chip-emoji">{x.emoji}</span>
            {x.title}
          </button>
        ))}
      </div>
      <div className="grid" style={{ ["--cat" as string]: c.color }}>
        {list.map((d, i) => {
          const w = byId.get(d.id);
          return (
            <button
              key={d.id}
              type="button"
              className="card"
              style={{ animationDelay: `${i * 35}ms` }}
              onClick={() => {
                play("tap");
                setPicked(d);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(d.id)} alt={drawingTitle(d.id)} loading="lazy" />
              <span className="card-steps">{d.steps} nét</span>
              {w && w.phase === "done" && (
                <span className="card-done">
                  <Stars n={w.stars} size={14} />
                </span>
              )}
              {w && w.phase !== "done" && (
                <span className="card-progress">
                  <span style={{ width: `${w.progress}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <ModeSheet drawing={picked} work={picked ? byId.get(picked.id) : undefined} onClose={() => setPicked(null)} />
    </>
  );
}

/** Chọn cách vẽ (dialog_preference của app gốc: vẽ trên màn hình / vẽ ra giấy / vẽ tiếp). */
function ModeSheet({ drawing, work, onClose }: { drawing: DrawingInfo | null; work?: WorkSummary; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!drawing) return null;
  const id = drawing.id;
  const open = (path: string) => {
    play("tap");
    router.push(path);
  };
  return (
    <Sheet open onClose={onClose} title={drawingTitle(id)}>
      <div className="mode">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mode-thumb" src={thumbUrl(id)} alt="" />
        <div className="mode-actions">
          {work && work.phase !== "done" ? (
            <>
              <button type="button" className="mode-btn primary" onClick={() => open(`/draw/${id}/`)}>
                <Icon name="play" size={22} fill="currentColor" /> Vẽ tiếp <small>{work.phase === "color" ? "đang tô màu" : `${work.progress}%`}</small>
              </button>
              <button
                type="button"
                className="mode-btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await removeWork(id);
                  open(`/draw/${id}/`);
                }}
              >
                <Icon name="refresh" size={22} /> Vẽ lại từ đầu
              </button>
            </>
          ) : work?.phase === "done" ? (
            <>
              <button type="button" className="mode-btn primary" onClick={() => open(`/draw/${id}/`)}>
                <Icon name="brush" size={22} /> Xem / tô tiếp
              </button>
              <button
                type="button"
                className="mode-btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await removeWork(id);
                  open(`/draw/${id}/`);
                }}
              >
                <Icon name="refresh" size={22} /> Vẽ lại từ đầu
              </button>
            </>
          ) : (
            <button type="button" className="mode-btn primary" onClick={() => open(`/draw/${id}/`)}>
              <Icon name="pencil" size={22} /> Vẽ trên màn hình
            </button>
          )}
          <button type="button" className="mode-btn" onClick={() => open(`/paper/${id}/`)}>
            <Icon name="paper" size={22} /> Vẽ ra giấy
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------- Bảng vẽ ----------------

function BoardTab({ works, thumbs }: { works: WorkSummary[] | null; thumbs: Map<string, string> }) {
  const boards = (works ?? []).filter((w) => w.kind === "board");
  return (
    <div className="grid">
      <Link className="card card-new" href="/board/" onClick={() => play("tap")}>
        <Icon name="plus" size={44} />
        <span>Tranh mới</span>
      </Link>
      {boards.map((w) => (
        <WorkCard key={w.id} work={w} url={thumbs.get(w.id)} href={`/board/?id=${w.id}`} />
      ))}
      {works && boards.length === 0 && <p className="empty-note">Bảng vẽ trống trơn. Bé hãy vẽ một bức tranh thật đẹp nhé!</p>}
    </div>
  );
}

// ---------------- Tranh của bé ----------------

function MineTab({ works, thumbs }: { works: WorkSummary[] | null; thumbs: Map<string, string> }) {
  const [seg, setSeg] = useState<"doing" | "done">("doing");
  const [viewing, setViewing] = useState<WorkSummary | null>(null);
  const doing = (works ?? []).filter((w) => w.kind === "learn" && w.phase !== "done");
  const done = (works ?? []).filter((w) => (w.kind === "learn" && w.phase === "done") || w.kind === "photo");
  const list = seg === "doing" ? doing : done;
  return (
    <>
      <div className="segmented">
        <button type="button" className={seg === "doing" ? "is-active" : ""} onClick={() => setSeg("doing")}>
          Đang vẽ <b>{doing.length}</b>
        </button>
        <button type="button" className={seg === "done" ? "is-active" : ""} onClick={() => setSeg("done")}>
          Đã xong <b>{done.length}</b>
        </button>
      </div>
      <div className="grid">
        {list.map((w) =>
          w.kind === "photo" ? (
            <WorkCard key={w.id} work={w} url={thumbs.get(w.id)} onOpen={() => setViewing(w)} />
          ) : (
            <WorkCard key={w.id} work={w} url={thumbs.get(w.id)} href={`/draw/${w.id}/`} />
          ),
        )}
        {works && list.length === 0 && (
          <p className="empty-note">{seg === "doing" ? "Tranh bé đang vẽ sẽ hiện ở đây." : "Tranh bé vẽ xong sẽ hiện ở đây."}</p>
        )}
      </div>
      {viewing && <PhotoViewer work={viewing} url={thumbs.get(viewing.id)} onClose={() => setViewing(null)} />}
    </>
  );
}

function WorkCard({ work, url, href, onOpen }: { work: WorkSummary; url?: string; href?: string; onOpen?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const label = work.kind === "board" ? "Bảng vẽ" : work.kind === "photo" ? `Ảnh ${work.drawingId ? drawingTitle(work.drawingId) : ""}` : drawingTitle(work.id);
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={label} /> : <span className="card-blank" />}
      {work.kind === "learn" && work.phase !== "done" && (
        <span className="card-progress">
          <span style={{ width: `${work.progress}%` }} />
        </span>
      )}
      {work.kind === "learn" && work.phase === "done" && (
        <span className="card-done">
          <Stars n={work.stars} size={14} />
        </span>
      )}
      {work.kind === "photo" && <span className="card-badge">📸</span>}
    </>
  );
  return (
    <div className="card-wrap">
      {href ? (
        <Link className="card" href={href} onClick={() => play("tap")} style={work.kind === "learn" ? { ["--cat" as string]: categoryOf(work.id).color } : undefined}>
          {body}
        </Link>
      ) : (
        <button type="button" className="card" onClick={onOpen}>
          {body}
        </button>
      )}
      <button type="button" className="card-del" aria-label="Xoá tranh" onClick={() => setConfirm(true)}>
        <Icon name="trash" size={16} />
      </button>
      <Modal open={confirm} onClose={() => setConfirm(false)}>
        <h3 className="modal-title">Xoá tranh này?</h3>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img className="confirm-thumb" src={url} alt="" />}
        <div className="modal-actions">
          <button type="button" className="pill-btn ghost" onClick={() => setConfirm(false)}>
            Thôi
          </button>
          <button
            type="button"
            className="pill-btn danger"
            onClick={() => {
              play("erase");
              void removeWork(work.id);
              setConfirm(false);
            }}
          >
            Xoá
          </button>
        </div>
      </Modal>
    </div>
  );
}

function PhotoViewer({ work, url, onClose }: { work: WorkSummary; url?: string; onClose: () => void }) {
  const [full, setFull] = useState<{ url: string; blob: Blob } | null>(null);
  useEffect(() => {
    let u: string | null = null;
    void loadWork(work.id).then((w) => {
      if (w?.paint) {
        u = URL.createObjectURL(w.paint);
        setFull({ url: u, blob: w.paint });
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [work.id]);
  const name = `anh-tranh-${fileStamp()}.jpg`;
  return (
    <Modal open onClose={onClose} className="ref-modal">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={full?.url ?? url} alt="Ảnh tranh của bé" />
      <div className="modal-actions wrap">
        <button type="button" className="pill-btn ghost" disabled={!full} onClick={() => full && downloadBlob(full.blob, name)}>
          <Icon name="download" size={18} /> Tải về
        </button>
        <button type="button" className="pill-btn ghost" disabled={!full} onClick={() => full && void shareBlob(full.blob, name, "Tranh của bé")}>
          <Icon name="share" size={18} /> Chia sẻ
        </button>
        <button type="button" className="pill-btn" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Modal>
  );
}

// ---------------- Cài đặt ----------------

function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  const [confirm, setConfirm] = useState(false);
  const clearAll = useCallback(async () => {
    const all = await listWorks();
    await Promise.all(all.map((w) => removeWork(w.id)));
    setConfirm(false);
  }, []);
  return (
    <Sheet open={open} onClose={onClose} title="Cài đặt">
      <div className="settings">
        <label className="setting-row">
          <Icon name={prefs.sound ? "sound" : "mute"} />
          <span>Âm thanh</span>
          <input type="checkbox" className="switch" checked={prefs.sound} onChange={(e) => setPref("sound", e.target.checked)} />
        </label>
        <label className="setting-row">
          <Icon name="vibrate" />
          <span>Rung</span>
          <input type="checkbox" className="switch" checked={prefs.vibration} onChange={(e) => setPref("vibration", e.target.checked)} />
        </label>
        <label className="setting-row">
          <Icon name="zoom" />
          <span>Kính lúp khi vẽ</span>
          <input type="checkbox" className="switch" checked={prefs.magnifier} onChange={(e) => setPref("magnifier", e.target.checked)} />
        </label>
        <button type="button" className="setting-row danger" onClick={() => setConfirm(true)}>
          <Icon name="trash" />
          <span>Xoá tất cả tranh của bé</span>
        </button>
        <p className="settings-note">Tranh được lưu ngay trên máy này, không cần tài khoản. Phiên bản web 1.0.</p>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)}>
        <h3 className="modal-title">Xoá tất cả tranh?</h3>
        <p className="modal-text">Không thể khôi phục lại.</p>
        <div className="modal-actions">
          <button type="button" className="pill-btn ghost" onClick={() => setConfirm(false)}>
            Thôi
          </button>
          <button type="button" className="pill-btn danger" onClick={() => void clearAll()}>
            Xoá hết
          </button>
        </div>
      </Modal>
    </Sheet>
  );
}

