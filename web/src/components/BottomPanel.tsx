import { useState } from 'react'
import type { Plant, NewsItem } from '../types'
import { FUEL_COLORS, FUEL_ICONS, statusGroup, fuelLabel } from '../types'
import BenefitPanel from './BenefitPanel'

type Tab = 'list' | 'benefit' | 'news'

interface Props {
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
  onHandlePointerDown: (e: React.PointerEvent) => void
  onExpand: () => void
}

export default function BottomPanel(p: Props) {
  const [tab, setTab] = useState<Tab>('list')
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
          🗺️ 발전소 목록
        </button>
        <button
          className={'bp-tab' + (tab === 'benefit' ? ' on' : '')}
          onClick={() => {
            setTab('benefit')
            p.onExpand()
          }}
        >
          🏠 우리동네 혜택
        </button>
        <button
          className={'bp-tab' + (tab === 'news' ? ' on' : '')}
          onClick={() => {
            setTab('news')
            p.onExpand()
          }}
        >
          📰 뉴스
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
      </div>
    </div>
  )
}
