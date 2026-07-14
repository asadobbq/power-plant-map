import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlantData, Plant, NewsData } from './types'
import { FUEL_COLORS, FUEL_ICONS, FUEL_ORDER, COMPANY_GROUPS, fmtMw, statusGroup, fuelLabel } from './types'
import type { MapPort, MarkerItem, LineItem } from './map/adapter'
import { createMap } from './map/adapter'
import Sidebar from './components/Sidebar'
import DetailPanel from './components/DetailPanel'
import BenefitPanel from './components/BenefitPanel'
import MapControls from './components/MapControls'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 같은 좌표에 겹친 발전소를 방사형으로 살짝 벌려 지도에서 구분 (예: 용인복합 3사) */
function offsetOverlapping(plants: Plant[]): { p: Plant; lat: number; lng: number }[] {
  const byCoord = new Map<string, Plant[]>()
  for (const p of plants) {
    const key = `${p.lat!.toFixed(4)},${p.lng!.toFixed(4)}`
    if (!byCoord.has(key)) byCoord.set(key, [])
    byCoord.get(key)!.push(p)
  }
  const out: { p: Plant; lat: number; lng: number }[] = []
  for (const group of byCoord.values()) {
    if (group.length === 1) {
      out.push({ p: group[0], lat: group[0].lat!, lng: group[0].lng! })
      continue
    }
    const n = group.length
    const R = 0.0125 // 약 1.4km
    const latRad = (group[0].lat! * Math.PI) / 180
    group.forEach((p, i) => {
      const ang = (2 * Math.PI * i) / n - Math.PI / 2
      out.push({
        p,
        lat: p.lat! + R * Math.sin(ang),
        lng: p.lng! + (R * Math.cos(ang)) / Math.max(0.2, Math.cos(latRad)),
      })
    })
  }
  return out
}

/** 개별 발전소 핀 (아이콘 + 용량 + 호버 미리보기 카드) */
function pinHtml(p: Plant): string {
  const color = FUEL_COLORS[p.fuelCat] ?? FUEL_COLORS['기타']
  const icon = FUEL_ICONS[p.fuelCat] ?? '⚡'
  const grp = statusGroup(p)
  const planned = grp === '예정'
  const retire = p.firstRetireYear
    ? `<span class="pin-badge">~'${String(p.firstRetireYear).slice(2)} 폐지</span>`
    : ''
  const plannedTag = planned ? `<span class="pin-badge planned">${esc(p.status)}</span>` : ''
  const retiredTag = grp === '폐지' ? `<span class="pin-badge retired">폐지</span>` : ''
  const est = p.mwEstimated ? '<small>(추정)</small>' : ''
  const card = `
    <div class="pin-card">
      <div class="pc-name">${esc(p.name)} <span class="pc-fuel" style="color:${color}">${icon} ${fuelLabel(p.fuelCat)}</span></div>
      <div class="pc-row"><b>${fmtMw(p.totalMw)}</b>${est} · ${esc(p.status)}${p.company ? ' · ' + esc(p.company) : ''}</div>
      <div class="pc-row dim">${esc(p.address || '위치 미정')}</div>
      ${p.gen ? `<div class="pc-row">${p.gen.year}년 발전량 ${Math.round(p.gen.gwh).toLocaleString()}GWh · 이용률 ${p.gen.cf}%</div>` : ''}
      ${p.firstRetireYear ? `<div class="pc-row warn">⏳ ${p.firstRetireYear}년부터 호기 폐지 시작</div>` : ''}
      ${p.planned ? `<div class="pc-row info">🏗 ${esc(p.planned.when)} 준공 예정</div>` : ''}
      <div class="pc-hint">클릭하면 호기별 상세</div>
    </div>`
  const cls = planned ? 'pin pin-planned' : grp === '폐지' ? 'pin pin-retired' : 'pin'
  return `<div class="${cls}" style="--c:${color}">
    <span class="pin-ico">${icon}</span><span class="pin-cap">${fmtMw(p.totalMw)}</span>
    ${retire}${plannedTag}${retiredTag}${card}
  </div>`
}

interface Cluster {
  id: string
  label: string
  lat: number
  lng: number
  count: number
  mw: number
  zoomTo: number
  top: Plant[]
}

