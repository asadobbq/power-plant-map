// 빌드 후 실행: 발전소별·시군구별 정적 SEO 페이지 + 사이트맵 생성 → dist/
// 사용: node scripts/gen-static-pages.mjs  (vite build 이후)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))) // web/
const DIST = join(ROOT, 'dist')
const SITE = 'https://kopower.net'

const plantsData = JSON.parse(readFileSync(join(ROOT, 'public/data/plants.json'), 'utf-8'))
const localData = JSON.parse(readFileSync(join(ROOT, 'public/data/benefit_local.json'), 'utf-8'))
let hrData = null
try {
  hrData = JSON.parse(readFileSync(join(ROOT, 'public/data/hr.json'), 'utf-8'))
} catch {
  console.warn('경고: hr.json 없음 — 일자리 페이지 생략')
}
let jobsData = null
try {
  jobsData = JSON.parse(readFileSync(join(ROOT, 'public/data/jobs.json'), 'utf-8'))
} catch {
  console.warn('경고: jobs.json 없음 — 채용공고 섹션 생략')
}
let zonesData = null
try {
  zonesData = JSON.parse(readFileSync(join(ROOT, 'public/data/benefit_zones.json'), 'utf-8'))
} catch {
  console.warn('경고: benefit_zones.json 없음 — 주변지역 판정 페이지 생략')
}
let overseasData = null
try {
  overseasData = JSON.parse(readFileSync(join(ROOT, 'public/data/overseas.json'), 'utf-8'))
} catch { /* 선택 데이터 */ }
let bizData = null
try {
  bizData = JSON.parse(readFileSync(join(ROOT, 'public/data/local_biz.json'), 'utf-8'))
} catch { /* 선택 데이터 */ }

const TODAY = new Date().toISOString().slice(0, 10)
/** 마감일이 지나지 않은 공고만 — 만료 공고의 색인·구조화 데이터 노출 방지 */
const openJobs = (jobsData?.items ?? []).filter(j => !j.end || j.end >= TODAY)
const plants = plantsData.plants
const generatedAt = plantsData.generatedAt

// ---------- 유틸 ----------
const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const fmtMw = mw => (mw >= 1000 ? (mw / 1000).toFixed(1).replace(/\.0$/, '') + 'GW' : Math.round(mw) + 'MW')

const FUEL_TYPE = {
  원자력: '원자력발전소', 석탄: '석탄화력발전소', LNG: 'LNG발전소', 유류: '유류화력발전소',
  수력: '수력발전소', 양수: '양수발전소', 풍력: '풍력발전소', 바이오: '바이오발전소',
  해양: '조류발전소', 기타: '발전소',
}
const FUEL_ICONS = { 원자력: '⚛️', 석탄: '⚫', LNG: '🔥', 유류: '🛢️', 수력: '💧', 양수: '🔁', 풍력: '💨', 바이오: '🌿', 해양: '🌊', 기타: '⚡' }

function pageTitle(p) {
  // 이름에 이미 설비 성격이 들어있으면 유형어 중복 방지 (예: 영흥2풍력, 분당, 서울복합, ○○열병합)
  const hasType = /(풍력|열병합|복합|태양|연료전지|에너지|발전|IGCC|GT|소수력|해양|양수|수력|보$|댐)/.test(p.name)
  return hasType ? `${p.name}` : `${p.name} ${FUEL_TYPE[p.fuelCat] || '발전소'}`
}

// 발주법 전기요금보조 확정 사례 (BenefitPanel과 동일 근거)
const SUBSIDY_CASES = [
  { re: /한빛/, amount: '주택용 월 17,690원(5km 이내) / 8,845원(읍·면·동)', year: '2025' },
  { re: /신한울|한울/, amount: '주택용 월 최대 17,690원', year: '2025' },
  { re: /신월성|월성/, amount: '주택용 월 16,640원 / 8,320원', year: '최근' },
  { re: /새울|신고리|고리/, amount: '주택용 월 최대 15,570원 (용량·지역별 차등)', year: '최근' },
  { re: /영흥/, amount: '주택용 월 최대 10,000원', year: '최근' },
  { re: /신보령|보령/, amount: '주택용 월 최대 10,000원', year: '2025' },
]

