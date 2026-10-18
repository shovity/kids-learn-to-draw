import { createStore, del, entries, get, set } from "idb-keyval";

// Tác phẩm của bé lưu ngay trên thiết bị (IndexedDB). Ảnh lưu dạng ArrayBuffer vì một số
// bản WebKit không lưu được Blob vào IndexedDB.
const store = typeof indexedDB !== "undefined" ? createStore("kids-learn-to-draw", "works") : undefined;

type Bin = { type: string; data: ArrayBuffer };

export type WorkKind = "learn" | "board" | "photo";
export type Phase = "trace" | "color" | "done";

export type WorkMeta = {
  id: string; // learn: id tranh mẫu; board/photo: "board_<time>" / "photo_<time>"
  kind: WorkKind;
  drawingId?: string;
  phase: Phase;
  step: number;
  progress: number; // 0–100
  bg: string;
  stars: number;
  updatedAt: number;
  /** kích thước tờ giấy (bảng vẽ) theo đơn vị thế giới */
  w?: number;
  h?: number;
};

type Record = WorkMeta & { ink?: Bin; paint?: Bin; thumb?: Bin };

export type WorkImages = { ink?: Blob; paint?: Blob; thumb?: Blob };

const toBin = async (b?: Blob): Promise<Bin | undefined> => (b ? { type: b.type, data: await b.arrayBuffer() } : undefined);
const toBlob = (b?: Bin) => (b ? new Blob([b.data], { type: b.type }) : undefined);

export async function saveWork(meta: WorkMeta, images: WorkImages): Promise<void> {
  const rec: Record = { ...meta, ink: await toBin(images.ink), paint: await toBin(images.paint), thumb: await toBin(images.thumb) };
  await set(meta.id, rec, store);
  notify();
}

export async function loadWork(id: string): Promise<(WorkMeta & WorkImages) | undefined> {
  const r = await get<Record>(id, store);
  if (!r) return undefined;
  return { ...stripBins(r), ink: toBlob(r.ink), paint: toBlob(r.paint), thumb: toBlob(r.thumb) };
}

function stripBins(r: Record): WorkMeta {
  const { ink: _i, paint: _p, thumb: _t, ...meta } = r;
  return meta;
}

export type WorkSummary = WorkMeta & { thumb?: Blob };

export async function listWorks(): Promise<WorkSummary[]> {
  const all = await entries<string, Record>(store);
  return all.map(([, r]) => ({ ...stripBins(r), thumb: toBlob(r.thumb) })).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function removeWork(id: string): Promise<void> {
  await del(id, store);
  notify();
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}
export function onWorksChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
