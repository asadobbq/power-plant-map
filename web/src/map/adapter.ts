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

export interface MapPort {
  mount(el: HTMLElement): Promise<void>
  setMarkers(items: MarkerItem[], onClick: (id: string) => void): void
  setLines(lines: LineItem[]): void
  panTo(lat: number, lng: number, zoom?: number): void
  onZoomChange(cb: (zoom: number) => void): void
  getZoom(): number
  destroy(): void
  readonly kind: 'naver' | 'leaflet'
}

export async function createMap(): Promise<MapPort> {
  const key = import.meta.env.VITE_NCP_KEY_ID as string | undefined
  if (key) {
    const { NaverMap } = await import('./naverAdapter')
    return new NaverMap(key)
  }
  const { LeafletMap } = await import('./leafletAdapter')
  return new LeafletMap()
}