// ---------- 슬러그 (이름 기반, 중복은 연료·시도로 구분) ----------
// 한글·영숫자·하이픈만 허용 (Windows 금지문자 및 URL 특수문자 방지)
const sanitize = s => s.replace(/[^0-9A-Za-z가-힣-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
const slugCount = {}
for (const p of plants) slugCount[sanitize(p.name)] = (slugCount[sanitize(p.name)] || 0) + 1
const used = new Set()
const slugOf = new Map()
for (const p of plants) {
  let s = sanitize(p.name)
  if (slugCount[s] > 1) s = sanitize(`${p.name}-${p.fuelCat}`)
  if (used.has(s)) s = sanitize(`${p.name}-${p.fuelCat}-${p.sigungu || p.sido || ''}`)
  let base = s, i = 2
  while (used.has(s)) s = `${base}-${i++}`
  used.add(s)
  slugOf.set(p.id, s)
}
const byName = new Map()
for (const p of plants) if (!byName.has(p.name)) byName.set(p.name, p)

const hrNames = new Set((hrData?.companies ?? []).map(c => c.name))
const regionSlug = r => sanitize(`${r.sido}-${r.sigungu}`)
const regions = localData.regions
const regionBySigungu = new Map(regions.map(r => [`${r.sido}|${r.sigungu}`, r]))

// ---------- 공통 템플릿 ----------
const CSS = `
:root{--bg:#ffffff;--fg:#1f2937;--dim:#6b7280;--line:#e5e7eb;--card:#f8fafc;--accent:#1d4ed8;--warnbg:#fef3c7;--warnfg:#92400e;--goodbg:#f0fdf4;--goodfg:#15803d}
@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--dim:#94a3b8;--line:#1e293b;--card:#1e293b;--accent:#60a5fa;--warnbg:#3b2f0e;--warnfg:#fbbf24;--goodbg:#0d2818;--goodfg:#4ade80}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;background:var(--bg);color:var(--fg);line-height:1.65;font-size:15px}
main{max-width:760px;margin:0 auto;padding:28px 18px 60px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
h1{font-size:26px;line-height:1.3;margin:6px 0 4px}
h2{font-size:17px;margin:26px 0 10px;padding-top:14px;border-top:1px solid var(--line)}
.crumb{font-size:12px;color:var(--dim)}
.sub{color:var(--dim);font-size:14px;margin-bottom:14px}
.cta{display:inline-block;background:var(--accent);color:#fff !important;font-weight:700;padding:9px 18px;border-radius:9px;margin:10px 0}
.cta:hover{text-decoration:none;opacity:.92}
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
th{text-align:left;font-size:11.5px;color:var(--dim);border-bottom:1px solid var(--line);padding:5px 8px;font-weight:600}
td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin:14px 0}
.facts>div{background:var(--card);border-radius:9px;padding:9px 12px}
.facts .k{font-size:11px;color:var(--dim)}.facts b{font-size:14.5px}
.warn{background:var(--warnbg);color:var(--warnfg);border-radius:8px;padding:9px 12px;font-size:12.5px;margin:10px 0}
.good{background:var(--goodbg);color:var(--goodfg);border-radius:8px;padding:9px 12px;font-size:13px;margin:10px 0}
.tags a{display:inline-block;background:var(--card);border-radius:999px;padding:4px 11px;font-size:12.5px;margin:3px 4px 3px 0}
footer{margin-top:36px;font-size:11px;color:var(--dim);border-top:1px solid var(--line);padding-top:12px;line-height:1.6}
.tbl{overflow-x:auto}`

// GA4 — 측정 ID는 환경변수로만 주입(코드에 하드코딩하지 않는다, src/analytics.ts와 동일 원칙).
// 정적 페이지 565개는 React 앱이 실행되지 않아 그동안 전혀 계측되지 않았다 —
// 검색 유입이 실제로 착지하는 면이므로 page_view만이라도 보내 유입 경로를 측정한다.
const GA_ID = (process.env.VITE_GA4_ID || '').trim()
if (!GA_ID) console.warn('경고: VITE_GA4_ID 미설정 — 정적 페이지 GA4 계측 생략')
const GA_SNIPPET = GA_ID
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></scr` + `ipt>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');</scr` + `ipt>`
  : ''

/** 페이지 유형별 OG 카드 — 카톡·네이버 공유 시 썸네일. web/scripts/make_og.py 로 생성 */
const OG_DEFAULT = '/og/og-default.png'
function ogFor(path) {
  if (path.startsWith('/jobs/')) return '/og/og-jobs.png'
  if (path.startsWith('/region/') || path.startsWith('/zone/')) return '/og/og-region.png'
  if (path.startsWith('/plant/')) return '/og/og-plant.png'
  return OG_DEFAULT
}

function shell({ title, desc, path, body, breadcrumbs, extraLd = [], ogImage = null }) {
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map(([name, url], i) => ({
      '@type': 'ListItem', position: i + 1, name, ...(url ? { item: SITE + url } : {}),
    })),
  }
  const ldTags = [ld, ...extraLd]
    .map(x => `<script type="application/ld+json">${JSON.stringify(x)}</scr` + `ipt>`)
    .join('\n')
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${SITE}${encodeURI(path)}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${SITE}${encodeURI(path)}" />
<meta property="og:site_name" content="우리동네 발전소" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:image" content="${SITE}${ogImage || ogFor(path)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${esc(title)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${SITE}${ogImage || ogFor(path)}" />
${GA_SNIPPET}
${ldTags}
<style>${CSS}</style>
</head>
<body><main>
<nav class="crumb">${breadcrumbs.map(([name, url]) => (url ? `<a href="${encodeURI(url)}">${esc(name)}</a>` : esc(name))).join(' › ')}</nav>
${body}
<footer>출처: 전력거래소 EPSIS 발전기 세부내역(2024) · 한국전력 전력통계월보 · 제11차 전력수급기본계획(산업부 공고 제2025-169호) · 각 발전사 공식 홈페이지 · 각 시군구청 시책 안내 — 기준일 ${esc(generatedAt)}<br />
폐지·준공 시기는 계획 기준으로 변동될 수 있으며, 혜택·지원금은 추정치로 법적 판정이 아닙니다. 본 서비스는 공공데이터를 재구성한 비공식 안내 서비스입니다.<br />
<a href="/">🗺️ 우리동네 발전소 — 전국 발전소 지도</a> · <a href="/plant/">발전소 목록</a> · <a href="/region/">지역별 혜택</a> · <a href="/zone/">주변지역 판정</a> · <a href="/jobs/">채용·연봉</a> · <a href="/jobs/salary/">연봉 비교</a> · <a href="/topic/석탄화력-폐지-일정/">석탄 폐지 일정</a> · <a href="/overseas/">해외사업</a><br />
코드·데이터·문서 전체 공개: <a href="https://github.com/asadobbq/power-plant-map" rel="noreferrer">공개 저장소(GitHub)</a> · <a href="https://github.com/asadobbq/power-plant-map/blob/master/docs/replication_guide.md" rel="noreferrer">복제(확산) 가이드</a></footer>
</main></body></html>`
}

// ---------- 발전소 페이지 ----------
function plantBody(p) {
  const icon = FUEL_ICONS[p.fuelCat] || '⚡'
  const title = pageTitle(p)
  const units = p.units || []
  const region = regionBySigungu.get(`${p.sido}|${p.sigungu}`) ||
    [...regionBySigungu.values()].find(r => r.sido === p.sido && (p.sigungu || '').startsWith(r.sigungu))
  const subsidy = p.status === '운영중' && ['원자력', '석탄'].includes(p.fuelCat)
    ? SUBSIDY_CASES.find(c => c.re.test(p.name)) : null

  const unitRows = units.map(u => {
    const rep = (u.replacements || []).map(r => {
      const dst = byName.get(r.to.split('#')[0]) || byName.get(r.to)
      const label = `${esc(r.to)}${r.planned ? ` (${esc(r.planned)})` : ''}`
      return dst ? `<a href="/plant/${encodeURI(slugOf.get(dst.id))}/">${label}</a>` : label
    }).join(', ')
    return `<tr><td>${esc(u.label || '-')}</td><td>${u.mw.toLocaleString()}</td><td>${esc(u.completed || '-')}</td>
<td>${u.retire ? `${u.retire.year}년 (${esc(u.retire.type)})` : '—'}</td><td>${rep || '—'}</td></tr>`
  }).join('\n')

  const neighbors = plants
    .filter(x => x.id !== p.id && x.sido === p.sido && x.sigungu === p.sigungu && x.totalMw >= 10)
    .sort((a, b) => b.totalMw - a.totalMw).slice(0, 8)

  const localTop = region ? region.programs.slice(0, 4) : []

  return `
<h1>${icon} ${esc(title)}</h1>
<p class="sub">${esc(p.fuelCat)} · ${esc(p.status)}${p.company ? ` · ${esc(p.company)}` : ''} · ${esc(p.addressDetail || p.address || '위치 미정')}</p>
<a class="cta" href="/?plant=${esc(p.id)}">🗺️ 지도에서 위치 보기</a>
${hrNames.has(p.companyGroup) ? ` <a href="/jobs/${encodeURI(sanitize(p.companyGroup))}/">💼 ${esc(p.companyGroup)} 채용·연봉 정보</a>` : ''}

<div class="facts">
<div><span class="k">설비용량</span><br /><b>${p.totalMw.toLocaleString()} MW${p.mwEstimated ? ' (추정)' : ''}</b></div>
<div><span class="k">상태</span><br /><b>${esc(p.status)}</b></div>
${p.gen ? `<div><span class="k">발전량 (${esc(String(p.gen.year))})</span><br /><b>${Math.round(p.gen.gwh).toLocaleString()} GWh</b></div>
<div><span class="k">이용률</span><br /><b>${p.gen.cf}%</b></div>` : ''}
${p.firstRetireYear ? `<div><span class="k">호기 폐지 시작</span><br /><b>${p.firstRetireYear}년</b></div>` : ''}
${p.planned ? `<div><span class="k">${p.status === '폐지완료' ? '폐지' : '준공 예정'}</span><br /><b>${esc(p.planned.when)}</b></div>` : ''}
</div>
${p.firstRetireYear || p.planned ? `<div class="warn">폐지·대체·준공 시기는 제11차 전력수급기본계획 등 계획 기준이며 인허가·공정에 따라 변동될 수 있습니다.</div>` : ''}

${units.length ? `<h2>호기별 현황</h2>
<div class="tbl"><table><thead><tr><th>호기</th><th>MW</th><th>준공</th><th>폐지 예정</th><th>대체 설비</th></tr></thead>
<tbody>${unitRows}</tbody></table></div>` : ''}

${subsidy ? `<h2>주변지역 전기요금 보조 (발주법)</h2>
<div class="good">이 발전소 반경 5km 주변 읍·면·동 거주 세대는 <b>${esc(subsidy.amount)}</b> 수준의 전기요금 보조를 받습니다 (${esc(subsidy.year)} 확정 사례, 한전 고지서 자동 감면·신청 불필요). 정확한 금액은 한전 고지서와 발전본부 공지로 확인하세요.</div>` : ''}

${localTop.length ? `<h2>${esc(p.sido)} ${esc(p.sigungu)} 전입·정착 혜택${region.depopulation ? ' <small>(행안부 인구감소지역)</small>' : ''}</h2>
<div class="tbl"><table><thead><tr><th>구분</th><th>시책</th><th>지원 내용</th></tr></thead><tbody>
${localTop.map(pr => `<tr><td>${esc(pr.category)}</td><td>${esc(pr.name)}</td><td>${esc(pr.amount)}</td></tr>`).join('\n')}
</tbody></table></div>
<p><a href="/region/${encodeURI(regionSlug(region))}/">→ ${esc(p.sigungu)} 전체 혜택 보기 (${region.programs.length}개 시책)</a></p>` : ''}

${neighbors.length ? `<h2>같은 지역의 다른 발전소</h2>
<p class="tags">${neighbors.map(n => `<a href="/plant/${encodeURI(slugOf.get(n.id))}/">${FUEL_ICONS[n.fuelCat] || '⚡'} ${esc(n.name)} (${fmtMw(n.totalMw)})</a>`).join(' ')}</p>` : ''}`
}

function plantDesc(p) {
  const bits = [`${pageTitle(p)} 정보`, `설비용량 ${p.totalMw.toLocaleString()}MW`]
  if (p.company) bits.push(`운영 ${p.company}`)
  bits.push(`위치 ${p.addressDetail || p.address || '미정'}`)
  if (p.firstRetireYear) bits.push(`${p.firstRetireYear}년부터 호기 폐지 예정`)
  else if (p.planned) bits.push(`${p.planned.when} ${p.status === '폐지완료' ? '폐지' : '준공 예정'}`)
  bits.push('호기별 일정과 주변지역 지원금·전입 혜택까지 한눈에')
  return bits.join(' · ').slice(0, 155)
}

// ---------- 지역 페이지 ----------
function regionBody(r) {
  const zoneList = (zoneMuni.get(`${r.sido}|${r.sigungu}`) || []).sort((a, b) => a.name.localeCompare(b.name))
  const inRegion = plants
    .filter(p => p.sido === r.sido && ((p.sigungu || '') === r.sigungu || (p.sigungu || '').startsWith(r.sigungu)) && p.totalMw >= 10)
    .sort((a, b) => b.totalMw - a.totalMw)
  const catOrder = ['전입정착', '출산육아', '주거', '청년일자리', '기타']
  const cats = catOrder.map(c => ({ c, items: r.programs.filter(x => x.category === c) })).filter(g => g.items.length)
  return `
<h1>🏡 ${esc(r.sido)} ${esc(r.sigungu)} — 발전소 현황과 전입·정착 혜택</h1>
<p class="sub">${inRegion.length ? `발전소 ${inRegion.length}곳(10MW 이상) 소재` : '발전소 소재 지역'} · 지자체 지원 시책 ${r.programs.length}개${r.depopulation ? ' · 행안부 인구감소지역' : ''}</p>
<a class="cta" href="/">🗺️ 지도에서 이 지역 발전소 보기</a>
${r.depopulation ? `<div class="good">행정안전부 지정 <b>인구감소지역</b>으로 전입·정착 지원이 두터운 지역입니다. 발전소 주변지역 지원(전기요금 보조 등)과 별개로 중복 수혜가 가능합니다.</div>` : ''}

${zoneList.length ? `<h2>발주법 주변지역 해당 읍·면·동 (${zoneList.length}곳)</h2>
<p class="sub">발전기 반경 5km가 걸치는 읍·면·동 — 기본지원사업·전기요금 보조 대상입니다.</p>
<p class="tags">${zoneList.map(z => (zoneSlugSet.has(sanitize(`${r.sido}-${r.sigungu}-${z.name}`))
    ? `<a href="/zone/${encodeURI(sanitize(`${r.sido}-${r.sigungu}-${z.name}`))}/">${esc(z.name)}</a>`
    : `<span class="k">${esc(z.name)}</span>`)).join(' ')}</p>
<p><a href="/?tab=benefit">→ 우리 동네 혜택 직접 조회하기</a></p>` : ''}

${cats.length ? cats.map(g => `<h2>${esc(g.c === '청년일자리' ? '청년·일자리' : g.c === '출산육아' ? '출산·육아' : g.c === '전입정착' ? '전입·정착' : g.c)} 지원</h2>
<div class="tbl"><table><thead><tr><th>시책</th><th>지원 내용</th><th>조건</th></tr></thead><tbody>
${g.items.map(pr => `<tr><td>${esc(pr.name)}</td><td>${esc(pr.amount)}</td><td>${esc(pr.condition || '-')}</td></tr>`).join('\n')}
</tbody></table></div>`).join('\n')
  : `<h2>전입·정착 지원 시책</h2>
<div class="warn">${esc(r.sigungu)}의 전입·정착 지원 시책은 아직 조사 중입니다. 발전소 주변지역 지원(기본지원사업·전기요금 보조)과 별개로 지자체 자체 시책이 있을 수 있으니 ${esc(r.sigungu)}청에 확인하세요. 조사되는 대로 이 페이지에 반영됩니다.</div>`}
${cats.length ? '<div class="warn">지자체 조례·공고 기준(2026-07 조사)이며 예산 소진·조례 개정으로 변동될 수 있습니다. 신청 자격은 해당 시·군·구청에 확인하세요.</div>' : ''}

${inRegion.length ? `<h2>이 지역의 발전소</h2>
<p class="tags">${inRegion.slice(0, 20).map(p => `<a href="/plant/${encodeURI(slugOf.get(p.id))}/">${FUEL_ICONS[p.fuelCat] || '⚡'} ${esc(p.name)} (${fmtMw(p.totalMw)}·${esc(p.status)})</a>`).join(' ')}</p>` : ''}`
}

// ---------- 생성 ----------
let n = 0
const urls = [`${SITE}/`]

// 발전소 페이지
for (const p of plants) {
  const slug = slugOf.get(p.id)
  const dir = join(DIST, 'plant', slug)
  mkdirSync(dir, { recursive: true })
  const path = `/plant/${slug}/`
  writeFileSync(join(dir, 'index.html'), shell({
    title: `${pageTitle(p)} — 용량·호기·일정·주변 혜택 | 우리동네 발전소`,
    desc: plantDesc(p),
    path,
    breadcrumbs: [['우리동네 발전소', '/'], ['발전소', '/plant/'], [p.name, null]],
    body: plantBody(p),
    extraLd: [{
      '@context': 'https://schema.org',
      '@type': 'Place',
      name: pageTitle(p),
      description: plantDesc(p),
      url: SITE + encodeURI(path),
      address: {
        '@type': 'PostalAddress',
        streetAddress: p.addressDetail || p.address || '',
        addressRegion: p.sido || '',
        addressLocality: p.sigungu || '',
        addressCountry: 'KR',
      },
      ...(p.lat != null && p.lng != null
        ? { geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng } }
        : {}),
    }],
  }))
  urls.push(SITE + encodeURI(path))
  n++
}

// ---------- 지역(시군구) 페이지 ----------
// 기존에는 '시책 데이터가 있는 73개'만 생성했다. 그런데 주변지역 읍면동을 가진 시군구는
// 173개여서, 100개 시군구가 '발전소 주변지역인데 페이지가 없는' 상태였다.
// 시책이 없는 곳은 시책 섹션을 생략하고 주변지역 판정·발전소 목록으로 채운다(빈 페이지 방지).
const zoneMuni = new Map() // "시도|시군구" -> [{code,name,hits}]
if (zonesData) {
  const info = new Map()
  for (const [sido, munis] of Object.entries(zonesData.tree || {})) {
    for (const [sigungu, list] of Object.entries(munis)) {
      for (const [code, name] of list) info.set(code, { sido, sigungu, name })
    }
  }
  for (const [code, hits] of Object.entries(zonesData.zones || {})) {
    const i = info.get(code)
    if (!i) continue
    const k = `${i.sido}|${i.sigungu}`
    if (!zoneMuni.has(k)) zoneMuni.set(k, [])
    zoneMuni.get(k).push({ code, name: i.name, hits })
  }
}
// /zone/ 페이지가 생성될 읍면동의 슬러그 — region 페이지에서 링크 가능 여부 판정에 쓴다.
// 생성 기준(원자력·석탄 인접)은 아래 zone 생성 루프와 반드시 동일하게 유지할 것.
const zoneSlugSet = new Set()
for (const [k, list] of zoneMuni) {
  const [sd, sgg] = k.split('|')
  for (const z of list) {
    if (z.hits.some(h => h.fuelCat === '원자력' || (h.fuelCat === '석탄' && h.mw >= 500))) {
      zoneSlugSet.add(sanitize(`${sd}-${sgg}-${z.name}`))
    }
  }
}

const regionsAll = [...regions]
const haveRegion = new Set(regions.map(r => `${r.sido}|${r.sigungu}`))
for (const k of zoneMuni.keys()) {
  if (haveRegion.has(k)) continue
  const [sido, sigungu] = k.split('|')
  regionsAll.push({ sido, sigungu, programs: [], depopulation: false, _zoneOnly: true })
}

for (const r of regionsAll) {
  const slug = regionSlug(r)
  const dir = join(DIST, 'region', slug)
  mkdirSync(dir, { recursive: true })
  const path = `/region/${slug}/`
  writeFileSync(join(dir, 'index.html'), shell({
    title: `${r.sido} ${r.sigungu} 발전소·전입 지원 혜택 총정리 | 우리동네 발전소`,
    desc: `${r.sido} ${r.sigungu}의 발전소 현황과 전입지원금·출산장려금·주거 지원 등 지자체 시책 ${r.programs.length}개${r.depopulation ? ' (인구감소지역)' : ''} — 발전소 주변지역 지원금과 중복 수혜 가능 여부까지 정리.`,
    path,
    breadcrumbs: [['우리동네 발전소', '/'], ['지역별 혜택', '/region/'], [`${r.sido} ${r.sigungu}`, null]],
    body: regionBody(r),
    extraLd: [{
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `${r.sido} ${r.sigungu} 전입·정착 지원 시책`,
      description: `${r.sido} ${r.sigungu}의 전입지원금·출산장려금·주거·청년 지원 등 지자체 시책 ${r.programs.length}건 — 각 시군구청 공식 홈페이지 기준.`,
      url: SITE + encodeURI(path),
      dateModified: localData.updatedAt,
      spatialCoverage: `${r.sido} ${r.sigungu}`,
      creator: { '@type': 'Organization', name: '우리동네 발전소', url: SITE },
      license: 'https://github.com/asadobbq/power-plant-map/blob/master/docs/data_licenses.md',
    }],
  }))
  urls.push(SITE + encodeURI(path))
  n++
}

// 연료원별 허브는 2곳 이상인 연료만 생성한다 — 시도 허브가 존재하지 않는 허브로 링크하지 않도록 먼저 집계
const fuelCount = {}
for (const p of plants) fuelCount[p.fuelCat || '기타'] = (fuelCount[p.fuelCat || '기타'] || 0) + 1
const fuelHubSet = new Set(Object.entries(fuelCount).filter(([f, c]) => f && f !== '기타' && c >= 2).map(([f]) => f))

// ---------- 시도별 허브 ----------
// 기존에는 목록 인덱스가 totalMw>=10 만 담아 10MW 미만 설비 다수가 내부링크 0개인
// '고아 페이지'였다(사이트맵에만 존재 → 크롤러가 저품질로 판단해 색인 보류).
// 시도 허브를 신설해 모든 발전소가 최소 1개의 내부링크를 갖도록 한다.
const bySidoAll = {}
for (const p of plants) (bySidoAll[p.sido || '기타'] ||= []).push(p)
const sidoSlug = sido => sanitize(sido)
const byCap = (a, b) => b.totalMw - a.totalMw
const sumMw = ps => ps.reduce((x, p) => x + p.totalMw, 0)
const plantLink = p => `<a href="/plant/${encodeURI(slugOf.get(p.id))}/">${FUEL_ICONS[p.fuelCat] || '⚡'} ${esc(p.name)} (${fmtMw(p.totalMw)})</a>`

for (const [sido, list] of Object.entries(bySidoAll)) {
  if (!sido || sido === '기타') continue
  const big = list.filter(p => p.totalMw >= 10).sort(byCap)
  const small = list.filter(p => p.totalMw < 10).sort(byCap)
  const totalMw = sumMw(list)
  const regionsHere = regions.filter(r => r.sido === sido)
  const path = `/plant/sido/${sidoSlug(sido)}/`
  const dir = join(DIST, 'plant', 'sido', sidoSlug(sido))
  mkdirSync(dir, { recursive: true })
  const fuelGroups = Object.entries(list.reduce((m, p) => { (m[p.fuelCat] ||= []).push(p); return m }, {}))
    .sort((a, b) => sumMw(b[1]) - sumMw(a[1]))
  const body = `
<h1>⚡ ${esc(sido)} 발전소 목록 — ${list.length}곳 ${fmtMw(totalMw)}</h1>
<p class="sub">${esc(sido)}에 있는 발전소 ${list.length}곳(설비용량 합계 ${totalMw.toLocaleString()}MW)의 용량·운영사·상태. 클릭하면 호기별 폐지 일정과 주변지역 혜택을 볼 수 있습니다.</p>
<a class="cta" href="/">🗺️ 지도에서 ${esc(sido)} 보기</a>

<h2>연료원별 구성</h2>
<div class="tbl"><table><thead><tr><th>연료</th><th>발전소</th><th>설비용량</th></tr></thead><tbody>
${fuelGroups.map(([f, ps]) => `<tr><td>${FUEL_ICONS[f] || '⚡'} ${fuelHubSet.has(f) ? `<a href="/plant/fuel/${encodeURI(sanitize(f))}/">${esc(f)}</a>` : esc(f)}</td><td>${ps.length}곳</td><td>${sumMw(ps).toLocaleString()} MW</td></tr>`).join('\n')}
</tbody></table></div>

${big.length ? `<h2>주요 발전소 (10MW 이상 · ${big.length}곳)</h2>
<div class="tbl"><table><thead><tr><th>발전소</th><th>연료</th><th>용량</th><th>상태</th><th>운영사</th></tr></thead><tbody>
${big.map(p => `<tr><td><a href="/plant/${encodeURI(slugOf.get(p.id))}/">${esc(p.name)}</a></td><td>${FUEL_ICONS[p.fuelCat] || '⚡'} ${esc(p.fuelCat)}</td><td>${p.totalMw.toLocaleString()} MW</td><td>${esc(p.status)}</td><td>${esc(p.company || '-')}</td></tr>`).join('\n')}
</tbody></table></div>` : ''}

${small.length ? `<h2>소규모 설비 (10MW 미만 · ${small.length}곳)</h2>
<p class="sub">소수력·소규모 풍력 등. 발주법 주변지역 지원 판정에서는 제외되는 규모입니다.</p>
<p class="tags">${small.map(plantLink).join(' ')}</p>` : ''}

${regionsHere.length ? `<h2>${esc(sido)} 지역별 혜택</h2>
<p class="tags">${regionsHere.map(r => `<a href="/region/${encodeURI(regionSlug(r))}/">🏡 ${esc(r.sigungu)}${r.depopulation ? ' (인구감소지역)' : ''}</a>`).join(' ')}</p>` : ''}
<p><a href="/plant/">← 전국 발전소 목록</a></p>`
  writeFileSync(join(dir, 'index.html'), shell({
    title: `${sido} 발전소 목록 — ${list.length}곳 용량·폐지 일정 | 우리동네 발전소`,
    desc: `${sido}의 발전소 ${list.length}곳(합계 ${totalMw.toLocaleString()}MW) 목록 — 원자력·석탄·LNG·수력·풍력별 설비용량과 운영사, 호기별 폐지 일정, 주변지역 지원 혜택까지.`.slice(0, 155),
    path, breadcrumbs: [['우리동네 발전소', '/'], ['발전소', '/plant/'], [sido, null]], body,
  }))
  urls.push(SITE + encodeURI(path))
  n++
}

// ---------- 연료원별 허브 ----------
// '전국 원자력발전소 목록', '석탄화력 폐지 일정', '양수발전소 위치' 류 카테고리 질의 대응
const byFuel = {}
for (const p of plants) (byFuel[p.fuelCat || '기타'] ||= []).push(p)
// 기본지원사업 단가는 발주법 시행령 별표2(2017.12.26 개정) — BenefitPanel.tsx RATES 와 동일 근거
const FUEL_NOTE = {
  원자력: '발주법 시행령 별표2 기본지원사업 단가 0.25원/kWh — 전 연료 중 최고. 주변지역 지원 규모가 가장 큽니다.',
  석탄: '단가 0.18원/kWh. 제11차 전력수급기본계획에 따라 2038년까지 순차 폐지되며, 폐지되면 지원금도 함께 줄어듭니다.',
  LNG: '단가 0.10원/kWh. 석탄 폐지 대체 설비로 신규 건설이 집중되고 있습니다.',
  유류: '단가 0.15원/kWh. 도서 지역 내연발전이 다수입니다.',
  수력: '단가 0.20원/kWh + 설비용량 단가(10MW 초과분).',
  양수: '단가 0.20원/kWh + 설비용량 단가. 재생에너지 변동성 대응으로 신규 건설이 추진 중입니다.',
  풍력: '단가 0.10원/kWh.',
  바이오: '단가 0.10원/kWh.',
  해양: '단가 0.20원/kWh.',
}
for (const [fuel, list] of Object.entries(byFuel)) {
  if (!fuel || list.length < 2) continue
  const sorted = [...list].sort(byCap)
  const totalMw = sumMw(list)
  const retiring = sorted.filter(p => p.firstRetireYear)
  const building = sorted.filter(p => p.status !== '운영중' && p.status !== '폐지완료')
  const path = `/plant/fuel/${sanitize(fuel)}/`
  const dir = join(DIST, 'plant', 'fuel', sanitize(fuel))
  mkdirSync(dir, { recursive: true })
  const bySidoF = Object.entries(sorted.reduce((m, p) => { (m[p.sido || '기타'] ||= []).push(p); return m }, {}))
    .sort((a, b) => sumMw(b[1]) - sumMw(a[1]))
  const body = `
<h1>${FUEL_ICONS[fuel] || '⚡'} 전국 ${esc(fuel)} 발전소 목록 — ${list.length}곳 ${fmtMw(totalMw)}</h1>
<p class="sub">전국 ${esc(fuel)} 발전소 ${list.length}곳(합계 ${totalMw.toLocaleString()}MW)의 위치·용량·운영사·폐지 일정.</p>
<a class="cta" href="/">🗺️ 지도에서 보기</a>
${FUEL_NOTE[fuel] ? `<div class="good">${esc(FUEL_NOTE[fuel])}</div>` : ''}

<h2>시도별 분포</h2>
<div class="tbl"><table><thead><tr><th>시도</th><th>발전소</th><th>설비용량</th></tr></thead><tbody>
${bySidoF.map(([sd, ps]) => `<tr><td>${sd && sd !== '기타' ? `<a href="/plant/sido/${encodeURI(sidoSlug(sd))}/">${esc(sd)}</a>` : esc(sd)}</td><td>${ps.length}곳</td><td>${sumMw(ps).toLocaleString()} MW</td></tr>`).join('\n')}
</tbody></table></div>

${retiring.length ? `<h2>폐지 예정 ${esc(fuel)} 발전소 (${retiring.length}곳)</h2>
<div class="tbl"><table><thead><tr><th>발전소</th><th>지역</th><th>용량</th><th>폐지 시작</th></tr></thead><tbody>
${[...retiring].sort((a, b) => a.firstRetireYear - b.firstRetireYear).map(p => `<tr><td><a href="/plant/${encodeURI(slugOf.get(p.id))}/">${esc(p.name)}</a></td><td>${esc(p.sido)} ${esc(p.sigungu)}</td><td>${p.totalMw.toLocaleString()} MW</td><td>${p.firstRetireYear}년</td></tr>`).join('\n')}
</tbody></table></div>
<p><a href="/topic/석탄화력-폐지-일정/">→ 폐지·대체 전체 일정 보기</a></p>` : ''}

${building.length ? `<h2>건설·추진 중 (${building.length}곳)</h2>
<div class="tbl"><table><thead><tr><th>발전소</th><th>지역</th><th>용량</th><th>상태</th><th>준공 목표</th></tr></thead><tbody>
${building.map(p => `<tr><td><a href="/plant/${encodeURI(slugOf.get(p.id))}/">${esc(p.name)}</a></td><td>${esc(p.sido)} ${esc(p.sigungu)}</td><td>${p.totalMw.toLocaleString()} MW</td><td>${esc(p.status)}</td><td>${esc(p.planned?.when || '-')}</td></tr>`).join('\n')}
</tbody></table></div>` : ''}

<h2>전체 목록 (용량순)</h2>
<p class="tags">${sorted.map(plantLink).join(' ')}</p>
<p><a href="/plant/">← 전국 발전소 목록</a></p>`
  writeFileSync(join(dir, 'index.html'), shell({
    title: `전국 ${fuel} 발전소 목록 ${list.length}곳 — 위치·용량·폐지 일정 | 우리동네 발전소`,
    desc: `전국 ${fuel} 발전소 ${list.length}곳(합계 ${totalMw.toLocaleString()}MW)의 위치·설비용량·운영사·폐지 일정과 주변지역 지원금 단가 안내.`.slice(0, 155),
    path, breadcrumbs: [['우리동네 발전소', '/'], ['발전소', '/plant/'], [`${fuel} 발전소`, null]], body,
  }))
  urls.push(SITE + encodeURI(path))
  n++
}

// 목록 인덱스 페이지
const plantIndexBody = `
<h1>전국 발전소 목록</h1>
<p class="sub">운영·건설·계획·폐지 ${plants.length}개 발전소 — 클릭하면 용량·호기·폐지 일정·주변 혜택 상세를 볼 수 있습니다.</p>
<a class="cta" href="/">🗺️ 지도로 보기</a>
<h2>연료원별</h2>
<p class="tags">${Object.entries(byFuel).filter(([f, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length)
    .map(([f, l]) => `<a href="/plant/fuel/${encodeURI(sanitize(f))}/">${FUEL_ICONS[f] || '⚡'} ${esc(f)} (${l.length})</a>`).join(' ')}</p>
<h2>시도별</h2>
<p class="tags">${Object.keys(bySidoAll).filter(x => x && x !== '기타').sort()
    .map(sd => `<a href="/plant/sido/${encodeURI(sidoSlug(sd))}/">${esc(sd)} (${bySidoAll[sd].length})</a>`).join(' ')}</p>
${Object.entries(bySidoAll).sort().map(([sido, list]) => `<h2>${esc(sido)} (${list.length})</h2>
<p class="tags">${[...list].sort(byCap).map(plantLink).join(' ')}</p>`).join('\n')}`
mkdirSync(join(DIST, 'plant'), { recursive: true })
writeFileSync(join(DIST, 'plant', 'index.html'), shell({
  title: '전국 발전소 목록 — 원자력·석탄·LNG·수력·풍력 | 우리동네 발전소',
  desc: `전국 발전소 ${plants.length}곳의 설비용량·운영사·호기별 준공·폐지 일정·주변지역 혜택 정보. 시도별 목록.`,
  path: '/plant/', breadcrumbs: [['우리동네 발전소', '/'], ['발전소', null]], body: plantIndexBody,
}))
urls.splice(1, 0, `${SITE}/plant/`)

const regionIndexBody = `
<h1>지역별 발전소 혜택 목록</h1>
<p class="sub">발전소 주변지역에 해당하는 ${regionsAll.length}개 시군구의 주변지역 판정과 전입·정착·출산·주거 지원 시책 모음 (인구감소지역 표시)</p>
<p class="tags">${[...regionsAll].sort((a, b) => (a.sido + a.sigungu).localeCompare(b.sido + b.sigungu)).map(r => `<a href="/region/${encodeURI(regionSlug(r))}/">${esc(r.sido)} ${esc(r.sigungu)}${r.depopulation ? ' 🏡' : ''}${r.programs.length ? ` (${r.programs.length})` : ''}</a>`).join(' ')}</p>
<p class="sub">🏡 = 행안부 인구감소지역 · 괄호 안은 조사된 지자체 시책 수</p>`
mkdirSync(join(DIST, 'region'), { recursive: true })
writeFileSync(join(DIST, 'region', 'index.html'), shell({
  title: '지역별 발전소 전입·정착 혜택 목록 | 우리동네 발전소',
  desc: `발전소 주변지역 ${regionsAll.length}개 시군구의 주변지역 판정·전입지원금·출산장려금·주거 지원 시책 총정리.`,
  path: '/region/', breadcrumbs: [['우리동네 발전소', '/'], ['지역별 혜택', null]], body: regionIndexBody,
}))
urls.splice(2, 0, `${SITE}/region/`)

// ---------- 읍면동 주변지역 판정 페이지 (/zone/) ----------
// 이 서비스의 최대 차별 자산('우리 동네가 발주법상 주변지역인가')이 그동안 SPA 셀렉트박스
// 안에서만 동작해 URL이 하나도 없었다 → 검색엔진이 접근할 방법이 없었다.
// 저품질 대량생성(도어웨이)을 피하려고 전 1,351개가 아니라, 고유 정보량이 충분한
// 구간만 생성한다: 연간 기본지원사업비 추정이 유의미하거나(원자력·석탄 인접) 발전소 2곳 이상.
let zonePages = 0
if (zonesData) {
  // 기본지원사업 단가 (원/kWh) — 발주법 시행령 별표2(2017.12.26 개정). BenefitPanel.tsx RATES 와 동일 근거
  const RATES = { 원자력: 0.25, 석탄: 0.18, LNG: 0.1, 유류: 0.15, 수력: 0.2, 양수: 0.2, 해양: 0.2, 풍력: 0.1, 바이오: 0.1 }
  const CAP_RATES = { 양수: 0.005, 수력: 0.05 }
  const plantById = new Map(plants.map(p => [p.id, p]))

  /** 연간 기본지원사업비 추정(원) — 발전량 기준 + 일부 연료의 설비용량 단가 */
  function estimateAnnual(fuelCat, mw, gwh) {
    const rate = RATES[fuelCat]
    if (rate == null) return null
    const energy = gwh != null ? gwh * 1e6 : mw * 8760 * 1000 * 0.4 // kWh (발전량 없으면 이용률 40% 가정)
    const capPart = (CAP_RATES[fuelCat] ?? 0) * (fuelCat === '수력' && mw <= 10 ? 0 : mw) * 8760 * 1000
    return energy * rate + capPart
  }
  const eok = won => (won >= 1e8 ? (won / 1e8).toFixed(1).replace(/\.0$/, '') + '억원' : Math.round(won / 1e4).toLocaleString() + '만원')

  // code -> {sido, sigungu, name}
  const emdInfo = new Map()
  for (const [sido, munis] of Object.entries(zonesData.tree || {})) {
    for (const [sigungu, list] of Object.entries(munis)) {
      for (const [code, name] of list) emdInfo.set(code, { sido, sigungu, name })
    }
  }

  const zoneEntries = []
  for (const [code, hits] of Object.entries(zonesData.zones || {})) {
    const info = emdInfo.get(code)
    if (!info || !hits.length) continue
    const enriched = hits.map(h => {
      const p = plantById.get(h.id)
      const est = h.status === '운영중' ? estimateAnnual(h.fuelCat, h.mw, p?.gen?.gwh) : null
      return { ...h, plant: p, est }
    })
    const topEst = Math.max(0, ...enriched.map(h => h.est || 0))
    // 생성 기준: 원자력 또는 500MW 이상 석탄 인접 읍면동만.
    // - 기준을 넓히면 같은 시군구 형제 페이지의 본문 유사도가 0.66~0.85(8-gram 자카드 실측)로
    //   올라가 중복 콘텐츠·도어웨이 판정 위험이 커진다.
    // - '석탄 전체'로 잡으면 대구염색(72.9MW)·부산염색(19MW) 같은 산단 자가열병합 주변
    //   도심 읍면동 100여 곳이 "주변지역 해당"으로 단정되는데, 지원 규모가 미미해
    //   주민에게 부정확한 안내가 된다.
    // - 시군구 단위 수요는 /region/ 페이지(180개)가 받는다. 그쪽에는 주변지역 읍면동 전체 목록이 있다.
    const major = enriched.some(h => h.fuelCat === '원자력' || (h.fuelCat === '석탄' && h.mw >= 500))
    if (!major) continue
    zoneEntries.push({ code, ...info, hits: enriched, topEst })
  }

  const zoneSlug = z => sanitize(`${z.sido}-${z.sigungu}-${z.name}`)
  const zoneSeen = new Set()
  for (const z of zoneEntries) {
    let slug = zoneSlug(z)
    if (zoneSeen.has(slug)) slug = `${slug}-${z.code}`
    zoneSeen.add(slug)
    const path = `/zone/${slug}/`
    const dir = join(DIST, 'zone', slug)
    mkdirSync(dir, { recursive: true })
    const sorted = [...z.hits].sort((a, b) => a.distKm - b.distKm)
    const nearest = sorted[0]
    const region = regionBySigungu.get(`${z.sido}|${z.sigungu}`)
    const subsidy = sorted.map(h => SUBSIDY_CASES.find(c => c.re.test(h.name))).find(Boolean)
    const siblings = zoneEntries.filter(o => o.code !== z.code && o.sido === z.sido && o.sigungu === z.sigungu).slice(0, 24)
    const body = `
<h1>🏡 ${esc(z.sido)} ${esc(z.sigungu)} ${esc(z.name)} — 발전소 주변지역 해당 여부</h1>
<p class="sub">발전소주변지역 지원에 관한 법률(발주법) 제2조 기준 — 발전기 반경 5km가 걸치는 읍·면·동</p>
<div class="good"><b>✅ ${esc(z.name)}은 발전소 주변지역에 해당합니다(추정).</b><br />
가장 가까운 발전소: <b>${esc(nearest.name)}</b> 약 ${nearest.distKm}km${nearest.approx ? ' (발전소 대표좌표 근사 기준)' : ''}</div>
<a class="cta" href="/?tab=benefit&amp;emd=${encodeURIComponent(z.code)}">🏡 지도에서 우리 동네 혜택 자세히 보기</a>

<h2>반경 5km 이내 발전소 (${sorted.length}곳)</h2>
<div class="tbl"><table><thead><tr><th>발전소</th><th>연료</th><th>설비용량</th><th>상태</th><th>거리</th><th>연간 기본지원사업비(추정)</th></tr></thead><tbody>
${sorted.map(h => `<tr><td>${h.plant ? `<a href="/plant/${encodeURI(slugOf.get(h.plant.id))}/">${esc(h.name)}</a>` : esc(h.name)}</td><td>${FUEL_ICONS[h.fuelCat] || '⚡'} ${esc(h.fuelCat)}</td><td>${h.mw.toLocaleString()} MW</td><td>${esc(h.status)}</td><td>약 ${h.distKm}km</td><td>${h.est ? '약 ' + eok(h.est) : '—'}</td></tr>`).join('\n')}
</tbody></table></div>
<p class="sub">기본지원사업비는 발주법 시행령 별표2 단가(원자력 0.25 · 유연탄 0.18 · 유류 0.15 · 수력/양수/해양 0.20 · LNG/풍력/바이오 0.10 원·kWh)에 발전량을 곱한 <b>발전소 단위 총액 추정</b>입니다. 개별 세대 지급액이 아니며, 실제 배분은 발전소주변지역 지원사업 심의를 거쳐 결정됩니다.</p>

${subsidy ? `<h2>전기요금 보조 확정 사례</h2>
<div class="good">이 지역 주변 세대는 <b>${esc(subsidy.amount)}</b> 수준의 전기요금 보조를 받습니다 (${esc(subsidy.year)} 확정 사례). 한전 고지서에서 자동 감면되며 별도 신청이 필요 없습니다. 정확한 금액은 고지서와 발전본부 공지로 확인하세요.</div>` : ''}

<h2>주변지역이면 받을 수 있는 것</h2>
<div class="tbl"><table><thead><tr><th>구분</th><th>내용</th><th>근거</th></tr></thead><tbody>
<tr><td>기본지원사업</td><td>발전량에 비례한 지원금이 해당 시·군·구에 배분되어 주민 복지·소득증대·육영사업 등에 쓰입니다</td><td>발주법 제10조</td></tr>
<tr><td>특별지원사업</td><td>발전소 건설 시 총사업비의 일정 비율을 주변지역에 지원</td><td>발주법 제11조</td></tr>
<tr><td>전기요금 보조</td><td>주변지역 세대의 전기요금 일부 감면(고지서 자동 적용)</td><td>발주법 제10조·시행령</td></tr>
<tr><td>지역기업 우대</td><td>발전사 공사·물품·용역 계약에서 주변지역 소재 기업 우대(제한경쟁·가산점)</td><td><a href="/topic/지역기업-우대/">발주법 제17조의2</a></td></tr>
</tbody></table></div>

${region && region.programs.length ? `<h2>${esc(z.sigungu)} 전입·정착 지원 시책 (${region.programs.length}개)</h2>
<div class="tbl"><table><thead><tr><th>구분</th><th>시책</th><th>지원 내용</th></tr></thead><tbody>
${region.programs.slice(0, 6).map(pr => `<tr><td>${esc(pr.category)}</td><td>${esc(pr.name)}</td><td>${esc(pr.amount)}</td></tr>`).join('\n')}
</tbody></table></div>
<p><a href="/region/${encodeURI(regionSlug(region))}/">→ ${esc(z.sigungu)} 전체 혜택 보기</a></p>` : ''}

${siblings.length ? `<h2>${esc(z.sigungu)}의 다른 주변지역 읍·면·동</h2>
<p class="tags">${siblings.map(o => `<a href="/zone/${encodeURI(sanitize(`${o.sido}-${o.sigungu}-${o.name}`))}/">${esc(o.name)}</a>`).join(' ')}</p>` : ''}

<div class="warn">${esc(zonesData.note)}</div>
<p><a href="/zone/">← 주변지역 읍면동 전체 목록</a>${region ? ` · <a href="/region/${encodeURI(regionSlug(region))}/">${esc(z.sigungu)} 전입·정착 혜택</a>` : ''}</p>`
    writeFileSync(join(dir, 'index.html'), shell({
      title: `${z.sigungu} ${z.name} 발전소 주변지역 해당 여부 — 지원금·전기요금 보조 | 우리동네 발전소`,
      desc: `${z.sido} ${z.sigungu} ${z.name}은 ${nearest.name} 반경 5km 주변지역에 해당(추정). 발주법 기본지원사업·특별지원사업·전기요금 보조와 ${z.sigungu} 전입 지원 시책을 한 번에 확인하세요.`.slice(0, 155),
      path,
      breadcrumbs: [['우리동네 발전소', '/'], ['주변지역 판정', '/zone/'], [`${z.sigungu} ${z.name}`, null]],
      body,
      extraLd: [{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [{
          '@type': 'Question',
          name: `${z.sido} ${z.sigungu} ${z.name}은 발전소 주변지역인가요?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `${z.name}은 ${nearest.name}(${nearest.fuelCat}, ${nearest.mw.toLocaleString()}MW)에서 약 ${nearest.distKm}km 거리로, 발전소주변지역 지원에 관한 법률 제2조의 '발전기 설치지점 반경 5km 이내가 걸치는 읍·면·동'에 해당하는 것으로 추정됩니다. 발전소 대표좌표 기준 근사 판정이며 법적 판정이 아닙니다.`,
          },
        }],
      }],
    }))
    urls.push(SITE + encodeURI(path))
    zonePages++
  }

  // 주변지역 인덱스
  const byMuni = {}
  for (const z of zoneEntries) (byMuni[`${z.sido} ${z.sigungu}`] ||= []).push(z)
  const zoneIndexBody = `
<h1>🏡 발전소 주변지역 읍·면·동 목록</h1>
<p class="sub">발주법 제2조 기준(발전기 반경 5km가 걸치는 읍·면·동) 판정 결과 중 지원 규모가 큰 ${zoneEntries.length}개 읍면동 — 전체 판정 대상은 ${Object.keys(zonesData.zones).length}개입니다.</p>
<a class="cta" href="/?tab=benefit">🏡 우리 동네 직접 검색하기</a>
<div class="good">주변지역에 해당하면 기본지원사업·특별지원사업·전기요금 보조·지역기업 우대의 대상이 됩니다. 아래에 없는 동네도 <a href="/?tab=benefit">혜택 탭</a>에서 직접 조회할 수 있습니다.</div>
${Object.entries(byMuni).sort().map(([muni, list]) => `<h2>${esc(muni)} (${list.length})</h2>
<p class="tags">${list.sort((a, b) => a.name.localeCompare(b.name)).map(z => `<a href="/zone/${encodeURI(sanitize(`${z.sido}-${z.sigungu}-${z.name}`))}/">${esc(z.name)}</a>`).join(' ')}</p>`).join('\n')}`
  mkdirSync(join(DIST, 'zone'), { recursive: true })
  writeFileSync(join(DIST, 'zone', 'index.html'), shell({
    title: '발전소 주변지역 읍면동 목록 — 발주법 반경 5km 판정 | 우리동네 발전소',
    desc: `발전소주변지역 지원법(발주법) 기준으로 반경 5km에 걸치는 읍·면·동 판정 결과. 기본지원사업·전기요금 보조 대상 여부를 동네 단위로 확인하세요.`,
    path: '/zone/', breadcrumbs: [['우리동네 발전소', '/'], ['주변지역 판정', null]], body: zoneIndexBody,
  }))
  urls.splice(3, 0, `${SITE}/zone/`)
  zonePages++
}

