// Thùng sơn: tô loang một vùng kín (bổ sung so với app gốc, vốn chỉ có cọ).

/**
 * Tìm vùng liền kề quanh (x, y) không bị chặn. `blocked(i)` cho biết pixel i là biên.
 * Trả về mặt nạ 0/1 kích thước w*h, hoặc null nếu điểm bắt đầu nằm trên biên.
 */
export function floodRegion(w: number, h: number, x: number, y: number, blocked: (i: number) => boolean): Uint8Array | null {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const start = y * w + x;
  if (blocked(start)) return null;
  const mask = new Uint8Array(w * h);
  const stack = [start];
  mask[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const px = i % w;
    // quét cả hàng sang trái/phải rồi đẩy các pixel hàng trên/dưới
    let l = px;
    while (l > 0 && !mask[i - (px - l) - 1] && !blocked(i - (px - l) - 1)) l--;
    let r = px;
    while (r < w - 1 && !mask[i + (r - px) + 1] && !blocked(i + (r - px) + 1)) r++;
    const row = i - px;
    for (let cx = l; cx <= r; cx++) {
      const ci = row + cx;
      mask[ci] = 1;
      if (ci >= w) {
        const up = ci - w;
        if (!mask[up] && !blocked(up)) {
          mask[up] = 1;
          stack.push(up);
        }
      }
      if (ci < w * (h - 1)) {
        const dn = ci + w;
        if (!mask[dn] && !blocked(dn)) {
          mask[dn] = 1;
          stack.push(dn);
        }
      }
    }
  }
  return mask;
}

/** Nở mặt nạ thêm `r` pixel để che khe răng cưa sát nét viền. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  let cur = mask;
  for (let k = 0; k < r; k++) {
    const next = cur.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cur[i]) continue;
        if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) || (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w])) next[i] = 1;
      }
    cur = next;
  }
  return cur;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Biên theo độ đục: pixel có alpha > ngưỡng (dùng lớp nét vẽ làm biên). */
export const alphaBarrier = (data: Uint8ClampedArray, threshold = 110) => (i: number) => data[i * 4 + 3] > threshold;

/** Biên theo màu: pixel khác màu hạt giống quá `tol` (dùng cho bảng vẽ tự do). */
export function colorBarrier(data: Uint8ClampedArray, seed: number, tol = 48): (i: number) => boolean {
  const s = seed * 4;
  const r = data[s], g = data[s + 1], b = data[s + 2], a = data[s + 3];
  return (i) => {
    const j = i * 4;
    return Math.abs(data[j] - r) + Math.abs(data[j + 1] - g) + Math.abs(data[j + 2] - b) + Math.abs(data[j + 3] - a) > tol;
  };
}
