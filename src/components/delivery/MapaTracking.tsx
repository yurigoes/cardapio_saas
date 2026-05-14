"use client";

/**
 * MapaTracking — mapa Leaflet com pinos de empresa, motoboy e destino.
 * Carrega Leaflet via CDN dinamicamente (sem dependência npm pra evitar bloat).
 */
import { useEffect, useRef } from "react";

// Leaflet é carregado via CDN — não temos types instalados pra evitar bloat npm.
// Usamos `any` no namespace global pra não quebrar build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L?: any;
  }
}

export interface PinPoint {
  lat:    number;
  lng:    number;
  label?: string;
  color?: "red" | "blue" | "green" | "orange";
}

interface Props {
  origem?:  PinPoint | null;     // restaurante
  motoboy?: PinPoint | null;     // motoboy em movimento
  destino?: PinPoint | null;     // endereço cliente
  height?:  number;
  className?: string;
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let leafletLoading: Promise<unknown> | null = null;
function loadLeaflet(): Promise<unknown> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoading) return leafletLoading;

  leafletLoading = new Promise((resolve, reject) => {
    // CSS
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel  = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    // JS
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load",  () => resolve(window.L!));
      existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src   = LEAFLET_JS;
    script.async = true;
    script.onload  = () => resolve(window.L!);
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    document.head.appendChild(script);
  });
  return leafletLoading;
}

// Ícone customizado por cor (usa SVG inline)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeIcon(L: any, color: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
      <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 28 16 28s16-17 16-28C32 7.2 24.8 0 16 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="#fff"/>
    </svg>`;
  return L.divIcon({
    className: "",
    html: svg,
    iconSize:   [32, 44],
    iconAnchor: [16, 44],
    popupAnchor:[0, -40],
  });
}

const COLORS = {
  red:    "#ef4444",
  blue:   "#3b82f6",
  green:  "#10b981",
  orange: "#f97316",
};

export function MapaTracking({ origem, motoboy, destino, height = 300, className = "" }: Props) {
  const ref     = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadLeaflet().then((L: any) => {
      if (cancelled || !ref.current) return;
      if (!mapRef.current) {
        const map = L.map(ref.current, { zoomControl: true, attributionControl: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);
        L.control.attribution({ position: "bottomright", prefix: false })
          .addAttribution("&copy; OpenStreetMap")
          .addTo(map);
        mapRef.current  = map;
        layerRef.current = L.layerGroup().addTo(map);
        // Fit inicial
        map.setView([-23.55, -46.63], 12);
      }

      // Atualiza pinos
      const layer = layerRef.current!;
      layer.clearLayers();
      const pontos: [number, number][] = [];

      const add = (p: PinPoint | null | undefined) => {
        if (!p) return;
        const color = COLORS[p.color ?? "red"];
        const m = L.marker([p.lat, p.lng], { icon: makeIcon(L, color) });
        if (p.label) m.bindPopup(p.label);
        m.addTo(layer);
        pontos.push([p.lat, p.lng]);
      };
      add(origem);
      add(motoboy);
      add(destino);

      // Linha motoboy → destino
      if (motoboy && destino) {
        L.polyline([[motoboy.lat, motoboy.lng], [destino.lat, destino.lng]], {
          color: COLORS.blue, weight: 3, opacity: 0.5, dashArray: "6 8",
        }).addTo(layer);
      }

      if (pontos.length === 1) {
        mapRef.current!.setView(pontos[0], 15);
      } else if (pontos.length > 1) {
        mapRef.current!.fitBounds(pontos, { padding: [40, 40], maxZoom: 16 });
      }
    }).catch(err => console.error("[MapaTracking]", err));

    return () => { cancelled = true; };
  }, [origem, motoboy, destino]);

  return (
    <div
      ref={ref}
      style={{ height, width: "100%" }}
      className={`rounded-xl overflow-hidden bg-slate-800 ${className}`}
    />
  );
}
