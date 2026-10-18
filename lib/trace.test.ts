import { describe, expect, it } from "vitest";
import { guideDots, hitRatio, makeGuide, markSegment, progressPercent, scoreStars } from "./trace";

const line = (n: number) => makeGuide(Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0 })));

describe("trace", () => {
  it("marks points within radius of a segment", () => {
    const g = line(11); // x = 0..100
    expect(markSegment(g, { x: 0, y: 5 }, { x: 50, y: 5 }, 8)).toHaveLength(6);
    expect(hitRatio(g)).toBeCloseTo(6 / 11);
    // lần hai không tính lại điểm đã chạm
    expect(markSegment(g, { x: 0, y: 0 }, { x: 50, y: 0 }, 8)).toHaveLength(0);
  });

  it("ignores points outside the radius", () => {
    const g = line(5);
    expect(markSegment(g, { x: 0, y: 30 }, { x: 40, y: 30 }, 8)).toHaveLength(0);
  });

  it("handles a tap (zero-length segment)", () => {
    const g = line(5);
    expect(markSegment(g, { x: 20, y: 1 }, { x: 20, y: 1 }, 3)).toHaveLength(1);
  });

  it("picks guide dots and keeps the last point", () => {
    const pts = Array.from({ length: 25 }, (_, i) => ({ x: i, y: 0 }));
    const d = guideDots(pts, 11);
    expect(d.map((p) => p.x)).toEqual([0, 11, 22, 24]);
    expect(guideDots([], 11)).toEqual([]);
  });

  it("scores 0–5 stars like getScore", () => {
    expect(scoreStars(10, 10)).toBe(5);
    expect(scoreStars(8, 10)).toBe(4);
    expect(scoreStars(6, 10)).toBe(3);
    expect(scoreStars(4, 10)).toBe(2);
    expect(scoreStars(2, 10)).toBe(1);
    expect(scoreStars(1, 10)).toBe(0);
    expect(scoreStars(0, 0)).toBe(0);
  });

  it("computes progress, never 100% before the last line", () => {
    expect(progressPercent(0, 26)).toBe(0);
    expect(progressPercent(13, 26)).toBe(50);
    expect(progressPercent(26, 26)).toBe(100);
    expect(progressPercent(199, 200)).toBe(99);
    expect(progressPercent(3, 0)).toBe(100);
  });
});
