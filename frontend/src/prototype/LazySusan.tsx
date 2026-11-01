// 시작 화면 원탁(회전판). 금박 띠의 징이 아주 느리게 돈다. 색·크기는 styles/theme.css
const STUDS = 24;
export function LazySusan({ label }: { label: string }) {
  return (
    <div className="table" role="img" aria-label={label}>
      <svg className="table-art" viewBox="0 0 200 200" aria-hidden="true">
        <circle className="t-rim" cx="100" cy="100" r="98" />
        <g className="t-spin">
          <circle className="t-band" cx="100" cy="100" r="90" />
          {Array.from({ length: STUDS }, (_, i) => {
            const a = (i / STUDS) * Math.PI * 2;
            return <circle key={i} className="t-stud" cx={100 + Math.cos(a) * 85} cy={100 + Math.sin(a) * 85} r="2.4" />;
          })}
        </g>
        <circle className="t-edge" cx="100" cy="100" r="80" />
        <circle className="t-top" cx="100" cy="100" r="77" />
        <circle className="t-inner" cx="100" cy="100" r="68" />
      </svg>
      <span className="table-name" aria-hidden="true">{label}</span>
    </div>
  );
}
