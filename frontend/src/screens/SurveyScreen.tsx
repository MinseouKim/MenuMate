import { Notice, SpeakerIcon, TopBar } from '../components/common';
import type { KioskController } from '../kiosk/useKiosk';

/** 음성 질문: TTS로 읽고 큰 네/아니요로 답한다 (D28). 모든 단계에 "그냥 메뉴 볼래요" (D17) */
export function SurveyScreen({ k }: { k: KioskController }) {
  const { state, catalog, currentQuestion: q, commands: c } = k;
  const total = catalog.questions?.length ?? 0;
  const waiting = total > 0 && state.surveyIndex >= total;

  return (
    <div className="screen">
      <TopBar mode={state.mode} storeName={catalog.menu?.storeName} onToggleMode={c.toggleMode}
        onBack={waiting ? undefined : c.back} />
      <div className="body">
        {catalog.questions === null ? (
          <div className="body center">
            {catalog.loadError
              ? <Notice message={catalog.loadError} actionLabel="다시 시도" onAction={c.retryLoad} />
              : <div className="spinner" />}
          </div>
        ) : waiting ? (
          <div className="body center">
            <div className="spinner" />
            <p className="hero">추천 메뉴를<br />고르고 있어요</p>
          </div>
        ) : q && (
          <>
            <div className="steps" aria-hidden>
              {Array.from({ length: total }, (_, i) => <i key={i} className={i <= state.surveyIndex ? 'on' : ''} />)}
            </div>
            <p className="lead mute">질문 {state.surveyIndex + 1} / {total}</p>
            <p className="question">{q.text}</p>
            {k.speakerAvailable && (
              <div><button className="btn btn-quiet" onClick={c.readQuestion}><SpeakerIcon />다시 듣기</button></div>
            )}
            <div className="spacer" />
            <div className="answers">
              <button className="btn btn-primary" onClick={() => c.answer('yes')}>네</button>
              <button className="btn" onClick={() => c.answer('no')}>아니요</button>
            </div>
          </>
        )}
        <button className="btn btn-quiet btn-block" onClick={c.exitSurvey}>그냥 메뉴 볼래요</button>
      </div>
    </div>
  );
}
