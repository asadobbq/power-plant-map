import type { MapPort, MarkerItem, LineItem, MapBounds } from './adapter'

declare global {
  interface Window {
    naver: any
    navermap_authFailure?: () => void
  }
}

// ---------- 인증 실패 감지 ----------
// 네이버 지도 SDK는 키 인증에 실패하면(키 폐기·도메인 미등록·이용 한도·결제 문제·상품 종료 등)
// 전역 함수 navermap_authFailure 를 호출하고 지도 대신 "인증 실패" 화면을 띄운다.
// 이 함수는 스크립트가 로드되기 '전에' 정의돼 있어야 하고, 호출 시점은 스크립트 로드·지도 생성
// 이후일 수도 있다(비동기 검증). 그래서 플래그와 구독자 목록으로 늦게 온 실패도 받는다.
// 2026.11.24 AI·NAVER API 지도 종료 같은 상품 변경 때 서비스가 빈 지도가 되지 않게 하는 장치.
let authFailed = false
const authListeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.navermap_authFailure = () => {
    authFailed = true
    authListeners.forEach(f => {
      try { f() } catch { /* 구독자 오류가 다른 구독자를 막지 않게 */ }
    })
  }
}

const LOAD_TIMEOUT_MS = 12000

function loadScript(keyId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.naver?.maps) return resolve()
    const s = document.createElement('script')
    // 네트워크 차단·CDN 장애로 onload/onerror 어느 쪽도 오지 않는 경우까지 대비
    const timer = setTimeout(() => reject(new Error('네이버 지도 스크립트 로드 시간 초과')), LOAD_TIMEOUT_MS)
    // ncpKeyId = NAVER Cloud 'Maps' 상품의 Application 키(신규 방식).
    // 구 AI·NAVER API의 ncpClientId 방식은 2026.11.24 18:00 종료.
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(keyId)}`
    s.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    s.onerror = () => {
      clearTimeout(timer)
      reject(new Error('네이버 지도 스크립트 로드 실패'))
    }
    document.head.appendChild(s)
  })
}

export class NaverMap implements MapPort {
  readonly kind = 'naver' as const
  private map: any = null
  private markers: any[] = []
  private lines: any[] = []

  constructor(private keyId: string) {}

  /** 키 인증이 이미 실패했는지 — mount 예외가 인증 실패 때문인지 구분할 때 쓴다 */
  get authFailed(): boolean {
    return authFailed
  }

  /** 인증 실패 시 호출될 콜백 등록. 이미 실패한 상태면 즉시 호출. */
  onAuthFailure(cb: () => void): void {
    if (authFailed) cb()
    else authListeners.add(cb)
  }

  async mount(el: HTMLElement): Promise<void> {
    await loadScript(this.keyId)
    const { naver } = window
    // 인증 실패 직후엔 SDK가 naver.maps를 비워 두기도 한다 — 그 상태로 Map을 만들면 TypeError
    if (!naver?.maps?.Map) throw new Error(authFailed ? '네이버 지도 인증 실패' : '네이버 지도 SDK 초기화 실패')
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
      // 호버 시 최상위로 올려 미리보기 카드가 다른 마커에 가리지 않게
      naver.maps.Event.addListener(marker, 'mouseover', () => marker.setZIndex(1000000))
      naver.maps.Event.addListener(marker, 'mouseout', () => marker.setZIndex(it.zIndex))
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
    if (zoom) {
      // morph는 대륙 간 원거리 이동에서 불안정 → setCenter+setZoom으로 확실히
      this.map.setCenter(pos)
      this.map.setZoom(zoom, true)
    } else {
      this.map.panTo(pos)
    }
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

  private spotlight: any = null
  setSpotlight(lat: number, lng: number, html: string): void {
    const { naver } = window
    this.clearSpotlight()
    this.spotlight = new naver.maps.Marker({
      position: new naver.maps.LatLng(lat, lng),
      map: this.map,
      icon: { content: html, anchor: new naver.maps.Point(0, 0) },
      zIndex: 2000000,
    })
  }

  clearSpotlight(): void {
    if (this.spotlight) {
      this.spotlight.setMap(null)
      this.spotlight = null
    }
  }

  destroy(): void {
    // 인증 실패 후 대체 지도로 교체할 때도 호출된다 — 그 시점엔 SDK 내부 상태가 깨져 있을 수 있어
    // 정리 실패가 교체 자체를 막지 않도록 각각 격리한다
    try { this.markers.forEach(m => m.setMap(null)) } catch { /* noop */ }
    try { this.lines.forEach(l => l.setMap(null)) } catch { /* noop */ }
    try { this.map?.destroy?.() } catch { /* noop */ }
    this.markers = []
    this.lines = []
    this.map = null
  }
}
