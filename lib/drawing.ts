// Dữ liệu một bức tranh mẫu (chuyển từ SVG gốc: nhóm "block" = mảng màu, nhóm "line" = các nét theo thứ tự vẽ).
import { asset } from "./manifest";
import type { Pt } from "./trace";

export const WORLD = 500; // viewBox 0 0 500 500 của mọi SVG gốc

export type Block = { d: string; fill: string };
export type Line = { d: string; w: number };
export type DrawingData = { outside: string; blocks: Block[]; lines: Line[] };

/**
 * Các vùng kín để thùng sơn tô (vùng màu của SVG gốc), vùng trên cùng trước.
 * Vùng "outside" là phần nền quanh hình.
 */
export function fillRegions(d: DrawingData): Path2D[] {
  const list = d.blocks.map((b) => new Path2D(b.d)).reverse();
  if (d.outside) list.push(new Path2D(d.outside));
  return list;
}

const cache = new Map<string, Promise<DrawingData>>();

export function loadDrawing(id: string): Promise<DrawingData> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(asset(`drawings/${id}.json`)).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<DrawingData>;
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

let measureSvg: SVGSVGElement | null = null;
function measurePath(d: string): SVGPathElement {
  if (!measureSvg) {
    measureSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    measureSvg.setAttribute("width", "0");
    measureSvg.setAttribute("height", "0");
    measureSvg.style.position = "absolute";
    measureSvg.style.visibility = "hidden";
    document.body.appendChild(measureSvg);
  }
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  measureSvg.appendChild(p);
  return p;
}

/** Lấy mẫu một nét thành các điểm cách đều `spacing` đơn vị (như PathMeasure trong app gốc). */
export function samplePath(d: string, spacing = 5): { points: Pt[]; length: number } {
  const el = measurePath(d);
  try {
    const length = el.getTotalLength();
    const n = Math.max(1, Math.ceil(length / spacing));
    const points: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const p = el.getPointAtLength((length * i) / n);
      points.push({ x: p.x, y: p.y });
    }
    return { points, length };
  } finally {
    el.remove();
  }
}
