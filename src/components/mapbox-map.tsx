import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { LatLng } from "./map-types";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { mapFailureKind, mapRetryDelay } from "@/lib/map-recovery";

/** Browser-only Mapbox map. Import lazily (never during SSR). */
export default function MapboxMap({
  selected,
  flyTo,
  onSelect,
}: {
  selected: LatLng | null;
  flyTo: { point: LatLng; zoom: number; key: number } | null;
  onSelect: (p: LatLng) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [partial, setPartial] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(0);
  const retryAtRef = useRef(0);
  const failures = useRef(0);
  const camera = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null);
  const retrying = useRef(false);
  const failedSources = useRef(new Set<string>());
  const { t } = useLanguage();

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    const token = import.meta.env['VITE_MAPBOX_PUBLIC_TOKEN'] as string | undefined;
    if (!el.current) return;
    if (!token) {
      setState("error");
      return;
    }
    setState("loading");
    setPartial(false);
    failedSources.current.clear();
    mapboxgl.accessToken = token;
    let m: mapboxgl.Map;
    try {
      m = new mapboxgl.Map({
        container: el.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [64.6, 41.3],
        zoom: 5.2,
        ...camera.current,
        // Satellite imagery is static for this picker; retain normal HTTP caching
        // but avoid SDK background expiration refreshes.
        refreshExpiredTiles: false,
      });
    } catch {
      setState("error");
      return;
    }
    map.current = m;
    m.addControl(new mapboxgl.NavigationControl(), "top-right");
    m.addControl(new mapboxgl.ScaleControl(), "bottom-left");
    m.on("load", () => { setState("ready"); retrying.current = false; });
    m.on("error", (e) => {
      const error = e.error as { status?: number; url?: string; headers?: Headers } | undefined;
      const status = error?.status;
      const sourceId = (e as unknown as { sourceId?: string }).sourceId;
      const kind = mapFailureKind(error ?? {}, sourceId);
      if (sourceId) failedSources.current.add(sourceId);
      if (kind === "partial" || m.isStyleLoaded()) {
        setPartial(true);
        // A tile error during initial loading must not obscure all good tiles.
        setState("ready");
      } else {
        setState("error");
      }
      retrying.current = false;
      if (Date.now() >= retryAtRef.current) {
        failures.current += 1;
        // GL 3.31 AJAXError currently drops response headers. Do not issue an
        // extra probe just to get them; use conservative backoff in that case.
        const until = Date.now() + mapRetryDelay(failures.current, error?.headers?.get("retry-after"));
        retryAtRef.current = until;
        setRetryAt(until);
        setClock(Date.now());
      }
      if (import.meta.env.DEV) {
        console.warn("Mapbox request failed", { status, kind });
      }
    });
    m.on("click", (e) => onSelectRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    m.getCanvas().style.cursor = "crosshair";
    return () => {
      const center = m.getCenter();
      camera.current = { center: [center.lng, center.lat], zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() };
      marker.current?.remove();
      marker.current = null;
      m.remove();
      map.current = null;
      retrying.current = false;
    };
  }, [attempt]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!selected) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = new mapboxgl.Marker({ color: "#e4572e", scale: 1.3 });
    }
    marker.current.setLngLat([selected.lng, selected.lat]).addTo(m);
  }, [selected, state]);

  useEffect(() => {
    if (!flyTo || !map.current) return;
    map.current.flyTo({ center: [flyTo.point.lng, flyTo.point.lat], zoom: flyTo.zoom, essential: true });
  }, [flyTo]);

  function retry() {
    if (retrying.current || Date.now() < retryAtRef.current) return;
    retrying.current = true;
    // Lock synchronously, including double clicks, and back off repeated failures.
    const until = Date.now() + mapRetryDelay(failures.current + 1);
    retryAtRef.current = until;
    setRetryAt(until);
    setClock(Date.now());
    const m = map.current;
    if (m?.isStyleLoaded()) {
      const sourceIds = failedSources.current.size
        ? [...failedSources.current]
        : Object.entries(m.getStyle()?.sources ?? {}).filter(([, source]) => source.type === "raster").map(([id]) => id);
      for (const id of sourceIds) {
        const source = m.getSource(id);
        if (source && "reload" in source && typeof source.reload === "function") source.reload();
      }
      // Reuse the instance, camera, controls, marker and good cached tiles.
      m.once("idle", () => { retrying.current = false; });
    } else {
      setAttempt((a) => a + 1);
    }
  }
  const remaining = Math.max(0, Math.ceil((retryAt - clock) / 1000));

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="absolute! inset-0" />
      {state === "loading" ? (
        <div className="absolute inset-0 grid place-items-center bg-muted">
          <div className="flex flex-col items-center gap-3">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">{t("map.loading")}</p>
          </div>
        </div>
      ) : null}
      {state === "error" ? (
        <div className="absolute inset-0 grid place-items-center bg-muted p-6 text-center">
          <div>
            <p className="text-base font-semibold text-foreground">{t("map.errorTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("map.errorText")}</p>
            <Button
              type="button"
              onClick={retry}
              disabled={remaining > 0}
              className="mt-3"
            >
              {remaining > 0 ? t("map.retryWait", { seconds: remaining }) : t("map.retry")}
            </Button>
          </div>
        </div>
      ) : null}
      {partial && state === "ready" ? (
        <div role="status" className="absolute bottom-20 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card/95 p-3 text-xs text-foreground shadow-sm">
          <p className="min-w-0 flex-1 basis-48">{t("map.partial")}</p>
          <Button variant="outline" size="sm" className="h-auto max-w-full whitespace-normal" disabled={remaining > 0} onClick={retry}>
            {remaining > 0 ? t("map.retryWait", { seconds: remaining }) : t("map.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
