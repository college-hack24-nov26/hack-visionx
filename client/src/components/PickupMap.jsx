import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useSavedLocation } from "../context/LocationContext";
import { haversineKm, formatKm } from "../lib/location";

// Road routes from the free FOSSGIS OSRM service (no key needed).
const ROUTE_BASE = {
  foot: "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
  bike: "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
};

function dotIcon(cls) {
  return L.divIcon({
    className: "map-dot-wrap",
    html: `<span class="map-dot ${cls}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function PickupMap({ claim }) {
  const { saved, hasCoords } = useSavedLocation();
  const l = claim.listing || {};
  const live = claim.liveState === "live" && claim.liveLat != null && claim.liveLng != null;
  const dest = live
    ? { lat: claim.liveLat, lng: claim.liveLng }
    : (l.latitude != null && l.longitude != null ? { lat: l.latitude, lng: l.longitude } : null);
  const origin = hasCoords ? { lat: saved.lat, lng: saved.lng } : null;

  const [mode, setMode] = useState("foot");
  const [route, setRoute] = useState(null);
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const layerRef = useRef(null);
  const routeKeyRef = useRef(0);
  const lastRoutedRef = useRef(null);

  // Create the map once.
  useEffect(() => {
    if (!dest || !mapRef.current || mapObj.current) return;
    const map = L.map(mapRef.current);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    mapObj.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    if (origin) map.fitBounds([[origin.lat, origin.lng], [dest.lat, dest.lng]], { padding: [30, 30] });
    else map.setView([dest.lat, dest.lng], 15);
    return () => { map.remove(); mapObj.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw dots + line when the points or the route change.
  useEffect(() => {
    const group = layerRef.current;
    if (!mapObj.current || !group || !dest) return;
    group.clearLayers();
    L.marker([dest.lat, dest.lng], { icon: dotIcon(live ? "dot-live" : "dot-static") })
      .addTo(group)
      .bindTooltip(live ? "Donor (live)" : "Pickup point");
    if (origin) {
      L.marker([origin.lat, origin.lng], { icon: dotIcon("dot-you") }).addTo(group).bindTooltip("You");
    }
    if (route && route.geometry) {
      L.polyline(route.geometry, { color: "#1E9E6A", weight: 5, opacity: 0.85 }).addTo(group);
    } else if (origin) {
      L.polyline([[origin.lat, origin.lng], [dest.lat, dest.lng]], { color: "#8a9a90", weight: 3, dashArray: "6 8" }).addTo(group);
    }
  }, [dest?.lat, dest?.lng, origin?.lat, origin?.lng, live, route]);

  // Fetch the road route; recalc only on mode change or a >=50 m move.
  useEffect(() => {
    if (!origin || !dest) { setRoute(null); return; }
    const last = lastRoutedRef.current;
    if (last && last.mode === mode
      && haversineKm(last.origin, origin) < 0.05
      && haversineKm(last.dest, dest) < 0.05) return;
    const myKey = ++routeKeyRef.current;
    const url = `${ROUTE_BASE[mode]}/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("route failed"))))
      .then((d) => {
        if (routeKeyRef.current !== myKey) return;
        const rt = d.routes && d.routes[0];
        if (!rt) throw new Error("no route");
        lastRoutedRef.current = { mode, origin, dest };
        setRoute({
          km: rt.distance / 1000,
          mins: Math.round(rt.duration / 60),
          geometry: rt.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          routed: true,
        });
      })
      .catch(() => {
        if (routeKeyRef.current !== myKey) return;
        lastRoutedRef.current = { mode, origin, dest };
        setRoute({ km: haversineKm(origin, dest), mins: null, geometry: null, routed: false });
      });
  }, [mode, origin?.lat, origin?.lng, dest?.lat, dest?.lng]);

  if (!dest) {
    return <p className="hint">No pickup point was set for this listing, so there is no map. Use the pickup address above.</p>;
  }

  const gUrl = `https://www.google.com/maps/dir/?api=1${origin ? `&origin=${origin.lat},${origin.lng}` : ""}&destination=${dest.lat},${dest.lng}&travelmode=${mode === "foot" ? "walking" : "bicycling"}`;
  const info = !origin
    ? "Set your location (📍 in the top bar) to see the route and distance."
    : !route
      ? "Working out the route…"
      : route.routed
        ? `${formatKm(route.km)} · about ${route.mins} min ${mode === "foot" ? "walking" : "cycling"} (road route)`
        : `${formatKm(route.km)} · straight-line (road route unavailable right now)`;

  return (
    <div className="pickup-map-box">
      {live ? (
        <p className="card-meta">🟢 The donor is sharing their live location — the green dot is them.</p>
      ) : claim.liveState === "stale" ? (
        <p className="card-meta">The donor's live location has gone quiet — showing the pickup point instead.</p>
      ) : (
        <p className="card-meta">Showing the pickup point set by the donor.</p>
      )}
      <div ref={mapRef} className="pickup-map" />
      <div className="recog-row">
        <button type="button" className={mode === "foot" ? "chip chip-active" : "chip"} onClick={() => setMode("foot")}>🚶 Walk</button>
        <button type="button" className={mode === "bike" ? "chip chip-active" : "chip"} onClick={() => setMode("bike")}>🚲 Cycle</button>
        <a className="btn btn-primary btn-small" href={gUrl} target="_blank" rel="noreferrer">Get Directions</a>
      </div>
      <p className="card-meta">{info}</p>
      <p className="hint">Get Directions opens Google Maps — your location goes to Google only when you tap it, never to our server.</p>
    </div>
  );
}
