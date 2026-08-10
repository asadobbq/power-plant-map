import { useRef, useState } from 'react'
import { track } from '../analytics'
import { safeUrl } from '../types'

interface AskResponse {
  answer?: string
  answered?: boolean
  sources?: string[]
  matched?: { plants: { id: string; name: string }[]; regions: string[] }
  error?: string
}

interface Turn {
  q: string
  a?: AskResponse
  error?: string
  feedback?: 'up' | 'down'
}

interface Props {
  onJump: (id: string) => void
}

/** "우리동네 AI 안내" — 사이트 보유 데이터 그라운딩 질의응답 위젯 */
export default function AiChat({ onJump }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const scrollDown = () =>
    setTimeout(() => listRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 60)

  async function ask() {
    const question = q.trim()
    if (!question || loading) return
    setQ('')
    setTurns(t => [...t, { q: question }])
    setLoading(true)
    scrollDown()
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const body: AskResponse = await r.json().catch(() => ({}))
      if (!r.ok) {
        setTurns(t => {
          const last = t[t.length - 1]
          return [...t.slice(0, -1), { ...last, error: body.error || '일시적인 오류가 발생했습니다.' }]
        })
        track('ai_chat_error', { status: r.status })
      } else {
        setTurns(t => {
          const last = t[t.length - 1]
          return [...t.slice(0, -1), { ...last, a: body }]
        })
        track('ai_chat_ask', { answered: body.answered ? 'yes' : 'no_data' })
      }
    } catch {
      setTurns(t => {
        const last = t[t.length - 1]
        return [
          ...t.slice(0, -1),
          { ...last, error: 'AI 안내에 연결하지 못했습니다. 지도와 혜택 탭에서 직접 확인해 주세요.' },
        ]
      })
      track('ai_chat_error', { status: 0 })
    } finally {
      setLoading(false)
      scrollDown()
    }
  }

  function feedback(i: number, v: 'up' | 'down') {
    setTurns(t => t.map((x, j) => (j === i ? { ...x, feedback: v } : x)))
    track('ai_chat_feedback', { helpful: v === 'up' ? 'yes' : 'no' })
  }

  if (!open) {
    return (
      <button
        className="ai-fab"
        onClick={() => {
          setOpen(true)
          track('ai_chat_open')
        }}
        aria-label="AI 안내 열기"
      >
        🤖 AI 안내
      </button>
    )
  }

  return (
    <div className="ai-panel" role="dialog" aria-label="우리동네 AI 안내">
      <div className="ai-head">
        <b>🤖 우리동네 AI 안내</b>
        <button className="detail-close" onClick={() => setOpen(false)} aria-label="닫기">
          ×
        </button>
      </div>
      <div className="ai-notice">
        AI 안내는 <b>참고용</b>이며 법적 효력이 없습니다. 금액·일정은 기준일 이후 변동될 수
        있습니다. 개인정보(상세 주소·연락처 등) 입력은 자제해 주세요.
      </div>
      <div className="ai-list" ref={listRef}>
        {turns.length === 0 && (
          <div className="ai-hint">
            예) &quot;하동 살면 무슨 혜택 받아요?&quot; · &quot;태안 화력 언제 폐지돼요?&quot; ·
            &quot;삼척으로 이사가면 지원금 있나요?&quot;
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i}>
            <div className="ai-q">{t.q}</div>
            {t.error && <div className="ai-a ai-err">{t.error}</div>}
            {t.a && (
              <div className="ai-a">
                <div className="ai-a-text">{t.a.answer}</div>
                {(t.a.matched?.plants.length ?? 0) > 0 && (
                  <div className="ai-chips">
                    {t.a.matched!.plants.map(p => (
                      <button key={p.id} className="ai-chip" onClick={() => onJump(p.id)}>
                        📍 {p.name}
                      </button>
                    ))}
                  </div>
                )}
                {(t.a.sources?.length ?? 0) > 0 && (
                  <details className="ai-src">
                    <summary>출처 {t.a.sources!.length}건</summary>
                    <ul>
                      {t.a.sources!.map((s, j) => (
                        <li key={j}>
                          <a href={safeUrl(s)} target="_blank" rel="noreferrer">
                            {s.replace(/^https?:\/\//, '').slice(0, 60)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="ai-fb">
                  이 답변이 도움됐나요?
                  <button
                    disabled={!!t.feedback}
                    className={t.feedback === 'up' ? 'on' : ''}
                    onClick={() => feedback(i, 'up')}
                  >
                    👍
                  </button>
                  <button
                    disabled={!!t.feedback}
                    className={t.feedback === 'down' ? 'on' : ''}
                    onClick={() => feedback(i, 'down')}
                  >
                    👎
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && <div className="ai-a ai-loading">답변 작성 중…</div>}
      </div>
      <div className="ai-input">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask()}
          placeholder="지역·발전소에 대해 물어보세요 (300자 이내)"
          maxLength={300}
          disabled={loading}
        />
        <button onClick={ask} disabled={loading || q.trim().length < 2}>
          질문
        </button>
      </div>
    </div>
  )
}
