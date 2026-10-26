import { Lines, Notice, SpeakerIcon, TopBar } from '../components/common';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 음성 질문: TTS로 읽고 큰 네/아니요로 답한다 (D28). 모든 단계에 "그냥 메뉴 볼래요" (D17) */
export function SurveyScreen() {
  const k = useKioskContext();
  const { state, catalog, currentQuestion: q, commands: c } = k;
  const total = catalog.questions?.length ?? 0;
  const waiting = total > 0 && state.surveyIndex >= total;

  return (
    <div className="screen">
      {/* 1번 질문에는 "이전"이 없다. "그냥 메뉴 볼래요"만 (v1.2) */}
      <TopBar onBack={waiting || state.surveyIndex === 0 ? undefined : c.back} />
      <div className="body">
        {catalog.questions === null ? (
          <div className="body center">
            {catalog.loadError
              ? <Notice message={catalog.loadError} actionLabel={TEXT.common.retry} onAction={c.retryLoad} />
              : <div className="spinner" />}
          </div>
        ) : waiting ? (
          <div className="body center">
            <div className="spinner" />
            <p className="hero"><Lines lines={TEXT.survey.waiting} /></p>
          </div>
        ) : q && (
          <>
            <div className="steps" aria-hidden>
              {Array.from({ length: total }, (_, i) => <i key={i} className={i <= state.surveyIndex ? 'on' : ''} />)}
            </div>
            <p className="lead mute">{TEXT.survey.progress(state.surveyIndex + 1, total)}</p>
            <p className="question">{q.text}</p>
            {k.speakerAvailable && (
              <div><button className="btn btn-quiet" onClick={c.readQuestion}><SpeakerIcon />{TEXT.survey.replay}</button></div>
            )}
            <div className="spacer" />
            <div className="answers">
              <button className="btn btn-primary" onClick={() => c.answer('yes')}>{TEXT.survey.yes}</button>
              <button className="btn" onClick={() => c.answer('no')}>{TEXT.survey.no}</button>
            </div>
          </>
        )}
        <button className="btn btn-quiet btn-block" onClick={c.exitSurvey}>{TEXT.survey.exit}</button>
      </div>
    </div>
  );
}
