// Bộ icon nét tròn, vẽ tay bằng SVG (thay cho các ảnh nút của app gốc).
const PATHS: Record<string, string> = {
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11",
  redo: "M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13",
  eraser: "M7 21h10M5.6 15.4l8.5-8.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L13 18H8.2a2 2 0 01-1.4-.6l-1.2-1.2a2 2 0 010-2.8zM10 10l6 6",
  brush: "M9.5 14.5l-3 3c-1 1-1 2.5-2.5 3 2.5.5 5 0 6.5-1.5l2-2M9.5 14.5l2 2M9.5 14.5L19 5a1.5 1.5 0 012 2l-9.5 9.5",
  bucket: "M5 11l7-7 7 7-7 7a2 2 0 01-2.8 0L5 13.8A2 2 0 015 11zM5 11h14M20 15s1.5 2 1.5 3a1.5 1.5 0 01-3 0c0-1 1.5-3 1.5-3z",
  size: "M5 8h14M5 13h14M5 18h14",
  palette: "M12 3a9 9 0 100 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 005-5c0-4-4-7.2-9-7.2zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01M17 11.5h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  zoom: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M11 8v6M8 11h6",
  zoomOff: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M8 11h6",
  help: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-.8.6-1.5 1-1.5 2M12 17h.01",
  share: "M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7",
  download: "M12 3v12M8 11l4 4 4-4M5 19h14",
  frame: "M4 4h16v16H4zM8 8h8v8H8z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3",
  home: "M4 11l8-7 8 7M6 9.5V20h4v-5h4v5h4V9.5",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  sound: "M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12",
  mute: "M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6",
  vibrate: "M8 4h8v16H8zM4 8v8M20 8v8M2 10v4M22 10v4",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  plus: "M12 5v14M5 12h14",
  shapes: "M8.5 3l5 8.5h-10zM17 13a4 4 0 100 8 4 4 0 000-8zM3 14h7v7H3z",
  bg: "M4 4h16v16H4zM4 14l6-6 10 10",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  hand: "M8 13V5.5a1.5 1.5 0 013 0V11m0-1.5v-1a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v1.5m0-.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-2a6 6 0 01-4.7-2.3L4.5 16a1.6 1.6 0 012.4-2.1L8 15",
  star: "M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z",
  pencil: "M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3",
  paper: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  play: "M7 4.5v15l12-7.5z",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  more: "M12 6h.01M12 12h.01M12 18h.01",
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 26, stroke = 2.3, fill }: { name: IconName; size?: number; stroke?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ?? "none"} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