/** 권역 클러스터 배지 (네이버부동산식 묶음 마커) */
function clusterHtml(c: Cluster): string {
  const list = c.top
    .map(p => `<div class="pc-row">${FUEL_ICONS[p.fuelCat]} ${esc(p.name)} <b>${fmtMw(p.totalMw)}</b></div>`)
    .join('')
  const more = c.count > c.top.length ? `<div class="pc-row dim">외 ${c.count - c.top.length}곳…</div>` : ''
  return `<div class="clu">
    <b>${esc(c.label)}</b><span>${c.count}기 · ${fmtMw(c.mw)}</span>
    <div class="pin-card"><div class="pc-name">${esc(c.label)} 발전설비</div>${list}${more}
    <div class="pc-hint">클릭하면 확대</div></div>
  </div>`
}

export default function App() {
  const [data, setData] = useState<PlantData | null>(null)
  const [news, setNews] = useState<NewsData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fuels, setFuels] = useState<Set<string>>(new Set(FUEL_ORDER))
  const [companies, setCompanies] = useState<Set<string>>(new Set(COMPANY_GROUPS))
  const [statuses, setStatuses] = useState<Set<string>>(new Set(['운영중', '예정', '폐지']))
  const [showSmall, setShowSmall] = useState(false)
  const [search, setSearch] = useState('')
  const [mapKind, setMapKind] = useState<'naver' | 'leaflet' | null>(null)
  const [benefitOpen, setBenefitOpen] = useState(false)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [zoom, setZoom] = useState(7)
  const mapRef = useRef<MapPort | null>(null)
  const mapElRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('data/plants.json')
      .then(r => r.json())
      .then(setData)
      .catch(e => console.error('데이터 로드 실패', e))
    fetch('data/news.json')
      .then(r => r.json())
      .then(setNews)
      .catch(() => setNews(null))
  }, [])

  useEffect(() => {
    let disposed = false
    if (!mapElRef.current) return
    createMap().then(async port => {
      if (disposed) return
      await port.mount(mapElRef.current!)
      port.onZoomChange(setZoom)
      mapRef.current = port
      setMapKind(port.kind)
      setZoom(port.getZoom())
    })
    return () => {
      disposed = true
      mapRef.current?.destroy()
      mapRef.current = null
    }
  }, [])

  const visible = useMemo(() => {
    if (!data) return []
    const q = search.trim()
    return data.plants.filter(p => {
      if (!fuels.has(p.fuelCat)) return false
      if (!companies.has(p.companyGroup)) return false
      if (!statuses.has(statusGroup(p))) return false
      if (!showSmall && p.totalMw < 10 && statusGroup(p) === '운영중') return false
      if (q && !(p.name.includes(q) || p.address.includes(q) || p.company.includes(q))) return false
      return true
    })
  }, [data, fuels, companies, statuses, showSmall, search])

  const selected = useMemo(
    () => (data && selectedId ? data.plants.find(p => p.id === selectedId) ?? null : null),
    [data, selectedId],
  )

  // 줌 레벨별 마커: <8 시도 묶음, 8~9 시군구 묶음, ≥10 개별 (네이버부동산 방식)
  const level: 'sido' | 'sigungu' | 'plant' = zoom < 8 ? 'sido' : zoom < 10 ? 'sigungu' : 'plant'

  const clusters = useMemo<Cluster[]>(() => {
    if (level === 'plant') return []
    const groups = new Map<string, Plant[]>()
    for (const p of visible) {
      if (p.lat == null || p.lng == null) continue
      const sido = p.sido || p.address.split(' ')[0] || '기타'
      const key = level === 'sido' ? sido : `${sido} ${p.sigungu || p.address.split(' ')[1] || ''}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    return [...groups.entries()].map(([key, ps]) => {
      const mw = ps.reduce((s, p) => s + p.totalMw, 0) || 1
      return {
        id: 'c|' + key,
        label: key,
        lat: ps.reduce((s, p) => s + p.lat! * p.totalMw, 0) / mw || ps[0].lat!,
        lng: ps.reduce((s, p) => s + p.lng! * p.totalMw, 0) / mw || ps[0].lng!,
        count: ps.length,
        mw,
        zoomTo: level === 'sido' ? 9 : 11,
        top: [...ps].sort((a, b) => b.totalMw - a.totalMw).slice(0, 5),
      }
    })
  }, [visible, level])

  // 마커 갱신
  useEffect(() => {
    const port = mapRef.current
    if (!port || !mapKind) return
    let items: MarkerItem[]
    if (level === 'plant') {
      items = offsetOverlapping(visible.filter(p => p.lat != null && p.lng != null)).map(
        ({ p, lat, lng }) => ({
          id: p.id,
          lat,
          lng,
          html: pinHtml(p),
          zIndex: Math.round(p.totalMw),
          title: '',
        }),
      )
    } else {
      items = clusters.map(c => ({
        id: c.id,
        lat: c.lat,
        lng: c.lng,
        html: clusterHtml(c),
        zIndex: Math.round(c.mw),
        title: '',
      }))
    }
    port.setMarkers(items, handleMarkerClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, clusters, level, mapKind])

  // 선택된 발전소의 폐지→대체 연결선
  useEffect(() => {
    const port = mapRef.current
    if (!port || !data || !mapKind) return
    if (!selected) {
      port.setLines([])
      return
    }
    const idx = new Map(data.plants.map(p => [p.id, p]))
    const lines: LineItem[] = data.links
      .filter(l => l.from === selected.id || l.to === selected.id)
      .map(l => {
        const a = idx.get(l.from)!
        const b = idx.get(l.to)!
        return {
          id: `${l.from}-${l.to}-${l.fromUnit}`,
          from: [a.lat!, a.lng!] as [number, number],
          to: [b.lat!, b.lng!] as [number, number],
          color: '#ef4444',
          label: `${l.fromUnit} → ${l.toName} (${l.planned || '시기 미정'})`,
        }
      })
    port.setLines(lines)
  }, [selected, data, mapKind])

  function handleMarkerClick(id: string) {
    if (id.startsWith('c|')) {
      const c = clustersRef.current.find(x => x.id === id)
      if (c) mapRef.current?.panTo(c.lat, c.lng, c.zoomTo)
      return
    }
    setSelectedId(id)
  }
  const clustersRef = useRef<Cluster[]>([])
  clustersRef.current = clusters

  const handleSelect = (id: string) => {
    setSelectedId(id)
    const p = data?.plants.find(x => x.id === id)
    if (p?.lat && p?.lng) mapRef.current?.panTo(p.lat, p.lng, 11)
  }

  return (
    <div className={'app' + (panelCollapsed ? ' panel-collapsed' : '')}>
      <Sidebar
        plants={visible}
        total={data?.plants.length ?? 0}
        fuels={fuels}
        setFuels={setFuels}
        companies={companies}
        setCompanies={setCompanies}
        statuses={statuses}
        setStatuses={setStatuses}
        showSmall={showSmall}
        setShowSmall={setShowSmall}
        search={search}
        setSearch={setSearch}
        onSelect={handleSelect}
        selectedId={selectedId}
        sources={data?.sources ?? []}
        generatedAt={data?.generatedAt ?? ''}
        news={news?.items ?? []}
        onBenefitOpen={() => setBenefitOpen(true)}
        onCollapse={() => setPanelCollapsed(true)}
      />
      <div className="map-wrap">
        <div ref={mapElRef} className="map" />
        <MapControls
          fuels={fuels}
          setFuels={setFuels}
          companies={companies}
          setCompanies={setCompanies}
          statuses={statuses}
          setStatuses={setStatuses}
          showSmall={showSmall}
          setShowSmall={setShowSmall}
          count={visible.length}
          total={data?.plants.length ?? 0}
          panelCollapsed={panelCollapsed}
          onTogglePanel={() => setPanelCollapsed(c => !c)}
        />
        {mapKind === 'leaflet' && (
          <div className="map-banner">
            개발용 지도(OSM)로 표시 중 — <b>네이버 지도 키(VITE_NCP_KEY_ID)</b> 설정 시 자동 전환됩니다
          </div>
        )}
        {benefitOpen && (
          <BenefitPanel
            plantsById={new Map((data?.plants ?? []).map(p => [p.id, p]))}
            onJump={id => {
              setBenefitOpen(false)
              handleSelect(id)
            }}
            onClose={() => setBenefitOpen(false)}
          />
        )}
        {selected && !benefitOpen && (
          <DetailPanel
            plant={selected}
            links={data?.links.filter(l => l.from === selected.id || l.to === selected.id) ?? []}
            news={(news?.items ?? []).filter(n => n.tags.includes(selected.name))}
            plantsById={new Map((data?.plants ?? []).map(p => [p.id, p]))}
            onClose={() => setSelectedId(null)}
            onJump={handleSelect}
          />
        )}
      </div>
    </div>
  )
}
