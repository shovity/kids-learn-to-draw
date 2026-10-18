// Chấm điểm khi bé tô theo nét mẫu — dựng lại từ DrawingBoardView.onTouchEvent của app gốc:
// nét mẫu được lấy mẫu thành các điểm; điểm nào nằm trong bán kính nét bút của ngón tay thì
// được đánh dấu "đã chạm". Bản web hoàn thành một bước khi đủ tỉ lệ điểm đã chạm.

export type Pt = { x: number; y: number };
export type GuidePoint = Pt & { hit: boolean };

/** Tỉ lệ điểm cần chạm để qua bước (rộng tay cho trẻ nhỏ). */
export const PASS_RATIO = 0.75;

export function makeGuide(points: Pt[]): GuidePoint[] {
  return points.map((p) => ({ x: p.x, y: p.y, hit: false }));
}

/**
 * Đánh dấu các điểm mẫu nằm trong bán kính `radius` quanh đoạn a→b.
 * Trả về số điểm vừa được chạm lần đầu.
 */
export function markSegment(guide: GuidePoint[], a: Pt, b: Pt, radius: number): number {
  const r2 = radius * radius;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let fresh = 0;
  for (const g of guide) {
    if (g.hit) continue;
    let t = len2 === 0 ? 0 : ((g.x - a.x) * dx + (g.y - a.y) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + t * dx - g.x;
    const py = a.y + t * dy - g.y;
    if (px * px + py * py <= r2) {
      g.hit = true;
      fresh++;
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

export const isStepDone = (guide: GuidePoint[]) => hitRatio(guide) >= PASS_RATIO;

/** Tiến độ hiển thị (0–100) theo số bước đã vẽ xong, như "paintPercentage" của app gốc. */
export function progressPercent(stepsDone: number, totalSteps: number): number {
  if (totalSteps <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((stepsDone / totalSteps) * 100)));
}
