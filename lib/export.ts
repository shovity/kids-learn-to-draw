// Tải ảnh về máy và chia sẻ (thay cho nút download/share của app gốc).

export const canvasToBlob = (c: HTMLCanvasElement, type = "image/png", quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), type, quality));

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Chia sẻ qua Web Share API nếu có; nếu không thì tải về. Trả về "shared" | "downloaded" | "cancelled". */
export async function shareBlob(blob: Blob, name: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], name, { type: blob.type });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  downloadBlob(blob, name);
  return "downloaded";
}

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

export const fileStamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
