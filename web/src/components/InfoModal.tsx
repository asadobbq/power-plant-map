interface Props {
  generatedAt: string
  onClose: () => void
}

/** 데이터 출처·기준일·면책 안내 (어디서든 접근 가능한 신뢰성 표시). */
export default function InfoModal({ generatedAt, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="detail-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <h2>데이터 출처 · 유의사항</h2>

        <p className="modal-lead">
          <b>우리동네 발전소</b>는 공개된 공공데이터를 재구성한 <b>비공식 안내 서비스</b>입니다. 참고용이며
          법적 효력이 없습니다.
        </p>

        <div className="modal-kv">
          <span className="k">데이터 기준일</span>
          <b>{generatedAt || '—'}</b>
        </div>

        <div className="sb-label">항목별 출처</div>
        <ul className="modal-list">
          <li>
            <b>운영 발전설비·호기·연료·주기기 제작사</b> — 전력거래소 EPSIS 발전기 세부내역(2024)
          </li>
          <li>
            <b>건설·계획 설비 보강</b> — 한국전력 전력통계월보(제571호, 2026.5)
          </li>
          <li>
            <b>폐지·대체·신규 계획</b> — 제11차 전력수급기본계획(산업통상자원부 공고 제2025-169호, 2025)
          </li>
          <li>
            <b>좌표·상세주소</b> — WRI Global Power Plant DB v1.3(CC BY) + 각 발전사 공식 홈페이지 도로명주소
          </li>
          <li>
            <b>주변지역 혜택·전기요금보조 단가</b> — 발전소주변지역 지원법 시행령 별표2(2017 개정) + 각
            발전본부 공지
          </li>
          <li>
            <b>발전량·이용률</b> — EPSIS 발전실적
          </li>
          <li>
            <b>행정경계(근사 좌표 폴백)</b> — 통계청 시군구 경계(2013)
          </li>
        </ul>

        <div className="sb-label">면책</div>
        <ul className="modal-list warn">
          <li>
            <b>폐지·준공·대체 시기는 전력수급기본계획 등 계획 기준</b>이며, 인허가·공정·정책 변경에 따라 실제
            시기와 달라질 수 있습니다.
          </li>
          <li>일부 발전소의 용량·위치·상세주소는 추정·근사값이며, 공식 확정값과 다를 수 있습니다.</li>
          <li>
            혜택·지원금은 추정치이며 실제 금액은 관할 지자체·발전사·한전 고지로 확정됩니다(법적 판정 아님).
          </li>
          <li>
            본 서비스는 정보의 정확성·완전성을 보증하지 않으며, 이용에 따른 판단과 책임은 이용자에게
            있습니다.
          </li>
        </ul>

        <div className="modal-foot">
          오류·정정 제보는 환영합니다. 최신 확정 정보는 각 발전사·산업통상자원부·관할 지자체 공고를 확인하세요.
        </div>
      </div>
    </div>
  )
}
