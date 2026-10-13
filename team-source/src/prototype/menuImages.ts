// menu/image/ 폴더의 사진을 메뉴 id로 찾습니다. 파일 이름 = 메뉴 id (예: dimsum-1.webp)
const files = import.meta.glob<string>('./menu/image/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' });
const byId: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]),
);
export const menuImage = (id: string): string | undefined => byId[id];
// 사진이 한 장도 없으면 카드에 빈 사진 칸을 그리지 않습니다(전시에서 미완성으로 보이지 않게).
export const hasAnyPhoto = Object.keys(byId).length > 0;