// ---------- 일자리 페이지 (기관별 채용·보수 — 알리오 공시) ----------
const man = v => (v == null ? '—' : Math.round(v / 10).toLocaleString() + '만원')
const YEAR = new Date().getFullYear()

/** 검색 질의 대응용 영문 약칭 — "KOEN 채용", "KOSPO 연봉" 등 */
const EN_ABBR = {
  한전: 'KEPCO', 한수원: 'KHNP', 남동발전: 'KOEN', 중부발전: 'KOMIPO',
  서부발전: 'KOWEPO', 남부발전: 'KOSPO', 동서발전: 'EWP',
  지역난방공사: 'KDHC', 수자원공사: 'K-water', 한전KPS: 'KPS', 한전KDN: 'KDN',
}

/** 고용형태 → schema.org employmentType */
function empType(hire) {
  if (/인턴/.test(hire)) return 'INTERN'
  if (/정규직/.test(hire) && !/비정규직/.test(hire)) return 'FULL_TIME'
  if (/비정규직|기간제|계약|일용/.test(hire)) return 'TEMPORARY'
  return 'OTHER'
}

/** 공고 상세를 사람이 읽는 설명으로 — 구조화 데이터 description과 본문에 공용 */
function jobDescHtml(j) {
  const rows = [
    ['채용구분', j.kind], ['고용형태', j.hire], ['모집인원', j.count ? `${j.count}명` : ''],
    ['근무지', j.region], ['직무(NCS)', j.ncs], ['학력조건', j.edu],
    ['접수기간', j.start && j.end ? `${j.start} ~ ${j.end}` : j.end ? `~${j.end}` : ''],
    ['지원자격', j.qual], ['우대조건', j.pref], ['전형절차', j.steps],
  ].filter(([, v]) => v && String(v).trim())
  return rows.map(([k, v]) => `<p><b>${esc(k)}</b>: ${esc(String(v).replace(/\r?\n/g, ' / '))}</p>`).join('')
}

