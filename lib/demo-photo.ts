// Foto ILUSTRASI untuk /demo: digambar di canvas, bukan foto kejadian nyata. Diberi tulisan "FOTO SIMULASI".
import { MAX_DATA_URL_CHARS } from "@/lib/domain/insight";
import type { Attachment } from "@/lib/domain/types";
import type { AiMedia } from "@/lib/media";

export function makeSimulatedPhoto(): { attachment: Attachment; ai: AiMedia[] } {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia.");
  ctx.fillStyle = "#cfd8dc";
  ctx.fillRect(0, 0, 640, 420);
  // rumah sederhana
  for (const [x, w] of [[60, 150], [250, 170], [460, 130]] as const) {
    ctx.fillStyle = "#8d6e63";
    ctx.fillRect(x, 170, w, 110);
    ctx.fillStyle = "#5d4037";
    ctx.beginPath();
    ctx.moveTo(x - 10, 170);
    ctx.lineTo(x + w / 2, 110);
    ctx.lineTo(x + w + 10, 170);
    ctx.fill();
  }
  // air banjir setinggi jendela
  ctx.fillStyle = "rgba(121, 85, 48, 0.82)";
  ctx.fillRect(0, 235, 640, 185);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2;
  for (let y = 250; y < 410; y += 28) {
    ctx.beginPath();
    for (let x = 0; x <= 640; x += 20) ctx.lineTo(x, y + (x % 40 === 0 ? 4 : -4));
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, 640, 44);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("FOTO SIMULASI — ILUSTRASI, BUKAN KEJADIAN NYATA", 14, 29);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error("Foto simulasi terlalu besar.");
  return {
    attachment: { id: `demo-${Date.now().toString(36)}`, kind: "image", name: "foto-simulasi.jpg", mime: "image/jpeg", size: dataUrl.length, dataUrl },
    ai: [{ mime: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1), label: "foto-simulasi" }],
  };
}
