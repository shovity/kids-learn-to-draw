// Chấm điểm khi bé vẽ theo nét mẫu — dựng lại từ DrawingBoardView của app gốc:
// mỗi nét mẫu được lấy mẫu thành các chấm xanh (setProgress → B0). Ngón tay đi qua chấm nào
// trong bán kính bằng độ dày nét bút thì chấm đó "đã chạm" (D++). Điểm = D / E (E = tổng số chấm),
// quy ra 0–5 sao như getScore().

export type Pt = { x: number; y: number };
export type GuidePoint = Pt & { hit: boolean };

export function makeGuide(points: Pt[]): GuidePoint[] {
  return points.map((p) => ({ x: p.x, y: p.y, hit: false }));
}

/** Chọn các chấm hướng dẫn: cứ `every` điểm lấy một, luôn giữ điểm cuối (như setProgress lấy mỗi 11 điểm). */
export function guideDots(points: Pt[], every: number): Pt[] {
  if (points.length === 0) return [];
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i += every) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Đánh dấu các điểm mẫu nằm trong bán kính `radius` quanh đoạn a→b.
 * Trả về các điểm vừa được chạm lần đầu.
 */
export function markSegment(guide: GuidePoint[], a: Pt, b: Pt, radius: number): GuidePoint[] {
  const r2 = radius * radius;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const fresh: GuidePoint[] = [];
  for (const g of guide) {
    if (g.hit) continue;
    let t = len2 === 0 ? 0 : ((g.x - a.x) * dx + (g.y - a.y) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + t * dx - g.x;
    const py = a.y + t * dy - g.y;
    if (px * px + py * py <= r2) {
      g.hit = true;
      fresh.push(g);
    }
  }
  return fresh;
}

export function hitRatio(guide: GuidePoint[]): number {
  if (guide.length === 0) return 1;
  let n = 0;
  for (const g of guide) if (g.hit) n++;
  return n / guide.length;
}

/** Số sao 0–5 theo tỉ lệ chấm đã chạm (getScore của app gốc). */
export function scoreStars(hit: number, total: number): number {
  if (total <= 0) return 0;
  const r = hit / total;
  return r >= 1 ? 5 : r >= 0.8 ? 4 : r >= 0.6 ? 3 : r >= 0.4 ? 2 : r >= 0.2 ? 1 : 0;
}

/**
 * Tiến độ "N%" theo số nét đã hiện / tổng số nét (DrawingBoardView.W). Chưa tới nét cuối thì
 * không bao giờ hiện 100% (app gốc đổi thành "99%").
 */
export function progressPercent(shown: number, total: number): number {
  if (total <= 0) return 100;
  const p = Math.max(0, Math.min(100, Math.round((shown / total) * 100)));
  return p === 100 && shown < total ? 99 : p;
}
