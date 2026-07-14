import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapPort, MarkerItem, LineItem, MapBounds } from './adapter'

/** 개발·검증용 폴백 지도 (OSM 타일). VITE_NCP_KEY_ID 설정 시 네이버 지도로 자동 전환. */
export class LeafletMap implements MapPort {
  readonly kind = 'leaflet' as const
  private map: L.Map | null = null
  private markerLayer = L.layerGroup()
  private lineLayer = L.layerGroup()

  async mount(el: HTMLElement): Promise<void> {
    this.map = L.map(el, { center: [36.3, 127.8], zoom: 7, zoomControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map)
    this.markerLayer.addTo(this.map)
    this.lineLayer.addTo(this.map)
  }

  setMarkers(items: MarkerItem[], onClick: (id: string) => void): void {
    this.markerLayer.clearLayers()
    for (const it of items) {
      const icon = L.divIcon({ html: it.html, className: 'pp-divicon', iconSize: [0, 0] })
      const m = L.marker([it.lat, it.lng], { icon, title: it.title, zIndexOffset: it.zIndex })
      m.on('click', () => onClick(it.id))
      m.on('mouseover', () => m.setZIndexOffset(1000000))
      m.on('mouseout', () => m.setZIndexOffset(it.zIndex))
      this.markerLayer.addLayer(m)
    }
  }

  setLines(lines: LineItem[]): void {
    this.lineLayer.clearLayers()
    for (const ln of lines) {
      const pl = L.polyline([ln.from, ln.to], {
        color: ln.color,
        weight: 2.5,
        dashArray: '6 6',
        opacity: 0.9,
      })
      if (ln.label) pl.bindTooltip(ln.label)
      this.lineLayer.addLayer(pl)
    }
  }

  panTo(lat: number, lng: number, zoom?: number): void {
    if (!this.map) return
    if (zoom) this.map.setView([lat, lng], zoom, { animate: true })
    else this.map.panTo([lat, lng])
  }

  onZoomChange(cb: (zoom: number) => void): void {
    this.map?.on('zoomend', () => cb(this.map!.getZoom()))
  }

  onBoundsChange(cb: () => void): void {
    this.map?.on('moveend', cb)
  }

  getBounds(): MapBounds | null {
    if (!this.map) return null
    const b = this.map.getBounds()
    const sw = b.getSouthWest()
    const ne = b.getNorthEast()
    return { swLat: sw.lat, swLng: sw.lng, neLat: ne.lat, neLng: ne.lng }
  }

  getZoom(): number {
    return this.map?.getZoom() ?? 7
  }

  resize(): void {
    this.map?.invalidateSize()
  }

  destroy(): void {
    this.map?.remove()
    this.map = null
  }
}