/** 공고 목록 표 (실제 공고 제목이 색인되도록 정적 HTML로 출력) */
function jobTable(list, withCompany) {
  if (!list.length) return ''
  return `<div class="tbl"><table><thead><tr>${withCompany ? '<th>기관</th>' : ''}<th>채용공고</th><th>구분</th><th>근무지</th><th>접수마감</th></tr></thead><tbody>
${list.map(j => `<tr>${withCompany ? `<td><a href="/jobs/${encodeURI(sanitize(j.company))}/">${esc(j.company)}</a></td>` : ''}<td><a href="${esc(j.url)}" rel="noreferrer nofollow">${esc(j.title)}</a></td><td>${esc(j.kind)}${j.hire ? ` · ${esc(j.hire)}` : ''}</td><td>${esc(j.region || '-')}</td><td>${esc(j.end || '-')}</td></tr>`).join('\n')}
</tbody></table></div>`
}

/** Google 채용정보(JobPosting) 구조화 데이터 — 마감 전 공고만, validThrough 명시 */
function jobPostingLd(j, fullInstName) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: j.title,
    description: jobDescHtml(j) || `<p>${esc(j.title)}</p>`,
    identifier: { '@type': 'PropertyValue', name: fullInstName || j.inst, value: String(j.sn ?? '') },
    datePosted: j.start || undefined,
    validThrough: j.end ? `${j.end}T23:59:59+09:00` : undefined,
    employmentType: empType(j.hire),
    hiringOrganization: { '@type': 'Organization', name: fullInstName || j.inst, sameAs: SITE + `/jobs/${encodeURI(sanitize(j.company))}/` },
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressRegion: (j.region || '대한민국').split(',')[0], addressCountry: 'KR' },
    },
    ...(j.count ? { totalJobOpenings: j.count } : {}),
    url: j.url || undefined,
  }
}

