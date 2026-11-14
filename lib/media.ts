// Pengolahan lampiran di browser: kompres gambar, ambil bingkai video, baca berkas kecil.
import { MAX_DATA_URL_CHARS } from "@/lib/domain/insight";
import type { Attachment } from "@/lib/domain/types";

/** Bagian lampiran yang dikirim ke analisis AI (base64 tanpa awalan data:). */
export interface AiMedia {
  mime: string;
  data: string;
  label: string;
}

export interface ProcessedFile {
  attachment: Attachment;
  ai: AiMedia[];
}

export class MediaError extends Error {}

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_SMALL_FILE_BYTES = 300 * 1024;
const uid = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

function drawScaled(source: CanvasImageSource, w: number, h: number, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new MediaError("Browser tidak dapat memproses gambar ini.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Kompres sampai muat batas penyimpanan; turunkan ukuran bertahap. */
function compress(source: CanvasImageSource, w: number, h: number): string {
  for (const [side, q] of [[1280, 0.72], [1024, 0.65], [800, 0.55], [640, 0.5]] as const) {
    const url = drawScaled(source, w, h, side, q);
    if (url.length <= MAX_DATA_URL_CHARS) return url;
  }
  throw new MediaError("Gambar terlalu besar untuk disimpan. Coba foto lain.");
}

async function imageOf(file: File): Promise<ProcessedFile> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new MediaError(`“${file.name}” tidak dapat dibuka sebagai gambar.`);
  });
  const dataUrl = compress(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return {
    attachment: { id: uid(), kind: "image", name: file.name || "foto.jpg", mime: "image/jpeg", size: file.size, dataUrl },
    ai: [{ mime: "image/jpeg", data: base64Of(dataUrl), label: file.name || "foto" }],
  };
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { video.removeEventListener("seeked", done); resolve(); };
    video.addEventListener("seeked", done);
    video.addEventListener("error", () => reject(new MediaError("Video tidak dapat dibaca.")), { once: true });
    video.currentTime = t;
  });
}

/** Video tidak disimpan utuh (batas penyimpanan browser); simpan bingkai pratinjau + kirim 3 bingkai ke AI. */
async function videoOf(file: File): Promise<ProcessedFile> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new MediaError(`“${file.name}” tidak dapat dibuka sebagai video.`));
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const frames: string[] = [];
    for (const f of [0.1, 0.5, 0.9]) {
      await seek(video, Math.min(duration * f, Math.max(duration - 0.05, 0)));
      frames.push(drawScaled(video, video.videoWidth, video.videoHeight, 768, 0.6));
    }
    const poster = frames[1].length <= MAX_DATA_URL_CHARS ? frames[1] : null;
    return {
      attachment: { id: uid(), kind: "video", name: file.name || "video.mp4", mime: file.type || "video/mp4", size: file.size, dataUrl: poster },
      ai: frames.map((f, i) => ({ mime: "image/jpeg", data: base64Of(f), label: `bingkai ${i + 1}/3 dari video ${file.name}` })),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new MediaError(`“${file.name}” tidak dapat dibaca.`));
    r.readAsDataURL(file);
  });
}

async function plainFileOf(file: File): Promise<ProcessedFile> {
  const isPdf = file.type === "application/pdf";
  const isText = file.type === "text/plain";
  if (!isPdf && !isText) throw new MediaError(`Jenis berkas “${file.name}” belum didukung. Gunakan foto, video, PDF, atau teks.`);
  const dataUrl = await readAsDataUrl(file);
  const keep = file.size <= MAX_SMALL_FILE_BYTES && dataUrl.length <= MAX_DATA_URL_CHARS;
  return {
    attachment: { id: uid(), kind: "file", name: file.name, mime: file.type, size: file.size, dataUrl: keep ? dataUrl : null },
    ai: [{ mime: file.type, data: base64Of(dataUrl), label: file.name }],
  };
}

/** Berkas diproses sesuai jenisnya. Melempar MediaError dengan pesan yang bisa ditampilkan. */
export async function processFile(file: File): Promise<ProcessedFile> {
  if (file.size > MAX_FILE_BYTES) throw new MediaError(`“${file.name}” lebih dari 12 MB. Pilih berkas yang lebih kecil.`);
  if (file.type.startsWith("image/")) return imageOf(file);
  if (file.type.startsWith("video/")) return videoOf(file);
  return plainFileOf(file);
}
