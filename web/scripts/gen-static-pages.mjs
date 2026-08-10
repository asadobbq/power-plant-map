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

function shell({ title, desc, path, body, breadcrumbs, extraLd = [] }) {
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
${ldTags}
<style>${CSS}</style>
</head>
<body><main>
<nav class="crumb">${breadcrumbs.map(([name, url]) => (url ? `<a href="${encodeURI(url)}">${esc(name)}</a>` : esc(name))).join(' › ')}</nav>
${body}
<footer>출처: 전력거래소 EPSIS 발전기 세부내역(2024) · 한국전력 전력통계월보 · 제11차 전력수급기본계획(산업부 공고 제2025-169호) · 각 발전사 공식 홈페이지 · 각 시군구청 시책 안내 — 기준일 ${esc(generatedAt)}<br />
폐지·준공 시기는 계획 기준으로 변동될 수 있으며, 혜택·지원금은 추정치로 법적 판정이 아닙니다. 본 서비스는 공공데이터를 재구성한 비공식 안내 서비스입니다.<br />
<a href="/">🗺️ 우리동네 발전소 — 전국 발전소 지도</a> · <a href="/plant/">발전소 목록</a> · <a href="/region/">지역별 혜택</a></footer>
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

${cats.map(g => `<h2>${esc(g.c === '청년일자리' ? '청년·일자리' : g.c === '출산육아' ? '출산·육아' : g.c === '전입정착' ? '전입·정착' : g.c)} 지원</h2>
<div class="tbl"><table><thead><tr><th>시책</th><th>지원 내용</th><th>조건</th></tr></thead><tbody>
${g.items.map(pr => `<tr><td>${esc(pr.name)}</td><td>${esc(pr.amount)}</td><td>${esc(pr.condition || '-')}</td></tr>`).join('\n')}
</tbody></table></div>`).join('\n')}
<div class="warn">지자체 조례·공고 기준(2026-07 조사)이며 예산 소진·조례 개정으로 변동될 수 있습니다. 신청 자격은 해당 시·군·구청에 확인하세요.</div>

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

// 지역 페이지
for (const r of regions) {
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

// 목록 인덱스 페이지
const bySido = {}
for (const p of plants.filter(x => x.totalMw >= 10)) (bySido[p.sido || '기타'] ||= []).push(p)
const plantIndexBody = `
<h1>전국 발전소 목록</h1>
<p class="sub">운영·건설·계획·폐지 ${plants.length}개 발전소 — 클릭하면 용량·호기·폐지 일정·주변 혜택 상세를 볼 수 있습니다.</p>
<a class="cta" href="/">🗺️ 지도로 보기</a>
${Object.entries(bySido).sort().map(([sido, list]) => `<h2>${esc(sido)} (${list.length})</h2>
<p class="tags">${list.sort((a, b) => b.totalMw - a.totalMw).map(p => `<a href="/plant/${encodeURI(slugOf.get(p.id))}/">${FUEL_ICONS[p.fuelCat] || '⚡'} ${esc(p.name)} (${fmtMw(p.totalMw)})</a>`).join(' ')}</p>`).join('\n')}`
mkdirSync(join(DIST, 'plant'), { recursive: true })
writeFileSync(join(DIST, 'plant', 'index.html'), shell({
  title: '전국 발전소 목록 — 원자력·석탄·LNG·수력·풍력 | 우리동네 발전소',
  desc: `전국 발전소 ${plants.length}곳의 설비용량·운영사·호기별 준공·폐지 일정·주변지역 혜택 정보. 시도별 목록.`,
  path: '/plant/', breadcrumbs: [['우리동네 발전소', '/'], ['발전소', null]], body: plantIndexBody,
}))
urls.splice(1, 0, `${SITE}/plant/`)

const regionIndexBody = `
<h1>지역별 발전소 혜택 목록</h1>
<p class="sub">발전소가 있는 ${regions.length}개 시군구의 전입·정착·출산·주거 지원 시책 모음 (인구감소지역 표시)</p>
<p class="tags">${regions.sort((a, b) => (a.sido + a.sigungu).localeCompare(b.sido + b.sigungu)).map(r => `<a href="/region/${encodeURI(regionSlug(r))}/">${esc(r.sido)} ${esc(r.sigungu)}${r.depopulation ? ' 🏡' : ''} (${r.programs.length})</a>`).join(' ')}</p>
<p class="sub">🏡 = 행안부 인구감소지역</p>`
mkdirSync(join(DIST, 'region'), { recursive: true })
writeFileSync(join(DIST, 'region', 'index.html'), shell({
  title: '지역별 발전소 전입·정착 혜택 목록 | 우리동네 발전소',
  desc: `발전소 소재 ${regions.length}개 시군구의 전입지원금·출산장려금·주거 지원 시책 총정리.`,
  path: '/region/', breadcrumbs: [['우리동네 발전소', '/'], ['지역별 혜택', null]], body: regionIndexBody,
}))
urls.splice(2, 0, `${SITE}/region/`)

// 사이트맵
writeFileSync(join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => {
    const lastmod = u.includes('/region/') ? localData.updatedAt : generatedAt
    return `  <url><loc>${u.replace(/&/g, '&amp;')}</loc><lastmod>${lastmod}</lastmod></url>`
  }).join('\n') + `\n</urlset>\n`)

console.log(`정적 페이지 생성: 발전소 ${plants.length} + 지역 ${regions.length} + 인덱스 2 = ${n + 2}개, sitemap URL ${urls.length}개`)
if (!existsSync(join(DIST, 'index.html'))) console.warn('경고: dist/index.html 없음 — vite build 후 실행해야 합니다')
