import { useEffect, useRef, useState } from 'react'
import { GeoJSONSource, LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Locate, LocateFixed, ZoomIn, ZoomOut } from 'lucide-react'
import type { SimTelemetry, TrackPoint } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import type { Waypoint } from './route'
import { mToFt, msToKt } from './units'

// maplibre-gl ships its tile-parsing worker as a separate chunk and locates it via its
// own import.meta.url at runtime — a resolution that doesn't survive Vite's dependency
// pre-bundling, so the worker silently loads no real code and every vector tile request
// hangs forever (base map renders as a blank/fallback colour, nothing ever appears).
// Pointing it at Vite's resolved asset URL explicitly sidesteps that.
setWorkerUrl(maplibreWorkerUrl)

// docs/decisions.md, 2026-09-01 M4 tile source entry: OpenFreeMap, no key/quota/backend.
// positron over liberty: a low-color basemap reads better under a flight track overlay.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const ROUTE_SOURCE_ID = 'planned-route'
const TRAIL_SOURCE_ID = 'breadcrumb-trail'
const WAYPOINT_SOURCE_ID = 'planned-waypoints'
// Regional view — wide enough that the aircraft doesn't outrun the viewport between
// track points (zoom 13 was street-level, well under a minute of flight across it).
const FOLLOW_ZOOM = 11

interface LineStringFeature {
  type: 'Feature'
  properties: Record<string, never>
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

function lineString(coords: [number, number][]): LineStringFeature {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
}

interface WaypointFeatureCollection {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    properties: { ident: string; segment: string }
    geometry: { type: 'Point'; coordinates: [number, number] }
  }[]
}

function waypointFeatures(waypoints: Waypoint[]): WaypointFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: waypoints.map((w) => ({
      type: 'Feature',
      properties: { ident: w.ident, segment: w.segment },
      geometry: { type: 'Point', coordinates: [w.lon, w.lat] }
    }))
  }
}

function fitBoundsTo(map: MapLibreMap, coords: [number, number][]): void {
  if (coords.length > 1) {
    const bounds = coords.reduce((b, coord) => b.extend(coord), new LngLatBounds(coords[0], coords[0]))
    map.fitBounds(bounds, { padding: 40, duration: 0 })
  } else if (coords.length === 1) {
    map.jumpTo({ center: coords[0], zoom: FOLLOW_ZOOM })
  }
}

export interface FlightMapProps {
  /** Planned route (from the flight's stored OFP), GeoJSON [lon, lat] order. */
  route: [number, number][]
  /** Per-fix waypoint pins along the planned route (ident labels), same source as `route`. */
  waypoints?: Waypoint[]
  trackPoints: TrackPoint[]
  /**
   * true (TrackView): animated marker/camera follow as new points arrive.
   * false (Logbook detail): draw the whole trail once and fit the view to it — the
   * flight's over, there's nothing to follow, and seeing the full route at a glance is
   * more useful for review than a zoomed-in single point.
   */
  live: boolean
  /** Live sim telemetry — shown as a small IAS/altitude/heading overlay at the map's
   *  bottom edge when present (TrackView only; Logbook/Dispatch don't pass it). */
  telemetry?: SimTelemetry | null
}

// Stable reference for the default so the route/waypoint effect below doesn't re-fire on
// every render just because callers that don't pass `waypoints` get a fresh `[]` each time.
const EMPTY_WAYPOINTS: Waypoint[] = []

