import type { Plant, NewsItem } from '../types'
import { FUEL_COLORS, FUEL_ICONS, FUEL_ORDER, COMPANY_GROUPS, statusGroup, fuelLabel } from '../types'

interface Props {
  plants: Plant[]
  total: number
  fuels: Set<string>
  setFuels: (s: Set<string>) => void
  companies: Set<string>
  setCompanies: (s: Set<string>) => void
  statuses: Set<string>
  setStatuses: (s: Set<string>) => void
  showSmall: boolean
  setShowSmall: (b: boolean) => void
  search: string
  setSearch: (s: string) => void
  onSelect: (id: string) => void
  selectedId: string | null
  sources: string[]
  generatedAt: string
  news: NewsItem[]
  onBenefitOpen: () => void
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

export default function Sidebar(p: Props) {
  const listed = [...p.plants].sort((a, b) => b.totalMw - a.totalMw).slice(0, 200)
  return (
    <aside className="sidebar">
      <header className="sb-head">
        <h1>우리동네 발전소</h1>
        <p className="sb-sub">전국 발전소의 현재와 미래 — 운영·건설·폐지 현황 (11차 전력수급기본계획 반영)</p>
      </header>

      <button className="bf-open" onClick={p.onBenefitOpen}>
        🏠 우리 동네 발전소 혜택 확인 — 전기요금 보조·장학금
      </button>

      <input
        className="sb-search"
        placeholder="발전소명·지역·회사 검색"
        value={p.search}
        onChange={e => p.setSearch(e.target.value)}
      />

      <div className="sb-section">
        <div className="sb-label-row">
          <span className="sb-label">연료원</span>
          <span>
            <button className="sb-mini" onClick={() => p.setFuels(new Set(FUEL_ORDER))}>전체선택</button>
            <button className="sb-mini" onClick={() => p.setFuels(new Set())}>해제</button>
          </span>
        </div>
        <div className="chips">
          {FUEL_ORDER.map(f => (
            <button
              key={f}
              className={'chip' + (p.fuels.has(f) ? ' on' : '')}
              style={{ '--c': FUEL_COLORS[f] } as React.CSSProperties}
              onClick={() => p.setFuels(toggle(p.fuels, f))}
            >
              {FUEL_ICONS[f]} {fuelLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-label-row">
          <span className="sb-label">회사</span>
          <span>
            <button className="sb-mini" onClick={() => p.setCompanies(new Set(COMPANY_GROUPS))}>전체선택</button>
            <button className="sb-mini" onClick={() => p.setCompanies(new Set())}>해제</button>
          </span>
        </div>
        <div className="chips">
          {COMPANY_GROUPS.map(c => (
            <button
              key={c}
              className={'chip' + (p.companies.has(c) ? ' on' : '')}
              style={{ '--c': '#475569' } as React.CSSProperties}
              onClick={() => p.setCompanies(toggle(p.companies, c))}
            >
              <span className="dot" />
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-label">상태</div>
        <div className="chips">
          {(['운영중', '예정', '폐지'] as const).map(s => (
            <button
              key={s}
              className={'chip' + (p.statuses.has(s) ? ' on' : '')}
              style={{ '--c': s === '운영중' ? '#10b981' : s === '예정' ? '#f97316' : '#6b7280' } as React.CSSProperties}
              onClick={() => p.setStatuses(toggle(p.statuses, s))}
            >
              <span className="dot" />
              {s === '예정' ? '건설·계획' : s === '폐지' ? '폐지완료' : s}
            </button>
          ))}
          <label className="chip small-toggle">
            <input type="checkbox" checked={p.showSmall} onChange={e => p.setShowSmall(e.target.checked)} />
            10MW 미만 표시
          </label>
        </div>
      </div>

      <div className="sb-count">
        {p.plants.length}개 표시 / 전체 {p.total}개
      </div>

      <ul className="sb-list">
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
                {pl.name}
                {statusGroup(pl) === '예정' && <em className="tag tag-planned">{pl.status}</em>}
                {pl.firstRetireYear && <em className="tag tag-retire">{pl.firstRetireYear} 폐지 시작</em>}
              </div>
              <div className="sb-item-sub">
                {fuelLabel(pl.fuelCat)} · {pl.totalMw.toLocaleString()}MW · {pl.address || '위치 미정'}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {p.news.length > 0 && (
        <details className="sb-news">
          <summary>📰 전력산업 주요 뉴스 ({p.news.length})</summary>
          {p.news.map((n, i) => (
            <a key={i} className="news-item" href={n.url} target="_blank" rel="noreferrer">
              <span className="news-title">{n.title}</span>
              <small>
                {n.source} · {n.date}
              </small>
            </a>
          ))}
        </details>
      )}

      <footer className="sb-foot">
        <div className="sb-disclaimer">
          본 서비스는 공공데이터를 재구성한 <b>비공식 안내 서비스</b>입니다. 혜택·지원금은 추정치이며
          법적 판정이 아닙니다. 정확한 정보는 관할 지자체·발전사·전력거래소 공식 자료를 확인하세요.
        </div>
        <div>기준일 {p.generatedAt}</div>
        {p.sources.map((s, i) => (
          <div key={i} className="src">
            · {s}
          </div>
        ))}
      </footer>
    </aside>
  )
}
