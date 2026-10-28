/**
 * 손님 정보(발화 원문 등)가 서버 로그에 남지 않게, 에러를 로그용 문자열로 바꾼다.
 * - 에러 객체를 통째로 찍지 않는다: body-parser 에러는 `body`에 요청 원문을, DB 에러는 `sql`에 쿼리를 담고 있다.
 * - SyntaxError(JSON.parse 실패)는 메시지에 입력 문자열 일부가 들어가므로 메시지도 남기지 않는다.
 */
export function safeErrorLog(err: unknown, withStack = false): string {
  if (!(err instanceof Error)) return `non-Error thrown (${typeof err})`;
  const message = err instanceof SyntaxError ? "(내용 생략)" : err.message;
  const stack = withStack && err.stack ? `\n${err.stack.split("\n").slice(1).join("\n")}` : "";
  return `${err.name}: ${message}${stack}`;
}
