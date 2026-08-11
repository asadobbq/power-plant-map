import type { Plant, NewsItem, OverseasItem, JobsData, HrData, HrCompany } from '../types'
import {
  FUEL_COLORS, FUEL_ICONS, OS_COMPANY_COLORS, JOB_COMPANY_COLORS,
  statusGroup, fuelLabel, safeUrl,
} from '../types'
import type { PanelTab } from '../App'
import { analyticsEnabled, track, trackOutbound } from '../analytics'
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
  jobs: JobsData | null
  hr: HrData | null
  jobsCompany: string
  setJobsCompany: (c: string) => void
  issueStats: { coalRetireUnits: number; replaceLinks: number; depopRegions: number | null } | null
  osCompany: string
  setOsCompany: (c: string) => void
  onOverseasSelect: (it: OverseasItem) => void
  onHandlePointerDown: (e: React.PointerEvent) => void
  onExpand: () => void
  onInfo: () => void
}

const COMPANY_COLORS = OS_COMPANY_COLORS

/** 소통 게시판 (익명 작성 가능, 개인정보 미수집) */
export const FEEDBACK_URL = '/board/'

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
        <a
          className="bp-info bp-feedback"
          href={FEEDBACK_URL}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            track('feedback_open')
          }}
          aria-label="소통 게시판"
        >
          💬 의견
        </a>
        <button
          className="bp-info"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            p.onInfo()
          }}
          aria-label="데이터 출처·유의사항"
        >
          ⓘ 출처·면책
        </button>
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
          <span className="bp-tab-lbl">발전소</span>
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
          className={'bp-tab' + (tab === 'jobs' ? ' on' : '')}
          onClick={() => {
            setTab('jobs')
            p.onExpand()
          }}
        >
          <span className="bp-tab-ico">💼</span>
          <span className="bp-tab-lbl">일자리</span>
        </button>
        <button
          className={'bp-tab' + (tab === 'benefit' ? ' on' : '')}
          onClick={() => {
            setTab('benefit')
            p.onExpand()
          }}
        >
          <span className="bp-tab-ico">🏠</span>
          <span className="bp-tab-lbl">동네 혜택</span>
        </button>
      </div>

      <div className="bp-body">
        {tab === 'list' && (
          <>
            {p.issueStats && !p.searchActive && (
              <div className="bp-issues" aria-label="기후 전환과 지역 소멸 현안 요약">
                <div className="bp-issue">
                  <b>{p.issueStats.coalRetireUnits}기</b>
                  <span>석탄 호기 폐지 예정 (~2038)</span>
                </div>
                <div className="bp-issue">
                  <b>{p.issueStats.replaceLinks}건</b>
                  <span>폐지 → 대체 건설 연결</span>
                </div>
                {p.issueStats.depopRegions != null && (
                  <div className="bp-issue">
                    <b>{p.issueStats.depopRegions}곳</b>
                    <span>발전소 소재 인구감소지역</span>
                  </div>
                )}
              </div>
            )}
            <input
              className="sb-search"
              placeholder="발전소명·지역·회사 검색 (전국)"
              value={p.search}
              onChange={e => p.setSearch(e.target.value)}
              aria-label="발전소명·지역·회사 검색"
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
              {analyticsEnabled && (
                <div className="sb-disclaimer">
                  서비스 개선을 위해 Google Analytics로 방문·이용 통계를 익명 수집합니다(개인 식별 정보
                  없음). 수집을 원치 않으면 브라우저 광고/추적 차단 기능을 사용하실 수 있습니다.
                </div>
              )}
              <div>
                기준일 {p.generatedAt} · <a href="/plant/">발전소별 상세 페이지</a> ·{' '}
                <a href="/region/">지역별 혜택 페이지</a>
              </div>
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
              <a key={i} className="news-item" href={safeUrl(n.url)} target="_blank" rel="noreferrer">
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

        {tab === 'jobs' && (
          <JobsView jobs={p.jobs} hr={p.hr} company={p.jobsCompany} setCompany={p.setJobsCompany} />
        )}
      </div>
    </div>
  )
}

/** 만원 단위 표시 (입력: 천원) */
function pay(thousandWon?: number | null): string {
  if (thousandWon == null) return '—'
  return Math.round(thousandWon / 10).toLocaleString() + '만원'
}

