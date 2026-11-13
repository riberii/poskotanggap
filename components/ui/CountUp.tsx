import { useEffect, useRef, useState } from "react";

const lastSeen = new Map<string, number>();

/**
 * Angka yang menghitung naik hanya saat nilainya BERUBAH (bukan tiap render).
 * Dengan `id`, nilai terakhir diingat selama sesi SPA: kembali ke dashboard setelah verifikasi
 * menampilkan angka yang berdetak dari nilai lama ke nilai baru.
 */
export function CountUp({ value, id }: { value: number; id?: string }) {
  const start = id !== undefined ? (lastSeen.get(id) ?? value) : value;
  const [shown, setShown] = useState(start);
  const [bump, setBump] = useState(false);
  const prev = useRef(start);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (id !== undefined) lastSeen.set(id, value);
    if (from === value) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    setBump(true);
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(t) {
      const k = Math.min(1, (t - t0) / 400);
      setShown(Math.round(from + (value - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setBump(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, id]);
  return <span className={`inline-block ${bump ? "bump" : ""}`}>{shown}</span>;
}