let jobsPages = 0
if (hrData) {
  const hrCos = hrData.companies

  function hrBody(c) {
    const latest = [...c.avgPay].filter(x => x.kind === '결산').sort((a, b) => b.year - a.year)[0]
    const payRows = [...c.avgPay].sort((a, b) => a.year - b.year)
      .map(x => `<tr><td>${x.year}년 (${esc(x.kind)})</td><td>${man(x.amount)}</td></tr>`).join('\n')
    const coPlants = plants
      .filter(p => p.companyGroup === c.name && p.totalMw >= 10)
      .sort((a, b) => b.totalMw - a.totalMw).slice(0, 14)
    const myJobs = openJobs.filter(j => j.company === c.name)
    const en = EN_ABBR[c.name] || ''
    return `
<h1>💼 ${esc(c.name)} 채용공고·연봉·임직원 정보 (${YEAR})</h1>
<p class="sub">${esc(c.full)}${en ? ` (${en})` : ''} · 본사 ${esc(c.hq)} · 진행 중 채용공고와 알리오(ALIO) 공시 연봉을 함께 확인하세요.</p>
<a class="cta" href="/?tab=jobs&co=${encodeURIComponent(c.name)}">💼 진행 중 채용공고 실시간 보기</a>

<h2>${esc(c.name)} 진행 중 채용공고 ${myJobs.length ? `(${myJobs.length}건)` : ''}</h2>
${myJobs.length
  ? jobTable(myJobs, false) +
    `<p class="sub">공고 제목을 누르면 ${esc(c.full)} 원문 공고로 이동합니다. 지원 자격·일정 등 확정 정보는 반드시 원문에서 확인하세요.</p>` +
    myJobs.map(j => `<div class="facts" style="grid-template-columns:1fr"><div><b>${esc(j.title)}</b>${jobDescHtml(j)}<p><a href="${esc(j.url)}" rel="noreferrer nofollow">원문 공고 보기 →</a></p></div></div>`).join('')
  : `<div class="warn">현재 진행 중인 ${esc(c.name)} 채용공고가 없습니다. 새 공고가 등록되면 자동으로 표시됩니다(6시간 주기 갱신). 지난 공고는 <a href="https://job.alio.go.kr" rel="noreferrer">잡알리오</a>에서 확인할 수 있습니다.</div>`}
<p class="sub">출처: 공공데이터포털 공공기관 채용정보(재정경제부)${jobsData?.updatedAt ? ` · ${esc(jobsData.updatedAt)} 기준` : ''}</p>

<div class="facts">
<div><span class="k">평균보수 (${latest ? latest.year + '년 결산' : '-'})</span><br /><b>${man(latest?.amount)}</b></div>
<div><span class="k">신입사원 초임 (2025)</span><br /><b>${man(c.newHire2025)}</b></div>
<div><span class="k">정규직 현원 (${esc(c.employees?.asOf || '-')})</span><br /><b>${c.employees?.regular != null ? Math.round(c.employees.regular).toLocaleString() + '명' : '—'}</b></div>
${c.tenure != null ? `<div><span class="k">평균 근속연수</span><br /><b>${c.tenure}년</b></div>` : ''}
</div>
<div class="warn">알리오 정기공시(일반정규직 기준) 수치로 개인별 실제 보수와 다를 수 있습니다. 2026년 예산은 경영평가 성과급 미확정(0 반영)으로 결산보다 낮게 표시됩니다. <a href="${esc(c.alioUrl || 'https://www.alio.go.kr')}" rel="noreferrer">알리오 공시 원문 보기</a></div>

<h2>연도별 평균보수 추이</h2>
<div class="tbl"><table><thead><tr><th>연도</th><th>1인당 평균보수</th></tr></thead><tbody>
${payRows}
</tbody></table></div>

<h2>채용 제도 — 지역인재 우대</h2>
<div class="good">발전 공공기관 대졸 신입 공채는 <b>본사이전 지역인재 30% 이상</b>(혁신도시법)·<b>비수도권 인재 35% 이상</b>(지방대육성법) 채용목표제를 운영합니다. 본사(${esc(c.hq)})·발전소 소재 지역 인재에게 실질적 기회가 있는 구조입니다(공고별 적용 여부는 원문 확인).</div>
<p>진행 중 공고는 <a href="/?tab=jobs&co=${encodeURIComponent(c.name)}">우리동네 발전소 일자리 탭</a>(매일 자동 수집) 또는 <a href="https://job.alio.go.kr" rel="noreferrer">잡알리오</a>에서 확인하세요.</p>

${coPlants.length ? `<h2>${esc(c.name)}이 운영하는 발전소</h2>
<p class="tags">${coPlants.map(p => `<a href="/plant/${encodeURI(slugOf.get(p.id))}/">${FUEL_ICONS[p.fuelCat] || '⚡'} ${esc(p.name)} (${fmtMw(p.totalMw)})</a>`).join(' ')}</p>` : ''}`
  }

  for (const c of hrCos) {
    const slug = sanitize(c.name)
    const dir = join(DIST, 'jobs', slug)
    mkdirSync(dir, { recursive: true })
    const path = `/jobs/${slug}/`
    const latest = [...c.avgPay].filter(x => x.kind === '결산').sort((a, b) => b.year - a.year)[0]
    const myJobs = openJobs.filter(j => j.company === c.name)
    const en = EN_ABBR[c.name] || ''
    writeFileSync(join(dir, 'index.html'), shell({
      title: `${c.name} 채용공고·연봉 ${YEAR} — 신입 초임·평균보수·임직원 수 | 우리동네 발전소`,
      desc: `${c.full}${en ? `(${en})` : ''} 진행 중 채용공고 ${myJobs.length}건과 평균 연봉 ${man(latest?.amount)}·신입 초임 ${man(c.newHire2025)}·정규직 ${c.employees?.regular != null ? Math.round(c.employees.regular).toLocaleString() + '명' : '-'}(알리오 공시). 본사 ${c.hq}, 지역인재 채용목표제 안내.`.slice(0, 155),
      path,
      breadcrumbs: [['우리동네 발전소', '/'], ['발전 공공기관 채용·연봉', '/jobs/'], [c.name, null]],
      body: hrBody(c),
      extraLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: c.full,
          alternateName: en ? [c.name, en] : c.name,
          url: SITE + encodeURI(path),
          address: { '@type': 'PostalAddress', addressLocality: c.hq, addressCountry: 'KR' },
          ...(c.employees?.regular != null
            ? { numberOfEmployees: { '@type': 'QuantitativeValue', value: Math.round(c.employees.regular) } }
            : {}),
        },
        // 진행 중 공고는 JobPosting으로 노출 — Google 채용정보 색인 대상
        ...myJobs.map(j => jobPostingLd(j, c.full)),
      ],
    }))
    urls.push(SITE + encodeURI(path))
    jobsPages++
  }

  // 일자리 인덱스
  const jobsIndexBody = `
<h1>💼 발전사 채용공고 모음 — 한전·한수원·발전5사 (${YEAR})</h1>
<p class="sub">발전 공공기관 ${hrCos.length}곳의 진행 중 채용공고 ${openJobs.length}건과 평균 연봉·신입 초임·정규직 인원(알리오 공시)을 한 곳에서. 발전공기업 취업 준비에 필요한 정보를 매일 자동 갱신합니다.</p>
<a class="cta" href="/?tab=jobs">💼 진행 중 채용공고 실시간 보기</a>

<h2>진행 중인 발전사 채용공고 ${openJobs.length ? `(${openJobs.length}건)` : ''}</h2>
${openJobs.length
  ? jobTable(openJobs, true) + `<p class="sub">공고 제목을 누르면 각 기관 원문 공고로 이동합니다. 출처: 공공데이터포털 공공기관 채용정보(재정경제부)${jobsData?.updatedAt ? ` · ${esc(jobsData.updatedAt)} 기준` : ''}</p>`
  : '<div class="warn">현재 진행 중인 공고가 없습니다. 새 공고가 등록되면 자동으로 표시됩니다.</div>'}

<h2>기관별 연봉·임직원 현황 (알리오 공시)</h2>
<div class="tbl"><table><thead><tr><th>기관</th><th>평균보수('25 결산)</th><th>신입 초임('25)</th><th>정규직 현원</th><th>본사</th></tr></thead><tbody>
${hrCos.map(c => {
    const latest = [...c.avgPay].filter(x => x.kind === '결산').sort((a, b) => b.year - a.year)[0]
    return `<tr><td><a href="/jobs/${encodeURI(sanitize(c.name))}/">${esc(c.name)}</a></td><td>${man(latest?.amount)}</td><td>${man(c.newHire2025)}</td><td>${c.employees?.regular != null ? Math.round(c.employees.regular).toLocaleString() + '명' : '—'}</td><td>${esc(c.hq)}</td></tr>`
  }).join('\n')}
</tbody></table></div>
<div class="good">발전 공공기관 본사는 모두 비수도권(나주·경주·진주·보령·태안·부산·울산 등)에 있으며, 대졸 신입 공채에 <b>본사이전 지역인재 30%·비수도권 35%</b> 채용목표제가 적용됩니다 — 발전소·본사가 있는 지역의 청년에게 실질적 기회가 있는 구조입니다.</div>
<div class="warn">보수는 알리오 정기공시(2025년 결산·일반정규직) 기준으로 개인별 실제 금액과 다를 수 있습니다. 채용공고의 자격·일정 등 확정 정보는 반드시 원문 공고를 확인하세요.</div>`
  mkdirSync(join(DIST, 'jobs'), { recursive: true })
  writeFileSync(join(DIST, 'jobs', 'index.html'), shell({
    title: `발전사 채용공고 모음 ${YEAR} — 한전·한수원·발전5사 채용·연봉 | 우리동네 발전소`,
    desc: `발전공기업 채용공고 ${openJobs.length}건(한전·한수원·남동·중부·서부·남부·동서발전 등)과 기관별 평균 연봉·신입 초임·정규직 인원(알리오 공시), 지역인재 채용목표제(30%·35%)를 한 페이지에.`.slice(0, 155),
    path: '/jobs/', breadcrumbs: [['우리동네 발전소', '/'], ['발전 공공기관 채용·연봉', null]], body: jobsIndexBody,
    extraLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `발전사 채용공고 모음 ${YEAR}`,
        description: '한전·한수원·발전5사 등 발전 공공기관의 진행 중 채용공고와 연봉 정보',
        url: SITE + '/jobs/',
        ...(jobsData?.updatedAt ? { dateModified: jobsData.updatedAt.slice(0, 10) } : {}),
      },
      // 개별 공고 상세는 기관별 페이지에 있으므로 JobPosting은 그쪽에만 표기(목록 페이지 중복 방지)
    ],
  }))
  urls.splice(3, 0, `${SITE}/jobs/`)
  jobsPages++
}

