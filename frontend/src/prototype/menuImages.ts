// menu/image/ 폴더의 사진을 메뉴 id로 찾습니다. 파일 이름 = 메뉴 id (예: dimsum-1.webp)
const files = import.meta.glob<string>('./menu/image/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' });
const byId: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]),
);
export const menuImage = (id: string): string | undefined => byId[id];

// 사진을 칸에 맞춰 자를 때(object-fit: cover) 음식이 가운데 오도록 하는 기준점(object-position).
// 세로로 길거나 가로로 아주 긴 네이버 사진만 적습니다. 없는 id 는 가운데(50% 50%)입니다. 값은 2026-11-01 4:3 크롭 미리보기로 정했습니다.
const focusById: Record<string, string> = {
  'noodle-3': '50% 60%', 'noodle-2': '50% 36%', 'noodle-7': '48% 52%',
  'dimsum-1': '46% 58%', 'dimsum-3': '50% 56%', 'dimsum-4': '48% 56%',
  'cold-4': '46% 56%', 'chicken-1': '55% 58%', 'seafood-6': '52% 58%', 'soup-4': '44% 53%', 'pork-2': '55% 55%',
  // 베이징덕은 가로로 아주 긴 사진(1.83:1)이라 좁은 칸에서는 양옆이 잘립니다. 오리 머리가 오른쪽 끝에 있어 오른쪽을 기준으로 둡니다(왼쪽 다리 끝만 잘림).
  'duck-fish-1': '69% 50%', 'duck-fish-2': '55% 56%',
};
export const menuImageFocus = (id: string): string | undefined => focusById[id];
// 사진이 한 장도 없으면 카드에 빈 사진 칸을 그리지 않습니다(전시에서 미완성으로 보이지 않게).
export const hasAnyPhoto = Object.keys(byId).length > 0;
