import type { Plant, NewsItem, OverseasItem } from '../types'
import { FUEL_COLORS, FUEL_ICONS, OS_COMPANY_COLORS, statusGroup, fuelLabel } from '../types'
import type { PanelTab } from '../App'
import BenefitPanel from './BenefitPanel'

interface Props {
  tab: PanelTab
  setTab: (t: PanelTab) => void
  plants: Plant[]
  searchActive: boolean
  search: string
  setSearch: (s: string) => void
  onSelect: (id: string) => void
  selectedId: string | null
  news: NewsItem[]
  plantsById: Map<string, Plant>
  onJump: (id: string) => void
  generatedAt: string
  sources: string[]
  overseas: OverseasItem[]
  overseasNote: string
  osCompany: string
  setOsCompany: (c: string) => void
  onOverseasSelect: (it: OverseasItem) => void
  onHandlePointerDown: (e: React.PointerEvent) => void
  onExpand: () => void
}

const COMPANY_COLORS = OS_COMPANY_COLORS

function stakeText(s?: string): string {
  if (!s || s === '미공개') return ''
  // 숫자(지분율)로 시작하면 '지분' 접두어, 아니면(미확인·O&M 등) 그대로
  return /^[\d약]/.test(s.trim()) ? '지분 ' + s : s
}

function osFuelIcon(fuel: string): string {
  if (/태양광|PV/i.test(fuel)) return '☀️'
  if (/수력|월류|댐/.test(fuel)) return '💧'
  if (/풍력/.test(fuel)) return '💨'
  if (/석탄|무연탄|CFB|유연탄/.test(fuel)) return '⚫'
  if (/가스|LNG|복합|화력/.test(fuel)) return '🔥'
  if (/ESS|배터리|저장/.test(fuel)) return '🔋'
  if (/중유|석유|유류/.test(fuel)) return '🛢️'
  if (/광산|선적|터미널/.test(fuel)) return '⛏️'
  return '⚡'
}