// ---------- 채용 전용 페이지 (hr.json에 보수 공시가 없는 기관) ----------
// /jobs/ 인덱스의 기관 셀은 /jobs/<기관>/ 로 링크하는데, 그동안 hr.json의 9개 기관만
// 페이지가 있어 한전KPS·한전KDN·한국전력기술 공고 34건(전체의 60%)이 404로 떨어졌다.
// Search Console '찾을 수 없음(404)' 20건의 원인. 기관이 새로 등장해도 자동 대응하도록
// jobs.json에만 있는 기관은 보수 섹션 없이 채용 전용 페이지를 만든다.
let extraJobPages = 0
{
  const hrSet = new Set((hrData?.companies ?? []).map(c => c.name))
  const extraCos = [...new Set(openJobs.map(j => j.company))].filter(c => c && !hrSet.has(c))
  for (const co of extraCos) {
    const myJobs = openJobs.filter(j => j.company === co)
    if (!myJobs.length) continue
    const inst = myJobs[0].inst || co
    const slug = sanitize(co)
    const dir = join(DIST, 'jobs', slug)
    mkdirSync(dir, { recursive: true })
    const path = `/jobs/${slug}/`
    const coPlants = plants.filter(p => p.companyGroup === co && p.totalMw >= 10).sort(byCap).slice(0, 14)
    const body = `
<h1>💼 ${esc(co)} 채용공고 (${YEAR})</h1>
<p class="sub">${esc(inst)} · 진행 중인 채용공고를 매일 자동 수집해 보여줍니다.</p>
<a class="cta" href="/?tab=jobs&co=${encodeURIComponent(co)}">💼 진행 중 채용공고 실시간 보기</a>

<h2>${esc(co)} 진행 중 채용공고 (${myJobs.length}건)</h2>
${jobTable(myJobs, false)}
<p class="sub">공고 제목을 누르면 ${esc(inst)} 원문 공고로 이동합니다. 지원 자격·일정 등 확정 정보는 반드시 원문에서 확인하세요.</p>
${myJobs.map(j => `<div class="facts" style="grid-template-columns:1fr"><div><b>${esc(j.title)}</b>${jobDescHtml(j)}<p><a href="${esc(j.url)}" rel="noreferrer nofollow">원문 공고 보기 →</a></p></div></div>`).join('')}
<p class="sub">출처: 공공데이터포털 공공기관 채용정보(재정경제부)${jobsData?.updatedAt ? ` · ${esc(jobsData.updatedAt)} 기준` : ''}</p>

<div class="warn">${esc(co)}의 평균보수·임직원 공시는 아직 수록 전입니다. <a href="https://www.alio.go.kr" rel="noreferrer">알리오(ALIO)</a>에서 확인할 수 있으며, 수록되는 대로 이 페이지에 연봉 정보가 추가됩니다.</div>

<h2>채용 제도 — 지역인재 우대</h2>
<div class="good">공공기관 대졸 신입 공채는 <b>본사이전 지역인재 30% 이상</b>(혁신도시법)·<b>비수도권 인재 35% 이상</b>(지방대육성법) 채용목표제가 적용됩니다(공고별 적용 여부는 원문 확인).</div>

${coPlants.length ? `<h2>${esc(co)} 관련 발전소</h2>
<p class="tags">${coPlants.map(plantLink).join(' ')}</p>` : ''}
<p><a href="/jobs/">← 발전 공공기관 채용·연봉 전체</a> · <a href="/jobs/salary/">기관별 연봉 비교</a></p>`
    writeFileSync(join(dir, 'index.html'), shell({
      title: `${co} 채용공고 ${YEAR} — 진행 중 ${myJobs.length}건 | 우리동네 발전소`,
      desc: `${inst} 진행 중 채용공고 ${myJobs.length}건을 매일 자동 수집. 모집 구분·근무지·접수마감과 원문 공고 링크, 지역인재 채용목표제 안내.`.slice(0, 155),
      path,
      breadcrumbs: [['우리동네 발전소', '/'], ['발전 공공기관 채용·연봉', '/jobs/'], [co, null]],
      body,
      extraLd: myJobs.map(j => jobPostingLd(j, inst)),
    }))
    urls.push(SITE + encodeURI(path))
    extraJobPages++
  }
}

