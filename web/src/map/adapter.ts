export interface MarkerItem {
  id: string
  lat: number
  lng: number
  html: string
  zIndex: number
  title: string
}

export interface LineItem {
  id: string
  from: [number, number]
  to: [number, number]
  color: string
  label?: string
}

export interface MapBounds {
  swLat: number
  swLng: number
  neLat: number
  neLng: number
}

export interface MapPort {
  mount(el: HTMLElement): Promise<void>
  setMarkers(items: MarkerItem[], onClick: (id: string) => void): void
  setLines(lines: LineItem[]): void
  panTo(lat: number, lng: number, zoom?: number): void
  onZoomChange(cb: (zoom: number) => void): void
  onBoundsChange(cb: () => void): void
  getBounds(): MapBounds | null
  getZoom(): number
  resize(): void
  setSpotlight(lat: number, lng: number, html: string): void
  clearSpotlight(): void
  destroy(): void
  readonly kind: 'naver' | 'leaflet'
  /** 키 인증 실패 시 콜백(네이버 전용). 늦게 도착하는 실패도 전달된다. */
  onAuthFailure?(cb: () => void): void
  /** 이미 인증에 실패했는지(네이버 전용) */
  readonly authFailed?: boolean
}

/**
 * 대체 지도로 표시하게 된 이유
 * - nokey: 키 미설정(로컬 개발)
 * - load: 네이버 SDK 스크립트 로드 실패·시간 초과(네트워크·CDN 장애)
 * - auth: 네이버 키 인증 실패(키 폐기·도메인 미등록·한도·결제·상품 종료)
 */
export type MapFallbackReason = 'nokey' | 'load' | 'auth'

export async function createMap(): Promise<MapPort> {
  const key = (import.meta.env.VITE_NCP_KEY_ID as string | undefined)?.trim()
  if (key) {
    const { NaverMap } = await import('./naverAdapter')
    return new NaverMap(key)
  }
  return createFallbackMap()
}

/** OSM 타일 기반 대체 지도. 네이버 지도를 쓸 수 없을 때 서비스가 빈 화면이 되지 않게 한다. */
export async function createFallbackMap(): Promise<MapPort> {
  const { LeafletMap } = await import('./leafletAdapter')
  return new LeafletMap()
}
