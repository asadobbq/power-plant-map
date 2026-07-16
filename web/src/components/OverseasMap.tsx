import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { OverseasItem } from '../types'
import { OS_COMPANY_COLORS } from '../types'

interface Props {
  items: OverseasItem[]
  selected: OverseasItem | null
  visible: boolean
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function stakeText(s?: string): string {
  if (!s || s === '미공개') return ''
  return /^[\d약]/.test(s.trim()) ? '지분 ' + s : s
}
function key(it: OverseasItem): string {
  return `${it.country}|${it.name}`
}

export default function OverseasMap({ items, selected, visible }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  // 지도 생성
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, {
      center: [20, 60],
      zoom: 2,
      worldCopyJump: true,
      attributionControl: false,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12 }).addTo(map)
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 100)
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 마커 갱신
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = new Map()
    for (const it of items) {
      if (it.lat == null || it.lng == null) continue
      const color = OS_COMPANY_COLORS[it.companyGroup || ''] ?? '#475569'
      const icon = L.divIcon({
        className: 'os-mk',
        html: `<div class="os-mk-dot" style="background:${color}"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      const m = L.marker([it.lat, it.lng], { icon }).addTo(map)
      const st = stakeText(it.stake)
      m.bindPopup(
        `<b>${esc(it.name)}</b><br>${esc(it.companyGroup || '')} · ${esc(it.country)}${it.mw != null ? ' · ' + it.mw.toLocaleString() + 'MW' : ''}${st ? ' · ' + esc(st) : ''}`,
      )
      markersRef.current.set(key(it), m)
    }
  }, [items])

  // 선택 항목으로 이동
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selected || selected.lat == null || selected.lng == null) return
    map.setView([selected.lat, selected.lng], 6, { animate: true })
    markersRef.current.get(key(selected))?.openPopup()
  }, [selected])

  // 탭 표시될 때 리사이즈(숨겨진 상태에서 생성되면 크기 0)
  useEffect(() => {
    if (visible) setTimeout(() => mapRef.current?.invalidateSize(), 80)
  }, [visible])

  return <div ref={elRef} className="os-fullmap" />
}
