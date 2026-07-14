import { useEffect, useRef, useState } from 'react'
import { FUEL_COLORS, FUEL_ICONS, FUEL_ORDER, COMPANY_GROUPS, fuelLabel } from '../types'

interface Props {
  fuels: Set<string>
  setFuels: (s: Set<string>) => void
  companies: Set<string>
  setCompanies: (s: Set<string>) => void
  statuses: Set<string>
  setStatuses: (s: Set<string>) => void
  showSmall: boolean
  setShowSmall: (b: boolean) => void
  count: number
  total: number
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

const STATUS_META: [string, string, string][] = [
  ['운영중', '운영중', '#10b981'],
  ['예정', '건설·계획', '#f97316'],
  ['폐지', '폐지완료', '#6b7280'],
]

export default function MapControls(p: Props) {
  const [open, setOpen] = useState<null | 'fuel' | 'company' | 'status'>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const fuelLabelText =
    p.fuels.size === FUEL_ORDER.length ? '전체' : p.fuels.size === 0 ? '없음' : `${p.fuels.size}종`
  const compLabelText =
    p.companies.size === COMPANY_GROUPS.length ? '전체' : p.companies.size === 0 ? '없음' : `${p.companies.size}개`
  const statusLabelText = p.statuses.size === 3 ? '전체' : `${p.statuses.size}개`

  return (
    <div className="mapctrl" ref={rootRef}>
      <div className="mapctrl-bar">
        {/* 연료원 */}
        <button
          className={'mc-chip' + (open === 'fuel' ? ' active' : '')}
          onClick={() => setOpen(open === 'fuel' ? null : 'fuel')}
        >
          연료원 <b>{fuelLabelText}</b> <span className="mc-caret">▾</span>
        </button>
        {/* 회사 */}
        <button
          className={'mc-chip' + (open === 'company' ? ' active' : '')}
          onClick={() => setOpen(open === 'company' ? null : 'company')}
        >
          회사 <b>{compLabelText}</b> <span className="mc-caret">▾</span>
        </button>
        {/* 상태 */}
        <button
          className={'mc-chip' + (open === 'status' ? ' active' : '')}
          onClick={() => setOpen(open === 'status' ? null : 'status')}
        >
          상태 <b>{statusLabelText}</b> <span className="mc-caret">▾</span>
        </button>
        <label className="mc-chip mc-toggle">
          <input type="checkbox" checked={p.showSmall} onChange={e => p.setShowSmall(e.target.checked)} />
          10MW﹣
        </label>
        <span className="mc-count">{p.count.toLocaleString()}곳</span>
      </div>

      {open === 'fuel' && (
        <div className="mc-pop">
          <div className="mc-pop-head">
            <span>연료원</span>
            <span>
              <button onClick={() => p.setFuels(new Set(FUEL_ORDER))}>전체</button>
              <button onClick={() => p.setFuels(new Set())}>해제</button>
            </span>
          </div>
          <div className="mc-fuel-grid">
            {FUEL_ORDER.map(f => (
              <button
                key={f}
                className={'mc-fuel' + (p.fuels.has(f) ? ' on' : '')}
                style={{ '--c': FUEL_COLORS[f] } as React.CSSProperties}
                onClick={() => p.setFuels(toggle(p.fuels, f))}
              >
                {FUEL_ICONS[f]} {fuelLabel(f)}
              </button>
            ))}
          </div>
        </div>
      )}

      {open === 'company' && (
        <div className="mc-pop">
          <div className="mc-pop-head">
            <span>발전 회사</span>
            <span>
              <button onClick={() => p.setCompanies(new Set(COMPANY_GROUPS))}>전체</button>
              <button onClick={() => p.setCompanies(new Set())}>해제</button>
            </span>
          </div>
          <div className="mc-comp-grid">
            {COMPANY_GROUPS.map(c => (
              <button
                key={c}
                className={'mc-fuel' + (p.companies.has(c) ? ' on' : '')}
                style={{ '--c': '#475569' } as React.CSSProperties}
                onClick={() => p.setCompanies(toggle(p.companies, c))}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {open === 'status' && (
        <div className="mc-pop">
          <div className="mc-pop-head">
            <span>상태</span>
          </div>
          <div className="mc-comp-grid">
            {STATUS_META.map(([key, label, color]) => (
              <button
                key={key}
                className={'mc-fuel' + (p.statuses.has(key) ? ' on' : '')}
                style={{ '--c': color } as React.CSSProperties}
                onClick={() => p.setStatuses(toggle(p.statuses, key))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
