import { useEffect, useMemo, useState } from 'react'
import type { Plant } from '../types'
import { FUEL_ICONS, fuelLabel } from '../types'

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

export default function BenefitPanel({ plantsById, onJump, onClose, embedded }: Props) {
  const [data, setData] = useState<BenefitData | null>(null)
  const [sido, setSido] = useState('')
  const [sigungu, setSigungu] = useState('')
  const [emd, setEmd] = useState('')

  useEffect(() => {
    fetch('data/benefit_zones.json')
      .then(r => r.json())
      .then(setData)
      .catch(e => console.error('혜택 데이터 로드 실패', e))
  }, [])

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
            <select value={sido} onChange={e => { setSido(e.target.value); setSigungu(''); setEmd('') }}>
              <option value="">시·도</option>
              {sidos.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={sigungu} disabled={!sido} onChange={e => { setSigungu(e.target.value); setEmd('') }}>
              <option value="">시·군·구</option>
              {sigungus.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={emd} disabled={!sigungu} onChange={e => setEmd(e.target.value)}>
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

              <div className="sb-label">받을 수 있는 혜택 (기본지원사업)</div>
              <ul className="bf-list">
                <li>⚡ 전기요금 보조 (주변지역 가구)</li>
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

          <div className="bf-disclaimer">{data.note}</div>
        </>
      )}
    </div>
  )
}