// ---------- 기관별 연봉 비교 (/jobs/salary/) ----------
// '발전5사 연봉 비교', '발전공기업 연봉 순위', '공기업 초봉 비교'는 검색 수요가 큰데
// 기존에는 기관별 페이지에 흩어져 있어 비교 질의를 받을 URL이 없었다.
if (hrData) {
  const cos = hrData.companies
  const years = [...new Set(cos.flatMap(c => c.avgPay.map(x => x.year)))].sort()
  const latestOf = c => [...c.avgPay].filter(x => x.kind === '결산').sort((a, b) => b.year - a.year)[0]
  const ranked = [...cos].sort((a, b) => (latestOf(b)?.amount || 0) - (latestOf(a)?.amount || 0))
  const byNew = [...cos].filter(c => c.newHire2025 != null).sort((a, b) => b.newHire2025 - a.newHire2025)
  const path = '/jobs/salary/'
  const dir = join(DIST, 'jobs', 'salary')
  mkdirSync(dir, { recursive: true })
  const body = `
<h1>💰 발전 공공기관 연봉 비교 ${YEAR} — 한전·한수원·발전5사</h1>
<p class="sub">알리오(ALIO) 정기공시 기준 평균보수·신입 초임·정규직 현원·평균 근속연수를 한 표에서 비교합니다. 발전공기업 취업 준비에 필요한 보수 정보를 기관별로 정리했습니다.</p>
<a class="cta" href="/jobs/">💼 진행 중 채용공고 보기</a>

<h2>평균보수 순위 (${latestOf(ranked[0])?.year}년 결산)</h2>
<div class="tbl"><table><thead><tr><th>순위</th><th>기관</th><th>평균보수</th><th>신입 초임</th><th>정규직 현원</th><th>평균 근속</th><th>본사</th></tr></thead><tbody>
${ranked.map((c, i) => `<tr><td>${i + 1}</td><td><a href="/jobs/${encodeURI(sanitize(c.name))}/">${esc(c.name)}</a></td><td>${man(latestOf(c)?.amount)}</td><td>${man(c.newHire2025)}</td><td>${c.employees?.regular != null ? Math.round(c.employees.regular).toLocaleString() + '명' : '—'}</td><td>${c.tenure != null ? c.tenure + '년' : '—'}</td><td>${esc(c.hq)}</td></tr>`).join('\n')}
</tbody></table></div>

<h2>신입사원 초임 순위 (2025)</h2>
<div class="tbl"><table><thead><tr><th>순위</th><th>기관</th><th>초임</th><th>2026 예산</th></tr></thead><tbody>
${byNew.map((c, i) => `<tr><td>${i + 1}</td><td><a href="/jobs/${encodeURI(sanitize(c.name))}/">${esc(c.name)}</a></td><td>${man(c.newHire2025)}</td><td>${man(c.newHire2026Budget)}</td></tr>`).join('\n')}
</tbody></table></div>

<h2>연도별 평균보수 추이 (${years[0]}~${years[years.length - 1]})</h2>
<div class="tbl"><table><thead><tr><th>기관</th>${years.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>
${cos.map(c => `<tr><td><a href="/jobs/${encodeURI(sanitize(c.name))}/">${esc(c.name)}</a></td>${years.map(y => {
    const v = c.avgPay.find(x => x.year === y)
    return `<td>${v ? man(v.amount) + (v.kind === '예산' ? '<small>(예산)</small>' : '') : '—'}</td>`
  }).join('')}</tr>`).join('\n')}
</tbody></table></div>

<div class="warn">2026년은 <b>예산</b> 기준이라 결산보다 낮게 보입니다 — 경영평가 성과급이 확정되지 않아 0으로 반영되기 때문입니다. 연도 간 비교는 '결산'끼리 하세요. 알리오 정기공시(일반정규직 기준)로 개인별 실제 보수와 다를 수 있습니다.</div>
<div class="good">발전 공공기관 본사는 모두 비수도권(나주·경주·진주·보령·태안·부산·울산 등)에 있으며, 대졸 신입 공채에 <b>본사이전 지역인재 30%·비수도권 35%</b> 채용목표제가 적용됩니다.</div>
<p class="sub">출처: 알리오(ALIO) 정기공시 · ${esc(hrData.updatedAt)} 기준</p>
<p><a href="/jobs/">← 발전 공공기관 채용·연봉 전체</a></p>`
  writeFileSync(join(dir, 'index.html'), shell({
    title: `발전 공공기관 연봉 비교 ${YEAR} — 한전·한수원·발전5사 평균보수·초임 순위 | 우리동네 발전소`,
    desc: `한전·한수원·남동·중부·서부·남부·동서발전 등 ${cos.length}개 발전 공공기관의 평균보수·신입 초임·정규직 현원·근속연수를 알리오 공시 기준으로 비교. 연도별 추이 포함.`.slice(0, 155),
    path, breadcrumbs: [['우리동네 발전소', '/'], ['발전 공공기관 채용·연봉', '/jobs/'], ['연봉 비교', null]], body,
  }))
  urls.push(SITE + path)
  extraJobPages++
}

// ---------- 주제 허브 (/topic/) ----------
const topicPages = []

// (1) 석탄화력 폐지·대체 일정 — 2026년 최대 검색 주제인데 대응 URL이 없었다
{
  const rows = []
  for (const p of plants) {
    for (const u of (p.units || [])) {
      if (!u.retire) continue
      rows.push({ p, u })
    }
  }
  rows.sort((a, b) => a.u.retire.year - b.u.retire.year || a.p.name.localeCompare(b.p.name))
  if (rows.length) {
    const byYear = rows.reduce((m, r) => { (m[r.u.retire.year] ||= []).push(r); return m }, {})
    const totalMw = rows.reduce((a, r) => a + r.u.mw, 0)
    const munis = [...new Set(rows.map(r => `${r.p.sido} ${r.p.sigungu}`))]
    const path = '/topic/석탄화력-폐지-일정/'
    const dir = join(DIST, 'topic', '석탄화력-폐지-일정')
    mkdirSync(dir, { recursive: true })
    const body = `
<h1>⚫ 석탄화력 폐지·대체 일정 — 호기별 ${rows.length}기 총정리</h1>
<p class="sub">제11차 전력수급기본계획(산업부 공고 제2025-169호) 기준 폐지 예정 호기 ${rows.length}기(${totalMw.toLocaleString()}MW)와 대체 설비를 연도순으로 정리했습니다. 해당 시군구 ${munis.length}곳.</p>
<a class="cta" href="/">🗺️ 지도에서 폐지 예정 발전소 보기</a>
<div class="warn">폐지되면 발전량에 비례하는 <b>기본지원사업 지원금도 함께 줄어듭니다</b>. 대체 설비 준공이 늦어지면 그 사이 '지원 공백'이 생길 수 있습니다 — 아래 표에서 폐지 시점과 대체 준공 시점을 비교해 보세요.</div>

${Object.entries(byYear).map(([y, list]) => `<h2>${esc(y)}년 폐지 (${list.length}기 · ${list.reduce((a, r) => a + r.u.mw, 0).toLocaleString()}MW)</h2>
<div class="tbl"><table><thead><tr><th>발전소·호기</th><th>지역</th><th>MW</th><th>폐지 유형</th><th>대체 설비</th></tr></thead><tbody>
${list.map(r => {
      const rep = (r.u.replacements || []).map(x => {
        const dst = byName.get(x.to.split('#')[0]) || byName.get(x.to)
        const label = `${esc(x.to)}${x.planned ? ` (${esc(x.planned)})` : ''}`
        return dst ? `<a href="/plant/${encodeURI(slugOf.get(dst.id))}/">${label}</a>` : label
      }).join(', ')
      return `<tr><td><a href="/plant/${encodeURI(slugOf.get(r.p.id))}/">${esc(r.p.name)}</a> ${esc(r.u.label || '')}</td><td>${esc(r.p.sido)} ${esc(r.p.sigungu)}</td><td>${r.u.mw.toLocaleString()}</td><td>${esc(r.u.retire.type)}</td><td>${rep || '—'}</td></tr>`
    }).join('\n')}
</tbody></table></div>`).join('\n')}

<h2>폐지 지역 주민이 확인할 것</h2>
<div class="tbl"><table><thead><tr><th>항목</th><th>내용</th></tr></thead><tbody>
<tr><td>지원금 변화</td><td>기본지원사업은 발전량 비례 — 폐지 시 감소. 대체 설비 준공 전까지 공백 가능</td></tr>
<tr><td>전기요금 보조</td><td>주변지역 세대 감면도 발전소 가동과 연동</td></tr>
<tr><td>특별지원사업</td><td>대체 설비 건설 시 총사업비 비율로 신규 지원 발생</td></tr>
<tr><td>지역 일자리</td><td>발전사 채용·협력업체 — <a href="/jobs/">채용·연봉 정보</a></td></tr>
</tbody></table></div>

<h2>폐지 예정 발전소가 있는 지역</h2>
<p class="tags">${munis.map(m => {
      const [sd, sgg] = m.split(' ')
      const r = regionsAll.find(x => x.sido === sd && x.sigungu === sgg)
      return r ? `<a href="/region/${encodeURI(regionSlug(r))}/">🏡 ${esc(m)}</a>` : `<span class="k">${esc(m)}</span>`
    }).join(' ')}</p>
<p class="sub">출처: 제11차 전력수급기본계획(산업부 공고 제2025-169호, 2025.2.21) 부록11 — 계획 기준이며 인허가·공정에 따라 변동될 수 있습니다.</p>`
    writeFileSync(join(dir, 'index.html'), shell({
      title: `석탄화력 폐지 일정 ${rows.length}기 — 연도별 대체 설비 총정리 | 우리동네 발전소`,
      desc: `제11차 전력수급기본계획 기준 석탄화력 폐지 예정 ${rows.length}기(${totalMw.toLocaleString()}MW)의 연도별 일정과 대체 설비, 폐지 지역 주민이 알아야 할 지원금 변화까지.`.slice(0, 155),
      path, breadcrumbs: [['우리동네 발전소', '/'], ['주제별', null], ['석탄화력 폐지 일정', null]], body,
    }))
    urls.push(SITE + encodeURI(path))
    topicPages.push(path)
  }
}

