import { useEffect, useMemo, useState } from 'react'
import type { Plant } from '../types'
import { FUEL_ICONS, fuelLabel, safeUrl } from '../types'
import { track, trackOutbound } from '../analytics'

interface ZonePlant {
  id: string
  name: string
  fuelCat: string
  mw: number
  status: string
  distKm: number
  approx: boolean
}

interface BenefitData {
  generatedAt: string
  note: string
  tree: Record<string, Record<string, [string, string][]>>
  zones: Record<string, ZonePlant[]>
}

/** 지자체 전입·정착 지원 시책 (발전소 소재 시군구, 지자체 공식 홈페이지 조사) */
interface LocalProgram {
  category: '전입정착' | '출산육아' | '주거' | '청년일자리' | '기타'
  name: string
  amount: string
  condition?: string
  source: string
}
interface LocalRegion {
  sido: string
  sigungu: string
  depopulation: boolean
  programs: LocalProgram[]
}
interface LocalData {
  updatedAt: string
  note?: string
  regions: LocalRegion[]
}

const LOCAL_CAT_ORDER: LocalProgram['category'][] = ['전입정착', '출산육아', '주거', '청년일자리', '기타']
const LOCAL_CAT_ICONS: Record<LocalProgram['category'], string> = {
  전입정착: '🧳',
  출산육아: '👶',
  주거: '🏠',
  청년일자리: '💼',
  기타: '✨',
}

interface Props {
  plantsById: Map<string, Plant>
  onJump: (id: string) => void
  onClose?: () => void
  embedded?: boolean
}

/** 기본지원사업 지원금 단가 (원/kWh) — 시행령 별표2 (2017.12.26 개정) 원문 확인
 *  석탄은 유연탄 기준(무연탄은 0.3). 수력 2~10MW는 신재생 단가(0.1) 적용 */
const RATES: Record<string, number> = {
  원자력: 0.25, 석탄: 0.18, LNG: 0.1, 유류: 0.15,
  양수: 0.2, 수력: 0.2, 해양: 0.2, 풍력: 0.1, 바이오: 0.1, 기타: 0.1,
}
/** 설비용량 단가 (억원/MW) — 양수 50만원/MW, 수력 500만원/MW (별표2) */
const CAP_RATES: Record<string, number> = { 양수: 0.005, 수력: 0.05 }

function estimateAnnual(fuelCat: string, mw: number, gwh?: number): number | null {
  let rate = RATES[fuelCat]
  if (fuelCat === '수력' && mw <= 10) rate = 0.1 // 별표2 비고: 2~10MW 수력은 신재생 단가
  const genPart = gwh != null && rate ? (gwh * rate) / 100 : 0
  const capPart = (CAP_RATES[fuelCat] ?? 0) * (fuelCat === '수력' && mw <= 10 ? 0 : mw)
  const total = genPart + capPart
  return total > 0 ? total : null
}

/** 발주법 전기요금보조 — 발전본부별 '검증된 세대당 확정 지원액' (추정 아님).
 *  출처: 한수원 각 본부 공지 / 지역 언론(이투뉴스·중도일보 등). 지역·연도별로 달라지므로
 *  '특정 연도 확정 사례'로만 사용하고, 근거가 약한 하한·평균값은 표기하지 않음. */
const SUBSIDY_CASES: { re: RegExp; region: string; amount: string; year: string; extra?: string }[] = [
  { re: /한빛/, region: '전남 영광 · 한빛', amount: '주택용 월 17,690원(5km이내) / 8,845원(읍·면·동)', year: '2025', extra: '산업용 kW당 2,500 / 1,250원' },
  { re: /신한울|한울/, region: '경북 울진 · 한울', amount: '주택용 월 최대 17,690원', year: '2025' },
  { re: /신월성|월성/, region: '경북 경주 · 월성', amount: '주택용 월 16,640원 / 8,320원', year: '최근', extra: '산업용 kW당 2,300 / 1,150원' },
  { re: /새울|신고리|고리/, region: '부산 기장 · 고리/새울', amount: '주택용 월 최대 15,570원 (용량·지역별 차등)', year: '최근' },
  { re: /영흥/, region: '인천 옹진 · 영흥화력', amount: '주택용 월 최대 10,000원', year: '최근', extra: '산업용 kW당 월 1,500원 (월 최대 30만원)' },
  { re: /신보령|보령/, region: '충남 보령 · 보령화력', amount: '주택용 월 최대 10,000원', year: '2025' },
]
function subsidyCase(name: string) {
  return SUBSIDY_CASES.find(c => c.re.test(name))
}

