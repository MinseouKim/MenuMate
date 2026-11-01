import "@testing-library/jest-dom/vitest";
// jsdom에는 ResizeObserver가 없어서(담은 메뉴 목록 높이 계산에 사용) 테스트용 빈 구현을 넣습니다.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