// (2) 지역기업 우대 (발주법 제17조의2) — local_biz.json 이 그동안 어디에도 렌더되지 않았다
if (bizData) {
  const path = '/topic/지역기업-우대/'
  const dir = join(DIST, 'topic', '지역기업-우대')
  mkdirSync(dir, { recursive: true })
  const g = bizData.guideline || {}
  const rowsOf = v => Array.isArray(v) ? v : []
  const body = `
<h1>🏢 발전소 주변지역 기업 우대 제도 — 발주법 제17조의2</h1>
<p class="sub">발전소 주변지역에 주된 영업소를 둔 기업은 발전사 공사·물품·용역 계약에서 우대받을 수 있습니다. 근거 법령과 발전5사 공통 지침을 정리했습니다.</p>

<h2>근거 법령</h2>
<div class="tbl"><table><tbody>
<tr><td><b>${esc(bizData.law.act)}</b></td><td>${esc(bizData.law.actText)}</td></tr>
<tr><td><b>${esc(bizData.law.decree)}</b></td><td>${esc(bizData.law.disclosureDuty)}</td></tr>
</tbody></table></div>
<p><a href="${esc(bizData.law.actUrl)}" rel="noreferrer">법률 원문</a> · <a href="${esc(bizData.law.decreeUrl)}" rel="noreferrer">시행령 원문</a></p>

${g.title ? `<h2>${esc(g.title)}</h2>
<p class="sub">${esc(g.enacted || '')} 제정 · ${esc(g.scope || '')}</p>` : ''}
${rowsOf(g.thresholds).length ? `<h3>대상 계약 기준</h3>
<div class="tbl"><table><thead><tr><th>계약 종류</th><th>금액 기준</th></tr></thead><tbody>
${rowsOf(g.thresholds).map(t => `<tr><td>${esc(t.kind || t.name || '')}</td><td>${esc(t.limit || t.amount || '')}</td></tr>`).join('\n')}
</tbody></table></div>` : ''}
${rowsOf(g.bonus).length ? `<h3>지분율별 가산점</h3>
<div class="tbl"><table><thead><tr><th>지역업체 지분율</th><th>가산점</th></tr></thead><tbody>
${rowsOf(g.bonus).map(b => `<tr><td>${esc(b.share || b.range || '')}</td><td>${esc(String(b.point ?? b.points ?? ''))}</td></tr>`).join('\n')}
</tbody></table></div>` : ''}
${rowsOf(g.exceptions).length ? `<h3>적용 제외</h3>
<ul>${rowsOf(g.exceptions).map(x => `<li>${esc(typeof x === 'string' ? x : (x.text || x.name || ''))}</li>`).join('')}</ul>` : ''}

<h2>우리 회사가 대상인지 확인하려면</h2>
<p>주변지역 해당 여부는 <a href="/zone/">읍·면·동 단위 판정</a>에서 확인할 수 있습니다. 실제 적용 여부·세부 조건은 각 발전사 계약 부서와 개별 공고에서 반드시 확인하세요.</p>
<div class="warn">${esc(bizData.note)}</div>
<p class="sub">기준일 ${esc(bizData.updatedAt)}</p>`
  writeFileSync(join(dir, 'index.html'), shell({
    title: '발전소 주변지역 기업 우대 — 발주법 제17조의2 제한경쟁·가산점 | 우리동네 발전소',
    desc: '발전소 주변지역 소재 기업의 발전사 계약 우대 제도(발주법 제17조의2·시행령 제34조) — 대상 계약 금액 기준, 제한경쟁과 지분율별 가산점, 적용 제외 사유 정리.',
    path, breadcrumbs: [['우리동네 발전소', '/'], ['주제별', null], ['지역기업 우대', null]], body,
  }))
  urls.push(SITE + encodeURI(path))
  topicPages.push(path)
}

// ---------- 해외사업 (/overseas/) ----------
// 발전사 자소서·면접 준비 수요. 기존에는 SPA 탭 안에만 있어 URL이 없었다.
if (overseasData?.items?.length) {
  const items = overseasData.items
  const byCo = items.reduce((m, x) => { (m[x.companyGroup || x.company] ||= []).push(x); return m }, {})
  const normCountry = c => String(c || '').replace(/\s*\(.*\)$/, '').trim()
  const byCountry = items.reduce((m, x) => { (m[normCountry(x.country)] ||= []).push(x); return m }, {})
  const path = '/overseas/'
  const dir = join(DIST, 'overseas')
  mkdirSync(dir, { recursive: true })
  const body = `
<h1>🌏 발전 공기업 해외사업 현황 — ${items.length}건</h1>
<p class="sub">남동·중부·서부·남부·동서발전의 해외 발전사업 ${items.length}건을 국가·연료·용량·지분율·상태로 정리했습니다. 각 사업의 출처 링크를 함께 제공합니다.</p>

<h2>기관별 현황</h2>
<div class="tbl"><table><thead><tr><th>기관</th><th>사업 수</th><th>주요 진출국</th></tr></thead><tbody>
${Object.entries(byCo).sort((a, b) => b[1].length - a[1].length).map(([co, list]) => {
    const countries = [...new Set(list.map(x => normCountry(x.country)))].slice(0, 6).join(', ')
    const link = (hrData?.companies ?? []).some(c => c.name === co)
    return `<tr><td>${link ? `<a href="/jobs/${encodeURI(sanitize(co))}/">${esc(co)}</a>` : esc(co)}</td><td>${list.length}건</td><td>${esc(countries)}</td></tr>`
  }).join('\n')}
</tbody></table></div>

<h2>국가별 현황</h2>
<div class="tbl"><table><thead><tr><th>국가</th><th>사업 수</th><th>합계 용량</th></tr></thead><tbody>
${Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length).map(([c, list]) => `<tr><td>${esc(c)}</td><td>${list.length}건</td><td>${Math.round(list.reduce((a, x) => a + (x.mw || 0), 0)).toLocaleString()} MW</td></tr>`).join('\n')}
</tbody></table></div>

${Object.entries(byCo).sort().map(([co, list]) => `<h2>${esc(co)} 해외사업 (${list.length}건)</h2>
<div class="tbl"><table><thead><tr><th>사업명</th><th>국가·도시</th><th>연료</th><th>용량</th><th>지분</th><th>상태</th></tr></thead><tbody>
${[...list].sort((a, b) => (b.mw || 0) - (a.mw || 0)).map(x => `<tr><td>${x.source ? `<a href="${esc(String(x.source).split(' ;')[0])}" rel="noreferrer nofollow">${esc(x.name)}</a>` : esc(x.name)}</td><td>${esc(x.country)}${x.city ? ` · ${esc(x.city)}` : ''}</td><td>${esc(x.fuel || '-')}</td><td>${x.mw ? Math.round(x.mw).toLocaleString() + ' MW' : '—'}</td><td>${esc(x.stake || '-')}</td><td>${esc(x.status || '-')}</td></tr>`).join('\n')}
</tbody></table></div>`).join('\n')}

<div class="warn">${esc(overseasData.note || '각 발전사 공식 홈페이지·보도자료 기준으로 수집한 정보입니다. 지분율·상태는 변동될 수 있으니 원문을 확인하세요.')}</div>
<p class="sub">기준일 ${esc(overseasData.updatedAt || generatedAt)}</p>
<p><a href="/jobs/">💼 발전 공공기관 채용·연봉 보기</a></p>`
  writeFileSync(join(dir, 'index.html'), shell({
    title: `발전 공기업 해외사업 현황 ${items.length}건 — 국가·용량·지분율 | 우리동네 발전소`,
    desc: `남동·중부·서부·남부·동서발전의 해외 발전사업 ${items.length}건을 국가별·기관별로 정리 — 사업명·연료·설비용량·지분율·추진 상태와 출처 링크.`.slice(0, 155),
    path, breadcrumbs: [['우리동네 발전소', '/'], ['해외사업', null]], body,
  }))
  urls.push(SITE + path)
  topicPages.push(path)
}

// ---------- RSS ----------
// 네이버 서치어드바이저는 RSS 제출을 받는다(웹문서 색인 보조). 구독 수단도 된다.
{
  const esx = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const now = new Date().toUTCString()
  const feedItems = []
  for (const j of openJobs.slice(0, 30)) {
    feedItems.push({
      title: `[채용] ${j.company} ${j.title}`,
      link: SITE + encodeURI(`/jobs/${sanitize(j.company)}/`),
      desc: `${j.inst || j.company} · ${j.kind || ''} ${j.hire || ''} · 근무지 ${j.region || '-'} · 접수마감 ${j.end || '-'}`,
      date: j.start || TODAY,
    })
  }
  for (const p of plants.filter(x => x.status === '건설중' || x.status === '추진중').slice(0, 20)) {
    feedItems.push({
      title: `[건설] ${p.name} ${p.totalMw.toLocaleString()}MW ${p.status}`,
      link: SITE + encodeURI(`/plant/${slugOf.get(p.id)}/`),
      desc: `${p.sido} ${p.sigungu} · ${p.fuelCat} · ${p.planned?.when || ''}`,
      date: generatedAt,
    })
  }
  writeFileSync(join(DIST, 'rss.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n` +
    `<title>우리동네 발전소 — 발전소·주변지역 혜택·공공기관 채용</title>\n` +
    `<link>${SITE}/</link>\n` +
    `<description>전국 발전소 현황, 발주법 주변지역 혜택 판정, 발전 공공기관 채용·연봉 정보</description>\n` +
    `<language>ko</language>\n<lastBuildDate>${now}</lastBuildDate>\n` +
    feedItems.map(i => `<item><title>${esx(i.title)}</title><link>${esx(i.link)}</link><guid isPermaLink="false">${esx(i.link + '#' + i.title)}</guid><description>${esx(i.desc)}</description></item>`).join('\n') +
    `\n</channel></rss>\n`)
}

// ---------- 발전소 id → 슬러그 매핑 내보내기 ----------
// SPA의 공유 버튼이 /?plant={id} 대신 정적 SEO 페이지 /plant/{slug}/ 를 공유하도록 한다.
// 공유 트래픽(= 유입의 대부분)이 색인된 페이지에 쌓이고, 공유 카드에 발전소별 제목·설명이 뜬다.
mkdirSync(join(DIST, 'data'), { recursive: true })
writeFileSync(join(DIST, 'data', 'plant_slugs.json'),
  JSON.stringify(Object.fromEntries([...slugOf.entries()])))

// ---------- SPA 홈의 크롤러용 수치 치환 ----------
// 기존에는 '발전소 481곳'·'480곳'·'73개 시군구'가 하드코딩돼 실제 데이터(458/180)와 어긋났다.
// 크롤러가 읽는 첫 문장이 틀린 상태였으므로 빌드 시 실제 값으로 치환한다.
{
  const idx = join(DIST, 'index.html')
  if (existsSync(idx)) {
    const html = readFileSync(idx, 'utf-8')
      .replaceAll('{{PLANT_COUNT}}', String(plants.length))
      .replaceAll('{{REGION_COUNT}}', String(regionsAll.length))
    writeFileSync(idx, html)
    if (html.includes('{{')) console.warn('경고: index.html에 치환되지 않은 플레이스홀더가 남아 있습니다')
  }
}

// ---------- PWA manifest ----------
// 고령 주민에게 홈 화면 아이콘은 가장 확실한 재방문 경로인데 manifest가 없어 '앱 설치'가 뜨지 않았다.
writeFileSync(join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: '우리동네 발전소',
  short_name: '발전소지도',
  description: '전국 발전소 지도 · 주변지역 혜택 · 발전 공공기관 채용',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#1d4ed8',
  lang: 'ko',
  icons: [
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: '/og/og-default.png', sizes: '1200x630', type: 'image/png', purpose: 'any' },
  ],
}, null, 1))

// 사이트맵
writeFileSync(join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => {
    // 일자리 페이지는 채용공고가 매일 바뀌므로 공고 수집일을 lastmod로 — 재크롤 유도
    const lastmod = u.includes('/region/') ? localData.updatedAt
      : u.includes('/jobs/') ? ((jobsData?.updatedAt || '').slice(0, 10) || hrData?.updatedAt || generatedAt)
      : generatedAt
    return `  <url><loc>${u.replace(/&/g, '&amp;')}</loc><lastmod>${lastmod}</lastmod></url>`
  }).join('\n') + `\n</urlset>\n`)

console.log(`정적 페이지: 발전소 ${plants.length} · 지역 ${regionsAll.length} · 주변지역(zone) ${zonePages} · 일자리 ${jobsPages + extraJobPages} · 주제/해외 ${topicPages.length} · 허브(시도+연료) ${n - plants.length - regionsAll.length} — sitemap URL ${urls.length}개`)
if (!existsSync(join(DIST, 'index.html'))) console.warn('경고: dist/index.html 없음 — vite build 후 실행해야 합니다')