export default function BenefitPanel({ plantsById, onJump, onClose, embedded }: Props) {
  const [data, setData] = useState<BenefitData | null>(null)
  const [local, setLocal] = useState<LocalData | null>(null)
  const [sido, setSido] = useState('')
  const [sigungu, setSigungu] = useState('')
  const [emd, setEmd] = useState('')

  useEffect(() => {
    fetch('data/benefit_zones.json')
      .then(r => r.json())
      .then(setData)
      .catch(e => console.error('혜택 데이터 로드 실패', e))
    fetch('data/benefit_local.json')
      .then(r => (r.ok ? r.json() : null))
      .then(setLocal)
      .catch(() => {}) // 지자체 시책 데이터는 선택적 — 없어도 기존 기능 동작
  }, [])

  // 선택한 시군구의 지자체 전입·정착 시책
  // 일반구가 있는 대도시는 선택지가 '안양시동안구' 형태이므로 시 단위('안양시') 시책으로 폴백
  const localRegion = useMemo(() => {
    if (!local || !sido || !sigungu) return null
    return (
      local.regions.find(r => r.sido === sido && r.sigungu === sigungu) ??
      local.regions.find(r => r.sido === sido && sigungu.startsWith(r.sigungu)) ??
      null
    )
  }, [local, sido, sigungu])

  useEffect(() => {
    if (localRegion && localRegion.programs.length > 0) {
      track('local_benefit_view', { sido, sigungu, program_count: localRegion.programs.length })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localRegion])

  const sidos = useMemo(() => (data ? Object.keys(data.tree).sort() : []), [data])
  const sigungus = useMemo(
    () => (data && sido ? Object.keys(data.tree[sido] ?? {}).sort() : []),
    [data, sido],
  )
  const emds = useMemo(
    () => (data && sido && sigungu ? data.tree[sido]?.[sigungu] ?? [] : []),
    [data, sido, sigungu],
  )

  const hits = emd && data ? data.zones[emd] ?? [] : null
  const hasNuclear = hits?.some(h => h.fuelCat === '원자력' && h.status === '운영중')
  const hasPlanned = hits?.some(h => h.status !== '운영중')

  // 혜택 리포트 조회 이벤트 (읍·면·동 선택으로 결과가 표시될 때 1회)
  const emdName = emds.find(([code]) => code === emd)?.[1]
  useEffect(() => {
    if (!emd || !data) return
    const zone = data.zones[emd] ?? []
    track('benefit_report_view', { sido, sigungu, emd: emdName ?? emd, plant_count: zone.length, eligible: zone.length > 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emd])

  // 전기요금보조 대상: 원자력 또는 연간 기본지원사업비(추정) 5억원 이상 발전소(운영중)
  const opHits = (hits ?? []).filter(h => h.status === '운영중')
  const elecEligible = opHits.filter(h => {
    if (h.fuelCat === '원자력') return true
    const est = estimateAnnual(h.fuelCat, h.mw, plantsById.get(h.id)?.gen?.gwh)
    return est != null && est >= 5
  })
  const matchedCases = opHits
    .map(h => subsidyCase(h.name))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .filter((c, i, arr) => arr.findIndex(x => x.region === c.region) === i)

  return (
    <div className={embedded ? 'benefit benefit-embed' : 'benefit'}>
      {!embedded && (
        <button className="detail-close" onClick={onClose}>
          ×
        </button>
      )}
      <h2>🏠 우리 동네 발전소 혜택</h2>
      <p className="bf-sub">
        발전소주변지역 지원에 관한 법률(발주법) 기준 — 발전기 반경 5km가 걸치는 읍·면·동 전체가
        지원 대상 &quot;주변지역&quot;입니다.
      </p>

      {!data ? (
        <div className="bf-loading">데이터 불러오는 중…</div>
      ) : (
        <>
          <div className="bf-selects">
            <select aria-label="시·도 선택" value={sido} onChange={e => { setSido(e.target.value); setSigungu(''); setEmd('') }}>
              <option value="">시·도</option>
              {sidos.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="시·군·구 선택"
              value={sigungu}
              disabled={!sido}
              onChange={e => {
                setSigungu(e.target.value)
                setEmd('')
                if (e.target.value) track('region_select', { sido, sigungu: e.target.value })
              }}
            >
              <option value="">시·군·구</option>
              {sigungus.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select aria-label="읍·면·동 선택" value={emd} disabled={!sigungu} onChange={e => setEmd(e.target.value)}>
              <option value="">읍·면·동</option>
              {emds.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {emd && hits && hits.length > 0 && (
            <div className="bf-result">
              <div className="bf-verdict yes">✅ 발주법상 주변지역에 해당합니다 (추정)</div>
              <div className="sb-label">반경 5km 내 발전소</div>
              {hits.map(h => {
                const p = plantsById.get(h.id)
                const est = h.status === '운영중' ? estimateAnnual(h.fuelCat, h.mw, p?.gen?.gwh) : null
                return (
                  <div key={h.id} className="repl-item" onClick={() => onJump(h.id)}>
                    <div>
                      {FUEL_ICONS[h.fuelCat]} <b>{h.name}</b> · {fuelLabel(h.fuelCat)} ·{' '}
                      {h.mw.toLocaleString()}MW
                      <em className={'tag ' + (h.status === '운영중' ? 'tag-run' : 'tag-planned')}>
                        {h.status === '운영중' ? '기본지원' : `특별지원(${h.status})`}
                      </em>
                    </div>
                    <small>
                      약 {h.distKm}km {h.approx && '· 위치 근사 기준'}
                    </small>
                    {est != null && (
                      <div className="bf-est">
                        연간 기본지원사업비 추정 약 <b>{est.toFixed(1)}억 원</b>
                        <small>
                          {' '}
                          (주변 읍면동 전체 배분 총액{p?.gen ? ` — ${p.gen.year} 발전량` : ''} × 별표2 단가
                          {CAP_RATES[h.fuelCat] ? ' + 설비용량 단가' : ''})
                        </small>
                      </div>
                    )}
                  </div>
                )
              })}

              {elecEligible.length > 0 && (
                <div className="bf-elec">
                  <div className="bf-elec-head">
                    ⚡ 전기요금보조 (세대별)
                    <span className="bf-elec-badge">거주지 기준 · 자동 감면 · 신청 불필요</span>
                  </div>
                  <div className="bf-elec-lead">
                    발전소 반경 5km 주변 읍·면·동의 <b>모든 세대</b>가 소득·자격과 무관하게 대상입니다.
                    한전 전기요금 고지서에서 <b>매달 자동 감면</b>됩니다.
                  </div>

                  {matchedCases.length > 0 ? (
                    matchedCases.map((c, i) => (
                      <div key={i} className="bf-elec-amt">
                        <div className="bf-elec-region">
                          {c.region} <small>({c.year} 확정)</small>
                        </div>
                        <div className="bf-elec-num">{c.amount}</div>
                        {c.extra && <div className="bf-elec-extra">{c.extra}</div>}
                      </div>
                    ))
                  ) : (
                    <div className="bf-elec-amt">
                      <div className="bf-elec-num">주택용 세대당 월 약 6,000 ~ 17,700원</div>
                      <div className="bf-elec-extra">
                        연 약 7만~21만원 수준 · 원전 인접·5km 이내 100% 지역이 상단, 화력·50% 지역이 하단
                      </div>
                    </div>
                  )}

                  <div className="bf-elec-grade">
                    거리 차등: 반경 <b>5km 이내 100%</b> · 5km 초과~같은 읍·면·동 <b>50%</b>
                  </div>

                  {matchedCases.length === 0 && (
                    <details className="bf-elec-ref">
                      <summary>다른 지역 확정 사례 보기</summary>
                      <ul>
                        {SUBSIDY_CASES.map((c, i) => (
                          <li key={i}>
                            <b>{c.region}</b> — {c.amount} <small>({c.year})</small>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div className="bf-elec-warn">
                    금액은 지역·연도별로 다르며 주변지역지원사업 심의위원회가 매년 의결합니다.
                    위 수치는 추정이 아닌 <b>검증된 특정 연도 사례</b>이며, 내 정확한 감면액은 한전
                    전기요금 고지서에서 확인하세요.
                  </div>
                  <div className="bf-elec-diff">
                    💡 취약계층 대상 <b>한전 전기요금 복지할인</b>과는 근거법·재원·대상이 다른 별개 제도로,
                    조건이 맞으면 두 혜택을 <b>함께</b> 받을 수 있습니다.
                  </div>
                </div>
              )}

              <div className="sb-label">받을 수 있는 혜택 (기본지원사업)</div>
              <ul className="bf-list">
                {elecEligible.length > 0 && <li>⚡ 전기요금 보조 (위 세대별 안내 참고)</li>}
                <li>🎓 장학금·육영사업</li>
                <li>🏘 주민복지·소득증대·공공시설 사업</li>
                {hasNuclear && <li>🏛 사업자지원사업 공모 (한수원 자체 재원 — 본부별 공고)</li>}
                {hasPlanned && <li>🏗 특별지원사업 — 건설비(부지비 제외)의 1.5% 이내, 인구·면적 기준 배분</li>}
              </ul>
              <div className="bf-note">
                단가는 시행령 별표2(2017.12.26 개정) 원문 기준: 원자력 0.25 · 유연탄 0.18 ·
                무연탄 0.3 · 유류 0.15 · LNG 0.1 · 양수/수력/조력 0.2 · 신재생 0.1원/kWh
                (+양수 50만원/MW·수력 500만원/MW 설비용량 단가). 법정 산식의 발전량은
                &apos;전력거래소 판매 전력량&apos;이나 본 추정은 EPSIS 발전량을 사용했습니다.
                구체적 사업·금액은 관할 시·군·구청과 발전사 공고로 확정됩니다.
              </div>
            </div>
          )}

          {emd && hits && hits.length === 0 && (
            <div className="bf-result">
              <div className="bf-verdict no">해당 없음 — 반경 5km 내 주요 발전소(10MW 이상)가 없습니다</div>
            </div>
          )}

          {localRegion && localRegion.programs.length > 0 && (
            <LocalBenefitCard region={localRegion} updatedAt={local?.updatedAt ?? ''} />
          )}
          {sigungu && local && !localRegion && (
            <div className="bf-local-none">
              이 지역의 전입·정착 시책 정보는 아직 수집되지 않았습니다 (주요 발전소 소재 시군구부터 제공
              중). 해당 시·군·구청 홈페이지에서 확인하세요.
            </div>
          )}

          <div className="bf-disclaimer">{data.note}</div>
        </>
      )}
    </div>
  )
}

/** 지자체 전입·정착 지원 시책 카드 */
function LocalBenefitCard({ region, updatedAt }: { region: LocalRegion; updatedAt: string }) {
  const byCat = LOCAL_CAT_ORDER.map(cat => ({
    cat,
    items: region.programs.filter(p => p.category === cat),
  })).filter(g => g.items.length > 0)

  return (
    <div className="bf-local">
      <div className="bf-local-head">
        🏡 {region.sido} {region.sigungu} 전입·정착 혜택
        {region.depopulation && (
          <span className="bf-local-badge" title="행정안전부 지정 인구감소지역 — 각종 지원 시책이 많은 지역입니다">
            인구감소지역
          </span>
        )}
      </div>
      <div className="bf-local-lead">
        이 지역으로 <b>전입(이사)</b>하면 받을 수 있는 지자체 지원입니다. 발전소 주변지역 지원과{' '}
        <b>별개</b>로, 조건이 맞으면 함께 받을 수 있습니다.
      </div>

      {byCat.map(g => (
        <div key={g.cat} className="bf-local-cat">
          <div className="bf-local-cat-head">
            {LOCAL_CAT_ICONS[g.cat]} {g.cat === '청년일자리' ? '청년·일자리' : g.cat === '출산육아' ? '출산·육아' : g.cat === '전입정착' ? '전입·정착' : g.cat}
          </div>
          {g.items.map((p, i) => (
            <div key={i} className="bf-local-item">
              <div className="bf-local-name">
                {p.name}
                <a
                  href={safeUrl(p.source)}
                  target="_blank"
                  rel="noreferrer"
                  className="os-src"
                  onClick={e => {
                    e.stopPropagation()
                    trackOutbound(p.source)
                  }}
                >
                  출처
                </a>
              </div>
              <div className="bf-local-amt">{p.amount}</div>
              {p.condition && <div className="bf-local-cond">{p.condition}</div>}
            </div>
          ))}
        </div>
      ))}

      <div className="bf-local-warn">
        지자체 조례·공고 기준({updatedAt} 조사)이며 예산 소진·조례 개정으로 변동될 수 있습니다. 신청
        자격(전입 기간·연령·거주 요건 등)은 반드시 해당 시·군·구청에 확인하세요.
      </div>
    </div>
  )
}
