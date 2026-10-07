import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Friend } from '../lib/types'
import { formatCoords, formatRelative } from '../lib/format'

interface MapViewProps {
  self: { lat: number; lng: number; name: string } | null
  selfSharing: boolean
  friends: Friend[]
  now: number
  /** Increment to make the map fly to the user's own marker. */
  focusSignal: number
}

const DEFAULT_CENTER: L.LatLngExpression = [25, 5]
const DEFAULT_ZOOM = 3

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function selfIcon(sharing: boolean): L.DivIcon {
  return L.divIcon({
    className: 'marker',
    html: `<div class="marker__self${sharing ? '' : ' is-paused'}"><span class="marker__self-core"></span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
}

function friendIcon(friend: Friend): L.DivIcon {
  return L.divIcon({
    className: 'marker',
    html: `<div class="marker__friend"><span>${escapeHtml(initials(friend.name))}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  })
}

function selfPopup(self: { lat: number; lng: number; name: string }): string {
  return `<div class="popup">
    <div class="popup__name">${escapeHtml(self.name)}<span class="popup__you">you</span></div>
    <div class="popup__meta"><span class="popup__coords">${escapeHtml(formatCoords(self.lat, self.lng))}</span></div>
  </div>`
}

function friendPopup(friend: Friend, now: number): string {
  return `<div class="popup">
    <div class="popup__name">${escapeHtml(friend.name)}</div>
    <div class="popup__meta">
      <span>Updated ${escapeHtml(formatRelative(friend.updatedAt, now))}</span>
      <span class="popup__coords">${escapeHtml(formatCoords(friend.lat, friend.lng))}</span>
    </div>
  </div>`
}

export function MapView({ self, selfSharing, friends, now, focusSignal }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const selfMarkerRef = useRef<L.Marker | null>(null)
  const friendMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const hasCenteredRef = useRef(false)

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      worldCopyJump: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map

    const resizeObserver = new ResizeObserver(() => map.invalidateSize())
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      selfMarkerRef.current = null
      friendMarkersRef.current.clear()
    }
  }, [])

  // Own marker.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!self) {
      if (selfMarkerRef.current) {
        selfMarkerRef.current.remove()
        selfMarkerRef.current = null
      }
      return
    }

    const latlng: L.LatLngExpression = [self.lat, self.lng]
    if (!selfMarkerRef.current) {
      const marker = L.marker(latlng, { icon: selfIcon(selfSharing), zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(selfPopup(self))
      selfMarkerRef.current = marker
    } else {
      selfMarkerRef.current.setLatLng(latlng)
      selfMarkerRef.current.setIcon(selfIcon(selfSharing))
      selfMarkerRef.current.setPopupContent(selfPopup(self))
    }

    if (!hasCenteredRef.current) {
      hasCenteredRef.current = true
      map.setView(latlng, 15)
    }
  }, [self, selfSharing])

  // Friend markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const markers = friendMarkersRef.current
    const seen = new Set<string>()

    for (const friend of friends) {
      seen.add(friend.id)
      const latlng: L.LatLngExpression = [friend.lat, friend.lng]
      let marker = markers.get(friend.id)
      if (!marker) {
        marker = L.marker(latlng, { icon: friendIcon(friend) }).addTo(map)
        marker.bindPopup('')
        markers.set(friend.id, marker)
      } else {
        marker.setLatLng(latlng)
        marker.setIcon(friendIcon(friend))
      }
      marker.setPopupContent(friendPopup(friend, now))
    }

    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    }
  }, [friends, now])

  // Fly to the user's own marker when asked from the control panel.
  useEffect(() => {
    const map = mapRef.current
    if (!map || focusSignal === 0 || !self) return
    const target = L.latLng(self.lat, self.lng)
    map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.8 })
    // Deliberately only reacts to focusSignal changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal])

  return <div className="map" ref={containerRef} role="application" aria-label="Live map of friends" />
}
