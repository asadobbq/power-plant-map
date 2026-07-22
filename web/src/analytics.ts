// GA4 애널리틱스 — Measurement ID는 환경변수(VITE_GA4_ID)로 주입.
// ID가 없으면(로컬 개발 등) 전부 무해한 no-op. 코드에 ID를 하드코딩하지 않는다.

const GA_ID = (import.meta.env.VITE_GA4_ID as string | undefined)?.trim()

type Gtag = (...args: unknown[]) => void
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: Gtag
  }
}

let started = false

/** 앱 시작 시 1회 호출. gtag 스크립트를 주입하고 기본 page_view를 전송한다. */
export function initAnalytics(): void {
  if (started || !GA_ID || typeof window === 'undefined') return
  started = true

  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)

  window.dataLayer = window.dataLayer || []
  const gtag: Gtag = (...args) => {
    window.dataLayer!.push(args)
  }
  window.gtag = gtag
  gtag('js', new Date())
  // GA4는 IP를 저장하지 않음(기본 익명화). 지역 리포트는 서버측 대략 위치로 제공됨.
  gtag('config', GA_ID, { send_page_view: true })
}

/** 커스텀 이벤트 전송. GA 미설정 시 no-op. */
export function track(event: string, params?: Record<string, unknown>): void {
  if (!GA_ID || typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', event, params ?? {})
}

/** GA 활성화 여부(안내 문구 표시용). */
export const analyticsEnabled = !!GA_ID
