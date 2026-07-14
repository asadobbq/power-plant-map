import type { MapPort, MarkerItem, LineItem, MapBounds } from './adapter'

declare global {
  interface Window {
    naver: any
  }
}

function loadScript(keyId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.naver?.maps) return resolve()
    const s = document.createElement('script')
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${keyId}`
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('네이버 지도 스크립트 로드 실패'))
    document.head.appendChild(s)
  })
}

export class NaverMap implements MapPort {
  readonly kind = 'naver' as const
  private map: any = null
  private markers: any[] = []
  private lines: any[] = []

  constructor(private keyId: string) {}

  async mount(el: HTMLElement): Promise<void> {
    await loadScript(this.keyId)
    const { naver } = window
    this.map = new naver.maps.Map(el, {
      center: new naver.maps.LatLng(36.3, 127.8),
      zoom: 7,
      mapTypeControl: false,
      scaleControl: true,
    })
  }

  setMarkers(items: MarkerItem[], onClick: (id: string) => void): void {
    const { naver } = window
    this.markers.forEach(m => m.setMap(null))
    this.markers = items.map(it => {
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(it.lat, it.lng),
        map: this.map,
        title: it.title,
        icon: { content: it.html, anchor: new naver.maps.Point(0, 0) },
        zIndex: it.zIndex,
      })
      naver.maps.Event.addListener(marker, 'click', () => onClick(it.id))
      return marker
    })
  }

  setLines(lines: LineItem[]): void {
    const { naver } = window
    this.lines.forEach(l => l.setMap(null))
    this.lines = lines.map(
      ln =>
        new naver.maps.Polyline({
          map: this.map,
          path: [new naver.maps.LatLng(...ln.from), new naver.maps.LatLng(...ln.to)],
          strokeColor: ln.color,
          strokeWeight: 2.5,
          strokeStyle: 'shortdash',
          strokeOpacity: 0.9,
        }),
    )
  }

  panTo(lat: number, lng: number, zoom?: number): void {
    const { naver } = window
    const pos = new naver.maps.LatLng(lat, lng)
    if (zoom) this.map.morph(pos, zoom)
    else this.map.panTo(pos)
  }

  onZoomChange(cb: (zoom: number) => void): void {
    const { naver } = window
    naver.maps.Event.addListener(this.map, 'zoom_changed', (z: number) => cb(z))
  }

  onBoundsChange(cb: () => void): void {
    const { naver } = window
    naver.maps.Event.addListener(this.map, 'idle', cb)
    naver.maps.Event.addListener(this.map, 'bounds_changed', cb)
  }

  getBounds(): MapBounds | null {
    const b = this.map?.getBounds?.()
    if (!b) return null
    const sw = b.getMin ? b.getMin() : b.getSW()
    const ne = b.getMax ? b.getMax() : b.getNE()
    return { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() }
  }

  getZoom(): number {
    return this.map?.getZoom() ?? 7
  }

  resize(): void {
    const { naver } = window
    if (this.map) naver.maps.Event.trigger(this.map, 'resize')
  }

  destroy(): void {
    this.markers.forEach(m => m.setMap(null))
    this.lines.forEach(l => l.setMap(null))
    this.map?.destroy?.()
  }
}
