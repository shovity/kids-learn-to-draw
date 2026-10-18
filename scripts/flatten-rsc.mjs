// Next 16 ghi segment RSC thành thư mục lồng nhau (__next.color/$d$id/__PAGE__.txt) nhưng
// client lại tải tên phẳng (__next.color.$d$id.__PAGE__.txt) → tạo thêm bản phẳng để tránh 404.
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let count = 0;
for (const p of walk(OUT)) {
  const parts = relative(OUT, p).split(sep);
  const i = parts.findIndex((s, k) => s.startsWith("__next.") && k < parts.length - 1);
  if (i < 0) continue;
  copyFileSync(p, join(OUT, ...parts.slice(0, i), parts.slice(i).join(".")));
  count++;
}
console.log(`flatten-rsc: ${count} file`);
