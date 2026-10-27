import { useEffect, useMemo, useRef, useState } from "react";
import type { LatLng } from "./map-types";

/** Small static OSM preview used on the results page. */

const TILE = 256;

function project(lat: number, lng: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export function MapContainer({
  selected,
  height = 520,
}: {
  selected: LatLng | null;
  onSelect?: (p: LatLng) => void;
  height?: number;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: height });
  const zoom = selected ? 9 : 6;
  const center = selected ?? { lat: 41.3, lng: 64.6 };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const centerPx = project(center.lat, center.lng, zoom);

  const tiles = useMemo(() => {
    const n = 2 ** zoom;
    const left = centerPx.x - size.w / 2;
    const top = centerPx.y - size.h / 2;
    const out: { key: string; url: string; left: number; top: number }[] = [];
    for (let x = Math.floor(left / TILE); x <= Math.floor((left + size.w) / TILE); x++) {
      for (let y = Math.floor(top / TILE); y <= Math.floor((top + size.h) / TILE); y++) {
        if (y < 0 || y >= n) continue;
        const wrapped = ((x % n) + n) % n;
        out.push({
          key: `${x}-${y}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png`,
          left: x * TILE - left,
          top: y * TILE - top,
        });
      }
    }
    return out;
  }, [centerPx.x, centerPx.y, size, zoom]);

  return (
    <div
      ref={ref}
      style={{ height }}
      className="relative w-full select-none overflow-hidden rounded-xl border border-border bg-muted"
    >
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute"
          style={{ left: t.left, top: t.top, width: TILE, height: TILE }}
        />
      ))}
      {selected ? (
        <span
          className="absolute z-10 h-5 w-5 rounded-full border-2 border-card bg-primary shadow"
          style={{ left: size.w / 2, top: size.h / 2, transform: "translate(-50%, -50%)" }}
        />
      ) : null}
      <p className="absolute bottom-2 right-3 z-20 rounded bg-card/90 px-2 py-1 text-[11px] text-muted-foreground">
        © OpenStreetMap contributors
      </p>
    </div>
  );
}
