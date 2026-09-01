import { useEffect, useRef, useState } from 'react'
import { GeoJSONSource, LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { ActiveTracking, Aircraft, Flight, TrackPoint } from '@shared/ipc'
import { parseRouteFromOfpJson } from './route'

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

export function TrackView(): React.JSX.Element {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  // Not trackPoints.length === 1: resuming an in-progress flight loads every existing
  // point in one batch (trackPointList), so length would jump straight past 1.
  const hasCenteredRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)

  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [flights, setFlights] = useState<Flight[]>([])
  const [active, setActive] = useState<ActiveTracking | null>(null)
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

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

  function reload(): Promise<void> {
    return Promise.all([window.flightdeck.aircraftList(), window.flightdeck.flightList()]).then(
      ([aircraftList, flightList]) => {
        setAircraft(aircraftList)
        setFlights(flightList)
      }
    )
  }

  useEffect(() => {
    reload()
    window.flightdeck.trackingGetActive().then((a) => {
      setActive(a)
      if (a) window.flightdeck.trackPointList(a.flightId).then(setTrackPoints)
    })
    const unsubscribe = window.flightdeck.onTrackingPoint((point) => {
      setActive({ flightId: point.flightId, phase: point.phase })
      setTrackPoints((current) =>
        current.length && current[0].flightId !== point.flightId ? [point] : [...current, point]
      )
      if (point.phase === 'shutdown') reload()
    })
    return unsubscribe
  }, [])

  // Draw the planned route for whichever flight is active (or, once tracking ends, stays
  // showing the last one) — falls back to nothing if that flight has no stored OFP.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !active) return
    const flight = flights.find((f) => f.id === active.flightId)
    const route = flight ? parseRouteFromOfpJson(flight.ofpJson) : []
    const source = mapRef.current.getSource<GeoJSONSource>(ROUTE_SOURCE_ID)
    source?.setData(lineString(route))
    if (route.length > 1) {
      const bounds = route.reduce((b, coord) => b.extend(coord), new LngLatBounds(route[0], route[0]))
      mapRef.current.fitBounds(bounds, { padding: 40, duration: 0 })
    }
  }, [mapReady, active, flights])

  // Trail + marker follow the accumulated track points. The marker/camera animate across
  // the real gap between the last two samples rather than snapping — even at the tighter
  // 2s/5s climb/cruise intervals (see FlightRecorder.ts) a plain snap-to still reads as a
  // jump, so this stays regardless of how tight the recording interval is.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return

    const to = trackPoints[trackPoints.length - 1]
    if (!to || !markerRef.current) return
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
      mapRef.current.jumpTo({ center: [to.longitude, to.latitude], zoom: FOLLOW_ZOOM })
      return
    }

    const from = trackPoints[trackPoints.length - 2]
    if (!from) {
      source?.setData(lineString([...priorCoords, [to.longitude, to.latitude]]))
      markerRef.current.setLngLat([to.longitude, to.latitude])
      markerRef.current.setRotation(to.headingTrueDeg)
      mapRef.current.easeTo({ center: [to.longitude, to.latitude], duration: 500 })
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
    mapRef.current.easeTo({ center: [to.longitude, to.latitude], duration: durationMs })

    return () => cancelAnimationFrame(frame)
  }, [mapReady, trackPoints])

  async function handleStart(flightId: number): Promise<void> {
    setStarting(true)
    setError(null)
    try {
      await window.flightdeck.trackingStart(flightId)
      setActive(await window.flightdeck.trackingGetActive())
      setTrackPoints([])
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  async function handleStop(): Promise<void> {
    await window.flightdeck.trackingStop()
    setActive(null)
    await reload()
  }

  const plannedFlights = flights.filter((f) => f.status === 'planned')
  const activeFlight = active ? flights.find((f) => f.id === active.flightId) : undefined

  return (
    <div>
      <h1>Track</h1>

      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      {active ? (
        <p>
          Tracking {activeFlight?.flightNumber ?? `flight #${active.flightId}`} — phase:{' '}
          <strong>{active.phase}</strong>{' '}
          <button type="button" onClick={handleStop}>
            Stop tracking
          </button>
        </p>
      ) : plannedFlights.length === 0 ? (
        <p>No planned flights to track — dispatch one first.</p>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <span>Track:</span>
          {plannedFlights.map((f) => (
            <button key={f.id} type="button" disabled={starting} onClick={() => handleStart(f.id)}>
              {f.flightNumber ?? `${f.depIcao} → ${f.arrIcao}`} (
              {aircraft.find((a) => a.id === f.aircraftId)?.registration ?? f.aircraftId})
            </button>
          ))}
        </div>
      )}

      <div ref={mapContainerRef} style={{ width: '100%', height: '500px', border: '1px solid #ccc' }} />
    </div>
  )
}
