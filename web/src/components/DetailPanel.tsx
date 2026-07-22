import type { Plant, Link, NewsItem } from '../types'
import { FUEL_COLORS, fuelLabel } from '../types'

interface Props {
  plant: Plant
  links: Link[]
  news: NewsItem[]
  plantsById: Map<string, Plant>
  generatedAt?: string
  onClose: () => void
  onJump: (id: string) => void
}

export default function DetailPanel({ plant, links, news, plantsById, generatedAt, onClose, onJump }: Props) {
  const color = FUEL_COLORS[plant.fuelCat]
  const outgoing = links.filter(l => l.from === plant.id)
  const incoming = links.filter(l => l.to === plant.id)
  // 폐지·대체·준공 등 '계획' 성격 정보가 있으면 출처·변동가능 면책을 노출
  const hasSchedule =
    plant.status !== '운영중' ||
    plant.firstRetireYear != null ||
    !!plant.planned ||
    plant.units.some(u => u.retire || (u.replacements && u.replacements.length > 0))

  return (
    <div className="detail">
      <button className="detail-close" onClick={onClose}>
        ×
      </button>
      <div className="detail-head">
        <span className="dot lg" style={{ background: color }} />
        <div>
          <h2>{plant.name}</h2>
          <div className="detail-sub">
            {fuelLabel(plant.fuelCat)} · {plant.status}
            {plant.company && ` · ${plant.company}`}
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <span className="k">설비용량</span>
          <b>
            {plant.totalMw.toLocaleString()} MW{plant.mwEstimated && <small> (추정)</small>}
          </b>
        </div>
        <div className="wide">
          <span className="k">소재지</span>
          <b>
            {plant.addressDetail || plant.address || '미정'}
            {plant.addressDetail && plant.address && plant.addressDetail !== plant.address && (
              <small className="addr-coarse"> · {plant.address}</small>
            )}
          </b>
        </div>
        {plant.planned && (
          <div>
            <span className="k">{plant.status === '폐지완료' ? '폐지' : '준공 예정'}</span>
            <b>{plant.planned.when}</b>
          </div>
        )}
        {plant.gen && (
          <>
            <div>
              <span className="k">발전량 ({plant.gen.year})</span>
              <b>{plant.gen.gwh.toLocaleString()} GWh</b>
            </div>
            <div>
              <span className="k">이용률 ({plant.gen.year})</span>
              <b>{plant.gen.cf}%</b>
            </div>
          </>
        )}
        {plant.central && (
          <div>
            <span className="k">급전 구분</span>
            <b>{plant.central}</b>
          </div>
        )}
        {(() => {
          const years = plant.units
            .map(u => parseInt(u.completed))
            .filter(y => !isNaN(y) && y > 1900)
          if (!years.length) return null
          const age = new Date().getFullYear() - Math.min(...years) + 1
          return (
            <div>
              <span className="k">가동 연차</span>
              <b>{age}년차 <small>(최초 호기 {Math.min(...years)}년)</small></b>
            </div>
          )
        })()}
      </div>

      {plant.precision !== 'exact' && plant.lat != null && (
        <div className="notice">위치는 시군구 중심점 기준 근사값입니다</div>
      )}
      {plant.mwEstimated && (
        <div className="notice">용량은 대체 대상 호기 합계 기준 추정치입니다 (전기본 확정 용량 확인 필요)</div>
      )}
      {plant.planned?.note && <div className="notice info">{plant.planned.note}</div>}

      {plant.units.length > 0 && (
        <table className="units">
          <thead>
            <tr>
              <th>호기</th>
              <th>MW</th>
              <th>준공</th>
              <th>제작사</th>
              <th>이용률</th>
              <th>폐지 예정</th>
            </tr>
          </thead>
          <tbody>
            {plant.units.map((u, i) => {
              const mk = u.makers
              // 원자력은 '보일러' 대신 원자로(핵증기공급계통)가 그 역할
              const boilerLabel = plant.fuelCat === '원자력' ? '원자로' : '보일러'
              const mkRows: [string, string][] = mk
                ? [[boilerLabel, mk.b], ['터빈', mk.t], ['발전기', mk.g]]
                : []
              return (
                <tr key={i}>
                  <td>{u.label || '-'}</td>
                  <td className="num">{u.mw.toLocaleString()}</td>
                  <td>{u.completed}</td>
                  <td className="mk-cell">
                    {mkRows.some(([, v]) => v && v !== '-')
                      ? mkRows.map(([k, v]) => (
                          <div key={k} className="mk-line">
                            <i>{k}</i>
                            {v && v !== '-' ? v : '—'}
                          </div>
                        ))
                      : '—'}
                  </td>
                  <td className="num">{u.gen ? `${u.gen.cf}%` : '—'}</td>
                  <td>
                    {u.retire ? (
                      <span className="retire">
                        {u.retire.year}년 <small>({u.retire.type})</small>
                        {u.replacements?.map(r => (
                          <div key={r.to} className="repl-inline">
                            → {r.to}
                            {r.planned && <small> ({r.planned})</small>}
                          </div>
                        ))}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {plant.units.length > 0 && (
        <div className="mk-hint">
          {plant.fuelCat === '원자력'
            ? '원자력은 원자로(핵증기공급계통)·터빈·발전기 주계약사입니다. 화력의 보일러 자리를 원자로가 대신합니다.'
            : '주기기 기종·모델명은 공개 데이터에 없어 제작사까지 제공됩니다.'}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="repl">
          <div className="sb-label">폐지 → 대체 건설 (11차 전기본)</div>
          {outgoing.map((l, i) => {
            const dst = plantsById.get(l.to)
            return (
              <div key={i} className="repl-item" onClick={() => dst && onJump(dst.id)}>
                <span className="repl-from">{l.fromUnit}</span> →{' '}
                <span className="repl-to">{l.toName}</span>
                <small> {l.planned && `(${l.planned})`}</small>
                {l.note && <div className="repl-note">{l.note}</div>}
              </div>
            )
          })}
        </div>
      )}

      {incoming.length > 0 && (
        <div className="repl">
          <div className="sb-label">이 설비가 대체하는 폐지 호기</div>
          {incoming.map((l, i) => {
            const src = plantsById.get(l.from)
            return (
              <div key={i} className="repl-item" onClick={() => src && onJump(src.id)}>
                <span className="repl-from">{l.fromUnit}</span>
                <small> {l.planned && `(${l.planned})`}</small>
              </div>
            )
          })}
        </div>
      )}

      {news.length > 0 && (
        <div className="repl">
          <div className="sb-label">관련 뉴스</div>
          {news.map((n, i) => (
            <a key={i} className="news-item" href={n.url} target="_blank" rel="noreferrer">
              <span className="news-title">{n.title}</span>
              <small>
                {n.source} · {n.date}
              </small>
            </a>
          ))}
        </div>
      )}

      <div className="detail-foot">
        {hasSchedule && (
          <div className="notice warn">
            폐지·대체·준공 시기는 <b>제11차 전력수급기본계획</b>(산업부 공고 제2025-169호, 2025) 등 계획
            기준이며, 인허가·공정·정책 변경에 따라 실제와 달라질 수 있습니다.
          </div>
        )}
        <div className="detail-src">
          출처: EPSIS 발전기 세부내역(2024)·제11차 전력수급기본계획·발전사 공식 홈페이지
          {generatedAt && <> · 기준일 {generatedAt}</>}
        </div>
      </div>
    </div>
  )
}
