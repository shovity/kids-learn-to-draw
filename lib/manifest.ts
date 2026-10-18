import drawings from "@/lib/drawings.json";
import frames from "@/lib/frames.json";

export type DrawingInfo = { id: string; category: string; steps: number; palette: string[] };
export type FrameInfo = { id: number; width: number; height: number; hole: { x: number; y: number; w: number; h: number } | null };
export type Category = { id: string; title: string; emoji: string; color: string };

export const DRAWINGS = drawings as DrawingInfo[];
export const FRAMES = frames as FrameInfo[];

// Thứ tự & tên chủ đề (app gốc: Animal, Fruit, Food, Flower, Plant, Transport, Dress, Art).
export const CATEGORIES: Category[] = [
  { id: "animal", title: "Con vật", emoji: "🦉", color: "#ff9f43" },
  { id: "fruit", title: "Trái cây", emoji: "🍓", color: "#ff6b81" },
  { id: "food", title: "Đồ ăn", emoji: "🧁", color: "#f7b731" },
  { id: "flower", title: "Bông hoa", emoji: "🌷", color: "#e056a0" },
  { id: "plant", title: "Cây cối", emoji: "🌵", color: "#26c281" },
  { id: "transport", title: "Xe cộ", emoji: "🚗", color: "#4b9bff" },
  { id: "dress", title: "Thời trang", emoji: "👗", color: "#a55eea" },
  { id: "art", title: "Đồ vật", emoji: "🎨", color: "#20bfb0" },
];

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const asset = (path: string) => `${BASE}/${path}`;
export const thumbUrl = (id: string) => asset(`thumbs/${id}.webp`);
export const frameUrl = (id: number) => asset(`frames/${id}.webp`);
/** Ảnh giao diện gốc trong public/ui (mặc định .png). */
export const ui = (name: string) => asset(`ui/${name.includes(".") ? name : name + ".png"}`);

export function findDrawing(id: string): DrawingInfo | undefined {
  return DRAWINGS.find((d) => d.id === id);
}

export function categoryOf(id: string): Category {
  const cat = id.replace(/_\d+$/, "");
  return CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[0];
}

/** Số thứ tự hiển thị trong chủ đề, ví dụ "animal_003" → 3. */
export const drawingNumber = (id: string) => Number(id.slice(id.lastIndexOf("_") + 1));

export function drawingTitle(id: string): string {
  return `${categoryOf(id).title} ${drawingNumber(id)}`;
}
