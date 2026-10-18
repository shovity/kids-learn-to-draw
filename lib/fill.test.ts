import { describe, expect, it } from "vitest";
import { alphaBarrier, colorBarrier, dilate, floodRegion, hexToRgb } from "./fill";

// Lưới 5x5 có một bức tường dọc ở cột 2.
const W = 5;
const H = 5;
const wall = (i: number) => i % W === 2;

describe("floodRegion", () => {
  it("fills only the side of the wall it starts on", () => {
    const m = floodRegion(W, H, 0, 0, wall)!;
    const filled = [...m].reduce((a, b) => a + b, 0);
    expect(filled).toBe(10);
    expect(m[3]).toBe(0);
  });

  it("returns null when starting on a barrier or outside", () => {
    expect(floodRegion(W, H, 2, 2, wall)).toBeNull();
    expect(floodRegion(W, H, -1, 0, wall)).toBeNull();
    expect(floodRegion(W, H, 0, 9, wall)).toBeNull();
  });

  it("fills everything without barriers", () => {
    const m = floodRegion(W, H, 4, 4, () => false)!;
    expect([...m].every((v) => v === 1)).toBe(true);
  });
});

describe("helpers", () => {
  it("dilates a mask", () => {
    const m = new Uint8Array(W * H);
    m[12] = 1;
    const d = dilate(m, W, H, 1);
    expect([...d].reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("parses hex", () => {
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
  });

  it("builds barriers", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0, 250, 250, 250, 255]);
    expect(alphaBarrier(data)(0)).toBe(true);
    expect(alphaBarrier(data)(1)).toBe(false);
    const cb = colorBarrier(data, 2);
    expect(cb(2)).toBe(false);
    expect(cb(0)).toBe(true);
  });
});
