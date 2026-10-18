import { describe, expect, it } from "vitest";
import { hitRatio, isStepDone, makeGuide, markSegment, progressPercent } from "./trace";

const line = (n: number) => makeGuide(Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0 })));

describe("trace", () => {
  it("marks points within radius of a segment", () => {
    const g = line(11); // x = 0..100
    expect(markSegment(g, { x: 0, y: 5 }, { x: 50, y: 5 }, 8)).toBe(6);
    expect(hitRatio(g)).toBeCloseTo(6 / 11);
    // lần hai không tính lại điểm đã chạm
    expect(markSegment(g, { x: 0, y: 0 }, { x: 50, y: 0 }, 8)).toBe(0);
  });

  it("ignores points outside the radius", () => {
    const g = line(5);
    expect(markSegment(g, { x: 0, y: 30 }, { x: 40, y: 30 }, 8)).toBe(0);
  });

  it("handles a tap (zero-length segment)", () => {
    const g = line(5);
    expect(markSegment(g, { x: 20, y: 1 }, { x: 20, y: 1 }, 3)).toBe(1);
  });

  it("passes a step at the threshold", () => {
    const g = line(4);
    markSegment(g, { x: 0, y: 0 }, { x: 20, y: 0 }, 1);
    expect(isStepDone(g)).toBe(true);
    expect(isStepDone(line(4))).toBe(false);
    expect(isStepDone([])).toBe(true);
  });

  it("computes progress", () => {
    expect(progressPercent(0, 26)).toBe(0);
    expect(progressPercent(13, 26)).toBe(50);
    expect(progressPercent(26, 26)).toBe(100);
    expect(progressPercent(3, 0)).toBe(100);
  });
});
