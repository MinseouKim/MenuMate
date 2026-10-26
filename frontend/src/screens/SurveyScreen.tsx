import { Icon } from '../components/icons';
import { Lines, Notice, TopBar } from '../components/common';
import { questionLines, TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 음성 질문: 읽고, 같은 무게의 ○ 네 / ✕ 아니요로 답한다 (D28, 디자인 명세 2-8). 맨 아래 "그냥 메뉴 볼래요" (D17) */
export function SurveyScreen() {
  const k = useKioskContext();
  const { state, catalog, currentQuestion: q, commands: c } = k;
  const total = catalog.questions?.length ?? 0;
  const waiting = total > 0 && state.surveyIndex >= total;
  const n = state.surveyIndex + 1;

  if (waiting) {
    return (
      <div className="screen survey">
        <TopBar />
        <div className="body center wait">
          <div className="progress">
            <div className="boxes" aria-hidden>{Array.from({ length: total }, (_, i) => <i key={i} className="done" />)}</div>
          </div>
          <p className="t-h1"><Lines lines={TEXT.survey.waitTitle} /></p>
          <p className="t-body">{TEXT.survey.waitBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen survey">
      {/* 1번 질문에는 "이전"이 없다 (kiosk-flow v1.2) */}
      <TopBar onBack={n > 1 ? c.back : undefined} />
      <div className="body">
        {catalog.questions === null ? (
          catalog.loadError
            ? <Notice lines={[catalog.loadError]} actionLabel={TEXT.menu.retry} onAction={c.retryLoad} />
            : null
        ) : q && (
          <>
            <div className="progress">
              <p className="t-body t-bold">{TEXT.survey.progress(n, total)}</p>
              <div className="boxes" aria-hidden>
                {Array.from({ length: total }, (_, i) => <i key={i} className={i + 1 < n ? 'done' : i + 1 === n ? 'now' : ''} />)}
              </div>
            </div>
            {n === 1 && <p className="t-body"><Lines lines={TEXT.survey.intro} /></p>}
            <h1 className={n === 1 ? 't-h1 survey-title first' : 't-h1 survey-title'}><Lines lines={questionLines(q)} /></h1>
            {k.speakerAvailable && (
              k.speaking
                ? <button className="btn speak is-speaking" onClick={c.readQuestion}><Icon.speaking />{TEXT.survey.speaking}</button>
                : <button className="btn speak" onClick={c.readQuestion}><Icon.speaker />{TEXT.survey.replay}</button>
            )}
            <div className="answers">
              <button className="btn" onClick={() => c.answer('yes')}><Icon.yes />{TEXT.survey.yes}</button>
              <button className="btn" onClick={() => c.answer('no')}><Icon.no />{TEXT.survey.no}</button>
            </div>
          </>
        )}
        <div className="spacer" />
        <button className="btn btn-block" onClick={c.exitSurvey}>{TEXT.survey.exit}</button>
      </div>
    </div>
  );
}
