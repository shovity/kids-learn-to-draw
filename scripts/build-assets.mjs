// Chuyển tài nguyên trích từ APK (thư mục apk/, không commit) thành dữ liệu cho bản web.
// Chạy một lần sau khi giải nén APK:  npm run assets
//   apk/unpacked/res/raw/*.svg        → public/drawings/<id>.json + lib/drawings.json
//   apk/unpacked/assets/<id>.png      → public/thumbs/<id>.webp
//   apk/decoded/.../ic_decorate_*     → public/frames/<n>.webp + lib/frames.json
//   apk/decoded/.../paint_style_*     → public/stamps/*.png
//   apk/decoded/.../(nút, icon...)    → public/ui/*  ·  shape_fill_N/shape_stroke_N → public/shapes/*
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const RAW = "apk/unpacked/res/raw";
const ASSETS = "apk/unpacked/assets";
const DRAWABLE = "apk/decoded/res/drawable-xhdpi";
const ICON = "apk/extracted/icon.png"; // icon cửa hàng trong gói XAPK

const CATEGORIES = ["animal", "fruit", "food", "flower", "plant", "transport", "dress", "art"];

const fresh = (dir) => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
};

/** Lấy thuộc tính của từng phần tử <path>/<polyline>/<polygon> trong một nhóm <g id="...">. */
function groupElements(svg, id) {
  const start = svg.indexOf(`<g id="${id}"`);
  if (start < 0) return [];
  const end = svg.indexOf("</g>", start);
  const body = svg.slice(start, end);
  const out = [];
  for (const m of body.matchAll(/<(path|polyline|polygon)\b([^>]*?)\/?>/gs)) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    let d = attrs.d;
    if (m[1] !== "path") {
      const pts = attrs.points.trim().split(/[\s,]+/).map(Number);
      d = "M" + pts.reduce((s, v, i) => s + (i === 0 ? "" : i % 2 === 0 ? "L" : ",") + v, "");
      if (m[1] === "polygon") d += "Z";
    }
    out.push({ ...attrs, d: d.replace(/\s+/g, " ").trim() });
  }
  return out;
}

const normHex = (c) => {
  c = c.toLowerCase();
  return c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c;
};

function buildDrawings() {
  fresh("public/drawings");
  const list = [];
  for (const file of readdirSync(RAW).filter((f) => f.endsWith(".svg")).sort()) {
    const id = file.replace(/\.svg$/, "");
    const svg = readFileSync(join(RAW, file), "utf8");
    // Mảng đầu của nhóm "block" là nền trắng có khoét lỗ (vùng bên ngoài hình) — tách riêng.
    const all = groupElements(svg, "block");
    const outside = all[0]?.d ?? "";
    const blocks = all.slice(1).map((e) => ({ d: e.d, fill: normHex(e.fill) }));
    const lines = groupElements(svg, "line")
      .filter((e) => e.d)
      .map((e) => ({ d: e.d, w: Number(e["stroke-width"] ?? 4) }));
    // Bảng màu = các màu tô khác nhau theo thứ tự xuất hiện (như PaintActivity.x1 trong app gốc).
    const palette = [...new Set(blocks.map((b) => b.fill))];
    writeFileSync(`public/drawings/${id}.json`, JSON.stringify({ outside, blocks, lines }));
    const category = id.replace(/_\d+$/, "");
    list.push({ id, category, steps: lines.length, palette });
  }
  list.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.id.localeCompare(b.id));
  writeFileSync("lib/drawings.json", JSON.stringify(list, null, 1) + "\n");
  console.log(`drawings: ${list.length}`);
}

async function buildThumbs() {
  fresh("public/thumbs");
  const files = readdirSync(ASSETS).filter((f) => /^[a-z]+_\d+\.png$/.test(f));
  await Promise.all(
    files.map((f) =>
      sharp(join(ASSETS, f))
        .resize(360, 360)
        .flatten({ background: "#ffffff" })
        .webp({ quality: 80 })
        .toFile(`public/thumbs/${f.replace(".png", ".webp")}`),
    ),
  );
  console.log(`thumbs: ${files.length}`);
}

/** Khung trang trí: ảnh phòng có ô trong suốt để đặt tranh. Tìm hình chữ nhật của ô đó. */
async function buildFrames() {
  fresh("public/frames");
  const frames = [];
  for (let n = 1; n <= 15; n++) {
    const src = join(DRAWABLE, `ic_decorate_frames_${n}.png`);
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * 4 + 3] < 16) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    await sharp(src).webp({ quality: 82, alphaQuality: 90 }).toFile(`public/frames/${n}.webp`);
    frames.push({ id: n, width: info.width, height: info.height, hole: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } });
  }
  writeFileSync("lib/frames.json", JSON.stringify(frames, null, 1) + "\n");
  console.log(`frames: ${frames.length}`);
}

/** Mẫu đầu cọ (đen trên nền trong suốt), sẽ được tô màu khi vẽ. */
async function buildStamps() {
  fresh("public/stamps");
  const stamps = { crayon: "paint_style_1_1", crayon2: "paint_style_1_3", round: "paint_style_2_1", nib: "paint_style_3_1", air: "paint_style_5_1" };
  for (const [name, file] of Object.entries(stamps)) {
    await sharp(join(DRAWABLE, `${file}.png`)).resize(96, 96, { fit: "contain", background: "#0000" }).png().toFile(`public/stamps/${name}.png`);
  }
  // bàn tay chỉ đường khi minh hoạ nét (ic_draw_hand)
  await sharp(join(DRAWABLE, "ic_draw_hand.png")).png().toFile("public/stamps/hand.png");
  console.log(`stamps: ${Object.keys(stamps).length + 1}`);
}

