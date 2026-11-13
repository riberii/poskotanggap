import { useEffect, useRef, useState } from "react";

/** Angka yang menghitung naik hanya saat nilainya BERUBAH (bukan di render pertama/ulang). */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
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
  }, [value]);
  return <span className={`inline-block ${bump ? "bump" : ""}`}>{shown}</span>;
}
