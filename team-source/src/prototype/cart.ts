// 장바구니 줄 계산. 같은 메뉴라도 옵션(예: 굴소스/마늘소스)이 다르면 다른 줄로 담습니다.
import type { Line, Menu } from './types';

export const lineKey = (line: Line) => (line.option ? `${line.id}|${line.option}` : line.id);
export const findMenu = (menus: Menu[], id: string) => menus.find(m => m.id === id)!;
export const lineName = (menu: Menu, line: Line) => (line.option ? `${menu.name} (${line.option})` : menu.name);
export const linesTotal = (lines: Line[], menus: Menu[]) => lines.reduce((n, l) => n + findMenu(menus, l.id).price * l.quantity, 0);

// 새로 담은 메뉴는 맨 위에, 같은 메뉴·같은 옵션은 수량만 더합니다.
// 한상 구성처럼 여러 개를 한 번에 담으면 구성 순서(요리 → 식사 → 곁들임) 그대로 위에서부터 보이게 뒤에서부터 넣습니다.
export function addLines(previous: Line[], items: Line[]): Line[] {
  const next = previous.map(l => ({ ...l }));
  for (const item of [...items].reverse()) {
    const old = next.find(l => lineKey(l) === lineKey(item));
    if (old) old.quantity += item.quantity; else next.unshift({ ...item });
  }
  return next;
}

// 옵션이 있는 메뉴를 옵션 없이 담을 때(추천 조합 담기 등)는 첫 번째 옵션을 기본으로 씁니다.
export const withDefaultOption = (line: Line, menus: Menu[]): Line => {
  const options = findMenu(menus, line.id).options;
  return options?.length && !line.option ? { ...line, option: options[0] } : line;
};

// 결제 직전 "함께 드시면 좋아요": 담은 메뉴의 곁들임 중 아직 안 담았고 품절이 아닌 메뉴, 최대 3개.
export function suggestions(lines: Line[], menus: Menu[]): Menu[] {
  const inCart = new Set(lines.map(l => l.id));
  const ids = [...new Set(lines.flatMap(l => findMenu(menus, l.id).pairings))].filter(id => !inCart.has(id));
  return ids.map(id => menus.find(m => m.id === id)).filter((m): m is Menu => !!m && !m.soldOut).slice(0, 3);
}
