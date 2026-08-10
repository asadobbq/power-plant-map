// 챗봇 컨텍스트 매칭 단위 테스트 — API 호출 없이 assembleContext만 검증
// 사용: node scripts/test-ask-matching.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleContext } from '../api/ask.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const data = {
  plants: JSON.parse(readFileSync(join(ROOT, 'public/data/plants.json'), 'utf-8')),
  local: JSON.parse(readFileSync(join(ROOT, 'public/data/benefit_local.json'), 'utf-8')),
}

const CASES = [
  {
    q: '발전공기업이 수도권에 운영중이거나 건설중인 발전소는 뭐가 있지?',
    check: r => {
      const sr = r.context.발전소_검색결과
      return sr && sr.집계.개수 > 0 &&
        sr.조건.시도?.join() === '서울,경기,인천' &&
        sr.조건.운영사그룹?.includes('한수원') &&
        sr.조건.상태?.includes('운영중') && sr.조건.상태?.includes('건설중')
    },
  },
  { q: '수도권에 원전 있어?', check: r => r.context.발전소_검색결과?.집계.개수 === 0 },
  {
    q: '전남에 있는 풍력발전소 알려줘',
    check: r => {
      const sr = r.context.발전소_검색결과
      return sr && sr.집계.개수 > 0 && sr.목록.every(row => row.includes('풍력') && row.includes('전남'))
    },
  },
  {
    q: '하동 살면 무슨 혜택 받아요?',
    check: r =>
      r.regions.length === 1 && r.regions[0].sigungu === '하동군' &&
      r.plants.some(p => p.name === '하동') &&
      !r.plants.some(p => p.name === '대구그린파워'),
  },
  {
    q: '태안 화력 언제 폐지돼요?',
    check: r => r.context.발전소_상세?.some(b => b.이름 === '태안'),
  },
  {
    q: '건설중인 LNG 발전소 몇 개야?',
    check: r => {
      const sr = r.context.발전소_검색결과
      return sr && sr.집계.개수 > 0 && sr.목록.every(row => row.includes('LNG'))
    },
  },
  { q: '오늘 날씨 어때?', check: r => !r.context.발전소_검색결과 && !r.context.발전소_상세 },
]

let fail = 0
for (const c of CASES) {
  const r = assembleContext(c.q, data)
  const ok = c.check(r)
  const sr = r.context.발전소_검색결과
  console.log(
    `${ok ? 'PASS' : 'FAIL'} | ${c.q} | 검색결과 ${sr ? sr.집계.개수 + '곳' : '없음'} | 상세 ${r.context.발전소_상세?.length ?? 0} | 지역 ${r.regions.length}`,
  )
  if (!ok) {
    fail++
    console.log('  →', JSON.stringify(sr?.조건 ?? r.context, null, 0).slice(0, 300))
  }
}
// 토큰 예산 감: 최대 케이스의 컨텍스트 크기
const big = assembleContext('전국 공기업 운영중 화력 수력 발전소', data)
console.log(`\n컨텍스트 크기(대형 질의): ${JSON.stringify(big.context).length.toLocaleString()}자`)
process.exit(fail ? 1 : 0)