export default function BottomPanel(p: Props) {
  const { tab, setTab } = p
  const listed = [...p.plants].sort((a, b) => b.totalMw - a.totalMw).slice(0, 300)

  return (
    <div className="bpanel">
      {/* 드래그 핸들 */}
      <div className="bp-handle" onPointerDown={p.onHandlePointerDown} onClick={p.onExpand}>
        <div className="bp-grab" />
      </div>

      {/* 탭 바 */}
      <div className="bp-tabs">
        <button
          className={'bp-tab' + (tab === 'list' ? ' on' : '')}
          onClick={() => {
            setTab('list')
            p.onExpand()
          }}
        >
          <span className="bp-tab-ico">🗺️</span>
          <span className="bp-tab-lbl">발전소 목록</span>
        </button>
        <button
          className={'bp-tab' + (tab === 'benefit' ? ' on' : '')}
          onClick={() => {
            setTab('benefit')
            p.onExpand()
          }}
        >
          <span className="bp-tab-ico">🏠</span>
          <span className="bp-tab-lbl">우리동네 혜택</span>
        </button>
        <button
          className={'bp-tab' + (tab === 'news' ? ' on' : '')}
          onClick={() => {
            setTab('news')
            p.onExpand()
          }}
        >
          <span className="bp-tab-ico">📰</span>
          <span className="bp-tab-lbl">뉴스</span>
        </button>
        <button
          className={'bp-tab' + (tab === 'overseas' ? ' on' : '')}
          onClick={() => {
            setTab('overseas')
            p.onExpand()
          }}
        >
          <span className="bp-tab-ico">🌍</span>
          <span className="bp-tab-lbl">해외사업</span>
        </button>
      </div>

      <div className="bp-body">
        {tab === 'list' && (
          <>
            <input
              className="sb-search"
              placeholder="발전소명·지역·회사 검색 (전국)"
              value={p.search}
              onChange={e => p.setSearch(e.target.value)}
            />
            <div className="bp-count">
              {p.searchActive ? (
                <>검색 결과 {p.plants.length.toLocaleString()}곳</>
              ) : (
                <>현재 지도 화면 안 {p.plants.length.toLocaleString()}곳</>
              )}
            </div>
            <ul className="sb-list bp-list">
              {listed.map(pl => (
                <li
                  key={pl.id}
                  className={'sb-item' + (pl.id === p.selectedId ? ' sel' : '')}
                  onClick={() => p.onSelect(pl.id)}
                  onKeyDown={e => e.key === 'Enter' && p.onSelect(pl.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${pl.name} 상세 보기`}
                >
                  <span className="dot" style={{ background: FUEL_COLORS[pl.fuelCat] }} />
                  <div className="sb-item-main">
                    <div className="sb-item-name">
                      {FUEL_ICONS[pl.fuelCat]} {pl.name}
                      {statusGroup(pl) === '예정' && <em className="tag tag-planned">{pl.status}</em>}
                      {statusGroup(pl) === '폐지' && <em className="tag tag-retire">폐지</em>}
                      {pl.firstRetireYear && <em className="tag tag-retire">{pl.firstRetireYear} 폐지</em>}
                    </div>
                    <div className="sb-item-sub">
                      {fuelLabel(pl.fuelCat)} · {pl.totalMw.toLocaleString()}MW · {pl.address || '위치 미정'}
                    </div>
                  </div>
                </li>
              ))}
              {listed.length === 0 && (
                <li className="bp-empty">
                  {p.searchActive ? '검색 결과가 없습니다.' : '지도를 이동하거나 확대하면 이 지역 발전소가 표시됩니다.'}
                </li>
              )}
            </ul>
            <footer className="sb-foot">
              <div className="sb-disclaimer">
                본 서비스는 공공데이터를 재구성한 <b>비공식 안내 서비스</b>입니다. 혜택·지원금은 추정치이며
                법적 판정이 아닙니다.
              </div>
              <div>기준일 {p.generatedAt}</div>
              {p.sources.map((s, i) => (
                <div key={i} className="src">
                  · {s}
                </div>
              ))}
            </footer>
          </>
        )}

        {tab === 'benefit' && (
          <BenefitPanel plantsById={p.plantsById} onJump={p.onJump} embedded />
        )}

        {tab === 'news' && (
          <div className="bp-news">
            {p.news.length === 0 && <div className="bp-empty">뉴스가 없습니다.</div>}
            {p.news.map((n, i) => (
              <a key={i} className="news-item" href={n.url} target="_blank" rel="noreferrer">
                <span className="news-title">{n.title}</span>
                <small>
                  {n.source} · {n.date}
                  {n.tags.length > 0 && ' · ' + n.tags.slice(0, 3).join(', ')}
                </small>
              </a>
            ))}
          </div>
        )}

        {tab === 'overseas' && (
          <OverseasView
            items={p.overseas}
            note={p.overseasNote}
            company={p.osCompany}
            setCompany={p.setOsCompany}
            onSelect={p.onOverseasSelect}
          />
        )}
      </div>
    </div>
  )
}

function OverseasView({
  items,
  note,
  company,
  setCompany,
  onSelect,
}: {
  items: OverseasItem[]
  note: string
  company: string
  setCompany: (c: string) => void
  onSelect: (it: OverseasItem) => void
}) {
  const companies = ['전체', ...Object.keys(COMPANY_COLORS)]
  // items는 App에서 이미 회사 필터가 적용되어 넘어옴
  const filtered = items

  // 국가별 그룹 (용량 큰 순으로 국가 정렬)
  const byCountry = new Map<string, OverseasItem[]>()
  for (const it of filtered) {
    if (!byCountry.has(it.country)) byCountry.set(it.country, [])
    byCountry.get(it.country)!.push(it)
  }
  const countries = [...byCountry.entries()].sort(
    (a, b) =>
      b[1].reduce((s, x) => s + (x.mw || 0), 0) - a[1].reduce((s, x) => s + (x.mw || 0), 0),
  )
  const totalMw = filtered.reduce((s, x) => s + (x.mw || 0), 0)

  return (
    <div className="os">
      <div className="os-filter">
        {companies.map(c => (
          <button
            key={c}
            className={'os-chip' + (company === c ? ' on' : '')}
            style={{ '--c': COMPANY_COLORS[c] ?? '#475569' } as React.CSSProperties}
            onClick={() => setCompany(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="os-summary">
        {filtered.length}개 사업 · {countries.length}개국 · 합계 약 {Math.round(totalMw).toLocaleString()}MW
        <small> · 목록 클릭 시 위 지도 이동</small>
      </div>

      {countries.map(([country, list]) => (
        <div key={country} className="os-country">
          <div className="os-country-head">
            <b>{country}</b>
            <span>{list.length}건</span>
          </div>
          {list.map((it, i) => {
            const hasLoc = it.lat != null && it.lng != null
            return (
              <div
                key={i}
                className={'os-item' + (hasLoc ? ' os-locatable' : '')}
                onClick={() => hasLoc && onSelect(it)}
                role={hasLoc ? 'button' : undefined}
                tabIndex={hasLoc ? 0 : undefined}
              >
                <div className="os-item-top">
                  <span className="os-fuel">{osFuelIcon(it.fuel || '')}</span>
                  <span className="os-name">{it.name}</span>
                  {it.mw != null && <span className="os-mw">{it.mw.toLocaleString()}MW</span>}
                  {hasLoc && <span className="os-locicon" title="지도에서 위치 보기">📍</span>}
                </div>
                <div className="os-item-sub">
                  <span className="os-co" style={{ color: COMPANY_COLORS[it.companyGroup || ''] }}>
                    ● {it.companyGroup}
                  </span>
                  {it.fuel && ' · ' + it.fuel}
                  {it.status && ' · ' + it.status}
                  {stakeText(it.stake) && ' · ' + stakeText(it.stake)}
                  {it.city && ' · ' + it.city}
                  {it.source && (
                    <>
                      {' · '}
                      <a
                        href={it.source}
                        target="_blank"
                        rel="noreferrer"
                        className="os-src"
                        onClick={e => e.stopPropagation()}
                      >
                        출처
                      </a>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {note && <div className="os-note">{note}</div>}
    </div>
  )
}
