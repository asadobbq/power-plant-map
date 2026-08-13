// 채용공고 프록시 — 공공데이터포털 '공공기관 채용정보 조회서비스'
// data.go.kr는 해외 IP를 차단하므로 GitHub Actions 대신 서울 리전(icn1) 함수에서 수집한다
// (vercel.json "regions": ["icn1"]). 결과는 엣지 캐시 6시간(s-maxage) — API 호출 일 수 회 수준.
// 키는 서버 환경변수 DATA_GO_KR_KEY 로만(코드·저장소 저장 금지). 미설정 시 503 →
// 프런트는 정적 data/jobs.json 폴백.

const API = 'https://apis.data.go.kr/1051000/recruitment/list'

// 표시명 매핑 — instNm에 키 문자열이 포함되면 대상 (pipeline/jobs_fetch.py와 동일하게 유지)
const TARGETS = {
  한국남동발전: '남동발전',
  한국중부발전: '중부발전',
  한국서부발전: '서부발전',
  한국남부발전: '남부발전',
  한국동서발전: '동서발전',
  한국수력원자력: '한수원',
  한국전력공사: '한전',
  한국전력거래소: '전력거래소',
  한국전력기술: '한국전력기술',
  한전KPS: '한전KPS',
  한전KDN: '한전KDN',
  한국지역난방공사: '지역난방공사',
  한국수자원공사: '수자원공사',
}
const MAX_ITEMS = 80

const ymd = s => {
  s = String(s || '')
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s
}

export default async function handler(req, res) {
  const key = (process.env.DATA_GO_KR_KEY || '').trim()
  if (!key) {
    res.status(503).json({ error: 'DATA_GO_KR_KEY 미설정' })
    return
  }
  try {
    const rows = []
    let page = 1
    let total = 0
    do {
      const url =
        API + '?' +
        new URLSearchParams({
          serviceKey: key, resultType: 'json',
          numOfRows: '100', pageNo: String(page), ongoingYn: 'Y',
        })
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) })
      const d = await r.json()
      if (d.resultCode !== 200) throw new Error(`API 오류: ${d.resultMsg}`)
      rows.push(...(d.result || []))
      total = d.totalCount || 0
      page++
    } while ((page - 1) * 100 < total && page <= 10)

    const items = []
    for (const r of rows) {
      const inst = r.instNm || ''
      const entry = Object.entries(TARGETS).find(([k]) => inst.includes(k))
      if (!entry) continue
      items.push({
        company: entry[1],
        inst,
        title: (r.recrutPbancTtl || '').trim(),
        kind: r.recrutSeNm || '',
        hire: r.hireTypeNmLst || '',
        region: r.workRgnNmLst || '',
        count: r.recrutNope ?? null,
        start: ymd(r.pbancBgngYmd),
        end: ymd(r.pbancEndYmd),
        dday: r.decimalDay ?? null,
        url: r.srcUrl || '',
        sn: r.recrutPblntSn,
        // 정적 페이지 본문·구조화 데이터(JobPosting)용 상세 — pipeline/jobs_fetch.py와 동일하게 유지
        ncs: r.ncsCdNmLst || '',
        edu: r.acbgCondNmLst || '',
        qual: (r.aplyQlfcCn || '').trim().slice(0, 1200),
        pref: (r.prefCn || '').trim().slice(0, 600),
        steps: (r.scrnprcdrMthdExpln || '').trim().slice(0, 600),
      })
    }
    items.sort((a, b) => (a.end || '9999').localeCompare(b.end || '9999') || a.company.localeCompare(b.company))

    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400')
    res.status(200).json({
      updatedAt: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '),
      note:
        "공공데이터포털 '공공기관 채용정보 조회서비스'(재정경제부) 기반 자동 수집 — 진행 중 공고만 표시. " +
        '지원 자격·일정 등 확정 정보는 반드시 원문 공고에서 확인하세요.',
      source: 'https://www.data.go.kr/data/15125273/openapi.do',
      items: items.slice(0, MAX_ITEMS),
    })
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) })
  }
}
