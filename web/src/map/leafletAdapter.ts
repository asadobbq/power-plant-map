import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapPort, MarkerItem, LineItem, MapBounds } from './adapter'

/** 대체 지도 (OSM 타일).
 *  - 로컬 개발: VITE_NCP_KEY_ID 미설정 시 사용
 *  - 운영: 네이버 지도 스크립트 로드 실패·키 인증 실패 시 App이 자동으로 이 지도로 교체 */
export class LeafletMap implements MapPort {
  readonly kind = 'leaflet' as const
  private map: L.Map | null = null
  private markerLayer = L.layerGroup()
  private lineLayer = L.layerGroup()

  async mount(el: HTMLElement): Promise<void> {
    // 확대 버튼은 좌하단 — 기본 위치(좌상단)는 상단 필터줄과 겹친다
    this.map = L.map(el, { center: [36.3, 127.8], zoom: 7, zoomControl: false })
    L.control.zoom({ position: 'bottomleft' }).addTo(this.map)
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

  private spotlight: L.Marker | null = null
  setSpotlight(lat: number, lng: number, html: string): void {
    this.clearSpotlight()
    if (!this.map) return
    const icon = L.divIcon({ html, className: 'pp-divicon', iconSize: [0, 0] })
    this.spotlight = L.marker([lat, lng], { icon, zIndexOffset: 2000000 }).addTo(this.map)
  }

  clearSpotlight(): void {
    if (this.spotlight) {
      this.spotlight.remove()
      this.spotlight = null
    }
  }

  destroy(): void {
    this.map?.remove()
    this.map = null
  }
}