export function FlightMap({
  route,
  waypoints = EMPTY_WAYPOINTS,
  trackPoints,
  live,
  telemetry
}: FlightMapProps): React.JSX.Element {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  // Not trackPoints.length === 1: resuming an in-progress flight loads every existing
  // point in one batch (trackPointList), so length would jump straight past 1.
  const hasCenteredRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  // Whether the camera keeps recentering on the aircraft as new track points arrive
  // (live mode only) — a user panning around to look at something shouldn't keep
  // getting yanked back. Defaults on, matching the always-follow behavior before this
  // was made toggleable.
  const [followEnabled, setFollowEnabled] = useState(true)

  // Map setup — once. Data is pushed in via separate effects below as it changes.
  useEffect(() => {
    if (!mapContainerRef.current) return
    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [0, 0],
      zoom: 1
    })
    mapRef.current = map

    // 'load' waits for every tile in the current viewport to finish rendering — at this
    // initial [0,0]/zoom 1 (whole-world) view that can take a very long time or never
    // fully fire. 'style.load' fires once the style itself is parsed, which is all that's
    // needed to safely add sources/layers (sim-confirmed: 'load' never fired within 10s
    // in manual testing here, 'style.load' fires almost immediately).
    map.on('style.load', () => {
      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: lineString([]) })
      map.addLayer({
        id: ROUTE_SOURCE_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        paint: { 'line-color': '#888', 'line-width': 2, 'line-dasharray': [2, 2] }
      })

      map.addSource(TRAIL_SOURCE_ID, { type: 'geojson', data: lineString([]) })
      map.addLayer({
        id: TRAIL_SOURCE_ID,
        type: 'line',
        source: TRAIL_SOURCE_ID,
        paint: { 'line-color': '#1a73e8', 'line-width': 3 }
      })

      map.addSource(WAYPOINT_SOURCE_ID, { type: 'geojson', data: waypointFeatures([]) })
      map.addLayer({
        id: `${WAYPOINT_SOURCE_ID}-circle`,
        type: 'circle',
        source: WAYPOINT_SOURCE_ID,
        paint: {
          'circle-radius': 3,
          // SID/STAR fixes stand out from plain enroute waypoints — same route.ts
          // segmentation SimBrief itself reports (docs/decisions.md, sid-star-selection
          // entry), not yet swappable for an alternate procedure (blocked on Navigraph).
          'circle-color': [
            'match',
            ['get', 'segment'],
            'sid',
            '#e67700',
            'star',
            '#7048e8',
            /* enroute */ '#888'
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff'
        }
      })
      map.addLayer({
        id: `${WAYPOINT_SOURCE_ID}-label`,
        type: 'symbol',
        source: WAYPOINT_SOURCE_ID,
        layout: {
          'text-field': ['get', 'ident'],
          'text-size': 11,
          'text-offset': [0, 1],
          'text-anchor': 'top'
        },
        paint: { 'text-color': '#555', 'text-halo-color': '#fff', 'text-halo-width': 1 }
      })

      // A text glyph (e.g. '✈') isn't drawn pointing true north in every font, so
      // setRotation(heading) comes out offset by whatever the glyph's own heading is.
      // This SVG is authored nose-up (pointing north at 0 rotation), so it lines up exactly.
      const el = document.createElement('div')
      el.style.width = '22px'
      el.style.height = '22px'
      el.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24">' +
        '<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-5.5l8 2.5z" fill="#1a73e8" stroke="#0b3d91" stroke-width="0.5"/>' +
        '</svg>'
      markerRef.current = new Marker({ element: el, rotationAlignment: 'map' })

      setMapReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Draw the planned route and its waypoint pins — falls back to nothing if the flight
  // has no stored OFP.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const routeSource = mapRef.current.getSource<GeoJSONSource>(ROUTE_SOURCE_ID)
    routeSource?.setData(lineString(route))
    const waypointSource = mapRef.current.getSource<GeoJSONSource>(WAYPOINT_SOURCE_ID)
    waypointSource?.setData(waypointFeatures(waypoints))
    if (live) fitBoundsTo(mapRef.current, route)
  }, [mapReady, route, waypoints, live])

  // Static (Logbook) mode: draw the whole trail once and fit the view to it. No follow,
  // no animation — the flight already happened.
  useEffect(() => {
    if (!mapReady || !mapRef.current || live) return
    const coords: [number, number][] = trackPoints.map((p) => [p.longitude, p.latitude])
    const source = mapRef.current.getSource<GeoJSONSource>(TRAIL_SOURCE_ID)
    source?.setData(lineString(coords))

    const last = trackPoints[trackPoints.length - 1]
    if (last && markerRef.current) {
      markerRef.current.setLngLat([last.longitude, last.latitude])
      markerRef.current.setRotation(last.headingTrueDeg)
      if (!markerRef.current.getElement().isConnected) markerRef.current.addTo(mapRef.current)
    }
    // No flown trail to fit to yet (e.g. Dispatch's fetched-but-not-flown OFP preview) —
    // fall back to the planned route so the map still zooms to something useful instead
    // of sitting at the whole-world default view.
    fitBoundsTo(mapRef.current, coords.length > 0 ? coords : route)
  }, [mapReady, trackPoints, route, live])

  // Live (TrackView) mode: trail + marker follow the accumulated track points. The
  // marker/camera position animates across the real gap between the last two samples
  // rather than snapping — even at the tighter 2s/5s climb/cruise recording intervals
  // (see FlightRecorder.ts) a plain snap-to still reads as a jump.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !live) return

    const to = trackPoints[trackPoints.length - 1]
    if (!to) {
      // No points to show (e.g. the flight was just cancelled, finished, or auto-
      // completed) — clear the trail and pull the marker off the map rather than leaving
      // the last-drawn position stuck there indefinitely.
      mapRef.current.getSource<GeoJSONSource>(TRAIL_SOURCE_ID)?.setData(lineString([]))
      if (markerRef.current?.getElement().isConnected) markerRef.current.remove()
      hasCenteredRef.current = false
      return
    }
    if (!markerRef.current) return
    if (!markerRef.current.getElement().isConnected) {
      // Marker.addTo() reads the marker's position immediately, so it must already have
      // one — attach it here, before any of the branches below, all of which assume the
      // marker is already on the map.
      markerRef.current.setLngLat([to.longitude, to.latitude])
      markerRef.current.addTo(mapRef.current)
    }

    const source = mapRef.current.getSource<GeoJSONSource>(TRAIL_SOURCE_ID)
    // Everything except the still-animating final leg — the tip is drawn per-frame below,
    // in lockstep with the marker, so the line never gets ahead of where the icon has
    // actually animated to.
    const priorCoords: [number, number][] = trackPoints.slice(0, -1).map((p) => [p.longitude, p.latitude])

    if (!hasCenteredRef.current) {
      // First point of this session: jump in from the whole-world default view to
      // something usable — setCenter alone doesn't change zoom, so without an explicit
      // zoom here the view stayed at zoom 1. No animation for this one — it may be
      // catching up on a whole batch of history from a resumed in-progress flight.
      hasCenteredRef.current = true
      source?.setData(lineString([...priorCoords, [to.longitude, to.latitude]]))
      markerRef.current.setLngLat([to.longitude, to.latitude])
      markerRef.current.setRotation(to.headingTrueDeg)
      if (followEnabled) mapRef.current.jumpTo({ center: [to.longitude, to.latitude], zoom: FOLLOW_ZOOM })
      return
    }

    const from = trackPoints[trackPoints.length - 2]
    if (!from) {
      source?.setData(lineString([...priorCoords, [to.longitude, to.latitude]]))
      markerRef.current.setLngLat([to.longitude, to.latitude])
      markerRef.current.setRotation(to.headingTrueDeg)
      if (followEnabled) mapRef.current.easeTo({ center: [to.longitude, to.latitude], duration: 500 })
      return
    }

    // Rotation shows the plane's actual nose heading (not the ground track the marker is
    // animating along) — the gap between the two through a turn or in a crosswind is
    // exactly the crab angle, which is useful to see. Interpolated smoothly between the
    // two reported samples, same as position — a snap-to-latest read as a visible jump in
    // rotation each time a new sample arrived, even though it's technically the more
    // "correct" instantaneous value.
    // Shortest-path delta so e.g. 350deg -> 10deg animates through 360, not backwards
    // through 180.
    const headingDelta = ((to.headingTrueDeg - from.headingTrueDeg + 540) % 360) - 180
    // Capped so a paused sim or a stale first sample can't produce a multi-minute crawl.
    const durationMs = Math.min(
      Math.max(new Date(to.tsUtc).getTime() - new Date(from.tsUtc).getTime(), 200),
      20000
    )
    const startTime = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min((now - startTime) / durationMs, 1)
      const lng = from.longitude + (to.longitude - from.longitude) * t
      const lat = from.latitude + (to.latitude - from.latitude) * t
      markerRef.current?.setLngLat([lng, lat])
      markerRef.current?.setRotation(from.headingTrueDeg + headingDelta * t)
      source?.setData(lineString([...priorCoords, [lng, lat]]))
      if (t < 1) frame = requestAnimationFrame(step)
    })
    if (followEnabled) mapRef.current.easeTo({ center: [to.longitude, to.latitude], duration: durationMs })

    return () => cancelAnimationFrame(frame)
  }, [mapReady, trackPoints, live, followEnabled])

  // Re-center immediately when follow is switched back on, rather than waiting for the
  // next track point to arrive.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !live || !followEnabled) return
    const last = trackPoints[trackPoints.length - 1]
    if (last) mapRef.current.easeTo({ center: [last.longitude, last.latitude], duration: 500 })
    // Only on the follow-enabled transition itself — trackPoints already has its own
    // effect above driving the camera while following.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followEnabled])

  const mapControlButtonClassName = 'bg-popover/85 backdrop-blur-sm hover:bg-popover'

  return (
    <div className="relative h-full">
      <div
        ref={mapContainerRef}
        className="h-full min-h-64 w-full overflow-hidden rounded-xl border border-border"
      />
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        {live && (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={mapControlButtonClassName}
            aria-label={followEnabled ? 'Stop centering on aircraft' : 'Center on aircraft'}
            title={followEnabled ? 'Stop centering on aircraft' : 'Center on aircraft'}
            aria-pressed={followEnabled}
            onClick={() => setFollowEnabled((v) => !v)}
          >
            {followEnabled ? <LocateFixed className="text-accent" /> : <Locate />}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className={mapControlButtonClassName}
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <ZoomIn />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className={mapControlButtonClassName}
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <ZoomOut />
        </Button>
      </div>
      {live && (
        <div className="absolute bottom-3 left-3 rounded-full border border-border bg-popover/85 px-3 py-1 font-mono text-xs text-popover-foreground backdrop-blur-sm">
          Speed: {telemetry ? `${Math.round(msToKt(telemetry.indicatedAirspeedMs))} kt` : 'N/A'} · Altitude:{' '}
          {telemetry ? `${Math.round(mToFt(telemetry.altitudeM)).toLocaleString()} ft` : 'N/A'} · Heading:{' '}
          {telemetry ? `${Math.round(telemetry.headingTrueDeg)}°` : 'N/A'}
        </div>
      )}
    </div>
  )
}
