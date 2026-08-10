// 소통 게시판 API — Vercel Serverless Function + Upstash Redis(REST)
// 개인정보 최소화: 이메일 등 미수집. IP는 해시로만 속도제한에 사용(원문 저장 안 함).
import { createHash, randomBytes } from 'node:crypto'

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
const ADMIN_TOKEN = process.env.BOARD_ADMIN_TOKEN || ''
// 새 글 이메일 알림 — 수신 주소는 서버 환경변수에만 존재(클라이언트·저장소 비노출)
const NOTIFY_EMAIL = process.env.BOARD_NOTIFY_EMAIL || ''
const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY || ''

/** 새 글 알림 발송(실패해도 글 등록에는 영향 없음). WEB3FORMS_KEY 우선, 없으면 FormSubmit. */
async function notifyNewPost(post) {
  if (!WEB3FORMS_KEY && !NOTIFY_EMAIL) return
  const head = post.content.replace(/\n/g, ' ').slice(0, 30)
  const subject = `[우리동네 발전소] 새 게시글: ${head}${post.content.length > 30 ? '…' : ''}`
  const when = new Date(post.ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const body = `작성자: ${post.nick}\n시각: ${when}\n\n${post.content}\n\n게시판: https://kopower.net/board/\n답변·삭제(관리자): https://kopower.net/board/#admin`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4500)
  try {
    if (WEB3FORMS_KEY) {
      await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject, from_name: '우리동네 발전소 게시판', name: post.nick, message: body }),
        signal: ctrl.signal,
      })
    } else {
      await fetch(`https://formsubmit.co/ajax/${NOTIFY_EMAIL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ _subject: subject, 작성자: post.nick, 작성시각: when, 내용: post.content, _template: 'box' }),
        signal: ctrl.signal,
      })
    }
  } catch (e) {
    console.error('notify fail', e?.message)
  } finally {
    clearTimeout(timer)
  }
}

async function redis(commands) {
  // commands: [["ZADD","b:idx",...], ...] — Upstash pipeline
  const r = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!r.ok) throw new Error(`redis ${r.status}`)
  return (await r.json()).map(x => x.result)
}

// 제어문자 제거(줄바꿈 \n 보존, \r\n → \n 정규화)
const clean = s =>
  String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: '게시판 저장소가 아직 설정되지 않았습니다.' })
  }

  try {
    if (req.method === 'GET') {
      const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0)
      const limit = Math.min(30, Math.max(1, parseInt(req.query.limit || '20', 10) || 20))
      const [ids, total] = await redis([
        ['ZRANGE', 'b:idx', String(-offset - limit), String(-offset - 1)],
        ['ZCARD', 'b:idx'],
      ])
      const ordered = (ids || []).reverse()
      const posts = ordered.length
        ? (await redis(ordered.map(id => ['GET', `b:p:${id}`]))).filter(Boolean).map(j => JSON.parse(j))
        : []
      return res.status(200).json({ posts, total: total || 0 })
    }

    if (req.method === 'POST') {
      const b = req.body || {}

      // ---- 관리자 작업 ----
      if (b.action === 'delete' || b.action === 'reply') {
        if (!ADMIN_TOKEN || b.token !== ADMIN_TOKEN) return res.status(403).json({ error: '권한이 없습니다.' })
        const id = clean(b.id)
        if (!id) return res.status(400).json({ error: 'id 필요' })
        if (b.action === 'delete') {
          await redis([['ZREM', 'b:idx', id], ['DEL', `b:p:${id}`]])
          return res.status(200).json({ ok: true })
        }
        const [json] = await redis([['GET', `b:p:${id}`]])
        if (!json) return res.status(404).json({ error: '글이 없습니다.' })
        const post = JSON.parse(json)
        post.reply = clean(b.reply).slice(0, 1000)
        post.replyTs = Date.now()
        await redis([['SET', `b:p:${id}`, JSON.stringify(post)]])
        return res.status(200).json({ ok: true })
      }

      // ---- 글 작성 ----
      if (clean(b.website)) return res.status(200).json({ ok: true }) // 허니팟: 봇은 조용히 무시
      const content = clean(b.content)
      const nick = clean(b.nick).replace(/\n/g, ' ').slice(0, 20) || '익명'
      if (content.length < 2) return res.status(400).json({ error: '내용을 2자 이상 입력해 주세요.' })
      if (content.length > 1000) return res.status(400).json({ error: '내용은 1,000자 이내로 입력해 주세요.' })

      // 속도 제한: IP 해시 기준 10분에 4건
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
      const iph = createHash('sha256').update('kopower:' + ip).digest('hex').slice(0, 16)
      const rlKey = `b:rl:${iph}`
      const [count] = await redis([['INCR', rlKey]])
      if (count === 1) await redis([['EXPIRE', rlKey, '600']])
      if (count > 4) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요. (10분당 4건 제한)' })

      const ts = Date.now()
      const id = `${ts.toString(36)}${randomBytes(3).toString('hex')}`
      const post = { id, nick, content, ts }
      await redis([
        ['SET', `b:p:${id}`, JSON.stringify(post)],
        ['ZADD', 'b:idx', String(ts), id],
      ])
      await notifyNewPost(post) // 알림 실패는 등록 성공에 영향 없음(내부 try/catch)
      return res.status(201).json({ ok: true, id })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' })
  }
}
