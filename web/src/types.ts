export interface Unit {
  label: string
  mw: number
  count: string
  completed: string
  fuel: string
  ftype: string
  makers?: { b: string; t: string; g: string }
  gen?: { gwh: number; cf: number }
  retire?: { year: number; type: string }
  replacements?: { to: string; planned: string; note: string }[]
}

export interface Plant {
  id: string
  name: string
  fuelCat: string
  company: string
  companyGroup: string
  mwEstimated?: boolean
  status: string
  address: string
  addressDetail?: string
  sido: string
  sigungu: string
  lat: number | null
  lng: number | null
  precision: 'exact' | 'sigungu' | null
  totalMw: number
  central: string
  market: string
  biz: string
  units: Unit[]
  firstRetireYear: number | null
  planned?: { when: string; note: string }
  gen?: { year: string; gwh: number; cf: number }
}

export interface NewsItem {
  date: string
  title: string
  url: string
  source: string
  tags: string[]
}

export interface NewsData {
  updatedAt: string
  items: NewsItem[]
}

export interface JobItem {
  company: string
  inst: string
  title: string
  kind: string
  hire: string
  region: string
  count?: number | null
  start: string
  end: string
  dday?: number | null
  url: string
  sn?: number
}

export interface JobsData {
  updatedAt: string
  note?: string
  source?: string
  items: JobItem[]
}

export interface HrPayYear {
  year: number
  amount: number // 천원
  kind: string // 결산 | 예산
}

export interface HrCompany {
  name: string // 축약명 (남동발전 등)
  full: string
  hq: string
  avgPay: HrPayYear[]
  newHire2025?: number | null // 천원
  newHire2026Budget?: number | null
  employees?: { asOf: string; regular?: number | null; total?: number | null }
  tenure?: number | null
  alioUrl?: string
}

export interface HrData {
  updatedAt: string
  note?: string
  companies: HrCompany[]
}

/** 일자리 탭 기관 칩 색 — 발전5사는 해외사업 탭과 동일 색 유지 */
export const JOB_COMPANY_COLORS: Record<string, string> = {
  남동발전: '#0ea5e9',
  중부발전: '#22c55e',
  서부발전: '#f59e0b',
  남부발전: '#ef4444',
  동서발전: '#8b5cf6',
  한수원: '#6366f1',
  한전: '#0f766e',
  한전KPS: '#a16207',
  한전KDN: '#db2777',
  한국전력기술: '#0891b2',
  전력거래소: '#64748b',
  지역난방공사: '#ea580c',
  수자원공사: '#0284c7',
}

export interface OverseasItem {
  company: string
  companyGroup?: string
  country: string
  name: string
  fuel?: string
  mw?: number
  stake?: string
  status?: string
  city?: string
  lat?: number
  lng?: number
  source?: string
}

export interface OverseasData {
  updatedAt: string
  note?: string
  items: OverseasItem[]
}

export const OS_COMPANY_COLORS: Record<string, string> = {
  남동발전: '#0ea5e9',
  중부발전: '#22c55e',
  서부발전: '#f59e0b',
  남부발전: '#ef4444',
  동서발전: '#8b5cf6',
}

export interface Link {
  from: string
  fromUnit: string
  to: string
  toName: string
  planned: string
  note: string
}

export interface PlantData {
  generatedAt: string
  sources: string[]
  plants: Plant[]
  links: Link[]
}

export const FUEL_COLORS: Record<string, string> = {
  원자력: '#8b5cf6',
  석탄: '#78716c',
  LNG: '#f59e0b',
  유류: '#b45309',
  수력: '#38bdf8',
  양수: '#2563eb',
  풍력: '#0891b2',
  바이오: '#22c55e',
  해양: '#14b8a6',
  기타: '#9ca3af',
}

export const FUEL_ORDER = ['원자력', '석탄', 'LNG', '유류', '수력', '양수', '풍력', '바이오', '해양', '기타']

export const FUEL_ICONS: Record<string, string> = {
  원자력: '⚛️',
  석탄: '⚫',
  LNG: '🔥',
  유류: '🛢️',
  수력: '💧',
  양수: '🔁',
  풍력: '💨',
  바이오: '🌿',
  해양: '🌊',
  기타: '⚡',
}

/** 칩·카드에 쓰는 표시명 (카테고리 키와 다를 때만) */
export const FUEL_LABELS: Record<string, string> = {
  해양: '해양(조류)',
}

export function fuelLabel(f: string): string {
  return FUEL_LABELS[f] ?? f
}

export const COMPANY_GROUPS = [
  '한수원', '남동발전', '중부발전', '서부발전', '남부발전', '동서발전',
  '지역난방공사', '수자원공사', '민간·기타', '건설·계획',
]

/** 링크 안전장치: 데이터 JSON의 URL은 http(s)만 허용 (javascript: 등 차단) */
export function safeUrl(u?: string): string | undefined {
  if (!u) return undefined
  // 일부 데이터의 source는 "URL ; URL ; 메모" 형태로 복수 출처가 붙어 있음 —
  // 첫 번째 유효 URL만 추출해 링크 깨짐을 방지한다.
  const first = u.trim().split(/[;\s]+/).find(t => /^https?:\/\//i.test(t))
  return first
}

export function fmtMw(mw: number): string {
  return mw >= 1000 ? (mw / 1000).toFixed(1).replace(/\.0$/, '') + 'GW' : Math.round(mw) + 'MW'
}

/** 상태 그룹: 운영중 / 예정(건설·추진·계획) / 폐지 */
export function statusGroup(p: Plant): '운영중' | '예정' | '폐지' {
  if (p.status === '운영중') return '운영중'
  if (p.status === '폐지완료') return '폐지'
  return '예정'
}