// Ảnh giao diện của app gốc (nút, icon thanh công cụ, sao, banner, hộp thoại...).
const UI = [
  "paint_close_btn", "paint_done_btn", "ic_magnifier_off", "ic_magnifier_on", "iv_operate_help",
  "paint_draw_btn", "paint_draw_btn_sel", "paint_size_btn", "paint_size_btn_sel", "paint_color_btn", "paint_color_btn_sel",
  "paint_bg_color_btn", "paint_bg_color_btn_sel", "paint_eraser_btn", "paint_eraser_btn_sel", "paint_undo_btn", "paint_redo_btn",
  "paint_next_btn", "paint_start_btn", "paint_first_next", "paint_first_got",
  "home_close_img", "home_continue_img", "home_restart_img", "ic_painted_finish",
  "dialog_close_btn", "dialog_download_btn", "dialog_frame_btn", "dialog_share_btn",
  "ic_dialog_redraw", "ic_dialog_delete", "ic_dialog_share", "ic_decorate_back", "ic_decroate_help", "ic_user_work_empty",
  "ic_whiteboard_brush", "ic_whiteboard_brush_sel", "ic_whiteboard_color", "ic_whiteboard_size", "ic_whiteboard_size_sel",
  "ic_whiteboard_erase", "ic_whiteboard_erase_sel", "ic_whiteboard_geometry", "ic_whiteboard_geometry_sel",
  "ic_whiteboard_bg", "ic_whiteboard_bg_sel", "ic_whiteboard_photo", "ic_whiteboard_empty",
  "setting_btn_back", "setting_ic_sound", "setting_ic_vibration", "setting_ic_version", "setting_ic_delete", "setting_ic_privacy",
  ...[0, 1, 2, 3, 4, 5].map((n) => `ic_star_${n}`),
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`ic_paint_style_${n}`, `ic_style_${n}_logo`]),
  ...[1, 2, 3, 4, 5].flatMap((n) => [`ic_pen_${n}`, `ic_pen_sample_${n}`]),
  ...[3, 5, 7, 9, 12, 15, 18, 21, 25, 30, 37, 45].flatMap((n) => [`ic_line_${n}`, `ic_line_deep_${n}`]),
];

async function buildUi() {
  fresh("public/ui");
  await Promise.all(
    UI.map(async (name) => {
      const src = join(DRAWABLE, `${name}.png`);
      const meta = await sharp(src).metadata();
      // ảnh lớn thu về tối đa 300px (màn hình chỉ hiển thị cỡ 100–150 CSS px)
      const img = meta.width > 300 && !name.startsWith("ic_line") && !name.startsWith("ic_paint_style") ? sharp(src).resize(300) : sharp(src);
      await img.png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(`public/ui/${name}.png`);
    }),
  );
  // ảnh nền lớn → webp
  await sharp(join(DRAWABLE, "ic_home_banner.png")).resize(1024).webp({ quality: 82 }).toFile("public/ui/ic_home_banner.webp");
  await sharp(join(DRAWABLE, "dialog_bg.jpg")).resize(540).webp({ quality: 80 }).toFile("public/ui/dialog_bg.webp");
  for (let n = 1; n <= 15; n++) {
    await sharp(join(DRAWABLE, `ic_decorate_preview_${n}.jpg`)).resize(200, 200).webp({ quality: 78 }).toFile(`public/ui/frame_preview_${n}.webp`);
  }
  // ảnh động của thanh tab dưới (assets/gif)
  for (const n of [0, 1, 3]) {
    copyFileSync(`apk/decoded/assets/gif/main_tab_enlarge_${n}.gif`, `public/ui/main_tab_enlarge_${n}.gif`);
    // khung đầu (xám) cho tab chưa chọn
    await sharp(`apk/decoded/assets/gif/main_tab_enlarge_${n}.gif`, { page: 0 }).png().toFile(`public/ui/main_tab_off_${n}.png`);
  }
  // ảnh minh hoạ thao tác hai ngón tay
  for (const n of ["01", "02"]) copyFileSync(join(DRAWABLE, `paint_first_pic_${n}.gif`), `public/ui/paint_first_pic_${n}.gif`);
  console.log(`ui: ${UI.length + 2 + 15 + 8}`);
}

/** Hình khối của bảng vẽ (shape_fill_N đặc / shape_stroke_N viền), tô màu khi vẽ. */
async function buildShapes() {
  fresh("public/shapes");
  for (let n = 1; n <= 30; n++) {
    for (const k of ["fill", "stroke"]) {
      await sharp(join(DRAWABLE, `shape_${k}_${n}.png`)).resize(256, 256).png({ compressionLevel: 9 }).toFile(`public/shapes/${k}_${n}.png`);
    }
  }
  console.log("shapes: 60");
}

async function buildIcons() {
  const src = ICON;
  await sharp(src).resize(192, 192).png().toFile("public/icon-192.png");
  await sharp(src).resize(512, 512, { kernel: "lanczos3" }).png().toFile("public/icon-512.png");
  await sharp(src).resize(180, 180).flatten({ background: "#ffffff" }).png().toFile("public/apple-touch-icon.png");
  console.log("icons: 3");
}

buildDrawings();
await Promise.all([buildThumbs(), buildFrames(), buildStamps(), buildIcons(), buildUi(), buildShapes()]);