function JobsView({
  jobs, hr, company, setCompany,
}: {
  jobs: JobsData | null
  hr: HrData | null
  company: string
  setCompany: (c: string) => void
}) {
  const items = jobs?.items ?? []
  const present = [...new Set(items.map(i => i.company))]
  const chips = ['전체', ...Object.keys(JOB_COMPANY_COLORS).filter(c => present.includes(c))]
  // 상세 카드에서 진입한 회사가 현재 공고 0건이어도 선택 칩은 보이게
  if (company !== '전체' && !chips.includes(company)) chips.push(company)
  const filtered = company === '전체' ? items : items.filter(i => i.company === company)

  return (
    <div className="jb">
      <div className="os-filter">
        {chips.map(c => (
          <button
            key={c}
            className={'os-chip' + (company === c ? ' on' : '')}
            style={{ '--c': JOB_COMPANY_COLORS[c] ?? '#475569' } as React.CSSProperties}
            onClick={() => setCompany(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="os-summary">
        진행 중 채용공고 {filtered.length}건
        {jobs?.updatedAt && <small> · {jobs.updatedAt} 갱신 · 매일 자동 수집</small>}
      </div>

      {items.length === 0 && <div className="bp-empty">진행 중인 채용공고 정보를 불러오지 못했습니다.</div>}
      {filtered.map(j => (
        <a
          key={j.sn ?? j.url}
          className="jb-item"
          href={safeUrl(j.url)}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackOutbound(j.url)}
        >
          <div className="jb-top">
            <span className="jb-co" style={{ color: JOB_COMPANY_COLORS[j.company] }}>
              ● {j.company}
            </span>
            {j.dday != null && (
              <span className={'jb-dday' + (j.dday <= 3 ? ' soon' : '')}>
                {j.dday === 0 ? '오늘 마감' : `D-${j.dday}`}
              </span>
            )}
          </div>
          <div className="jb-title">{j.title}</div>
          <div className="jb-sub">
            {j.kind}
            {j.hire && ' · ' + j.hire}
            {j.region && ' · ' + j.region}
            {j.end && ` · ~${j.end.slice(5)}`}
            {j.count != null && j.count > 0 && ` · ${j.count}명`}
          </div>
        </a>
      ))}

      {hr && hr.companies.length > 0 && (
        <>
          <div className="jb-hr-head">
            기관별 보수·인원 <small>알리오 정기공시 기준</small>
          </div>
          <div className="jb-hr-grid">
            {hr.companies.map(c => (
              <HrCard key={c.name} c={c} />
            ))}
          </div>
        </>
      )}

      <div className="os-note">
        발전 공공기관은 <b>본사이전 지역인재 30%</b>(혁신도시법)·<b>비수도권 인재 35%</b>(지방대육성법)
        채용목표제를 운영합니다(대졸 신입 공채 기준 — 공고별 적용 여부는 원문 확인). 보수는 알리오
        공시(결산·예산 기준) 수치로 실제 개인별 보수와 다를 수 있으며, 채용 자격·일정 등 확정 정보는
        반드시 원문 공고를 확인하세요.
      </div>
    </div>
  )
}

function HrCard({ c }: { c: HrCompany }) {
  const latest = [...c.avgPay].filter(x => x.kind === '결산').sort((a, b) => b.year - a.year)[0]
  return (
    <div className="jb-hr-card">
      <div className="jb-hr-name" style={{ color: JOB_COMPANY_COLORS[c.name] }}>
        ● {c.name} <small>{c.hq}</small>
      </div>
      <div className="jb-hr-row">
        <span>평균보수{latest ? `('${String(latest.year).slice(2)} 결산)` : ''}</span>
        <b>{pay(latest?.amount)}</b>
      </div>
      <div className="jb-hr-row">
        <span>신입 초임('25)</span>
        <b>{pay(c.newHire2025)}</b>
      </div>
      <div className="jb-hr-row">
        <span>정규직 현원</span>
        <b>{c.employees?.regular != null ? Math.round(c.employees.regular).toLocaleString() + '명' : '—'}</b>
      </div>
      {c.alioUrl && (
        <a
          className="os-src jb-hr-src"
          href={safeUrl(c.alioUrl)}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackOutbound(c.alioUrl!)}
        >
          알리오 공시 보기
        </a>
      )}
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
                        href={safeUrl(it.source)}
                        target="_blank"
                        rel="noreferrer"
                        className="os-src"
                        onClick={e => {
                          e.stopPropagation()
                          trackOutbound(it.source!)
                        }}
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
