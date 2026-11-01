// 메뉴 사진 한 장. 칸을 꽉 채우며(object-fit: cover) 기준점(focus)에 맞춰 잘라 음식이 가운데 오게 합니다.
export function Photo({ src, focus, className, onError }: { src: string; focus?: string; className?: string; onError?: () => void }) {
  return <img className={className} src={src} alt="" loading="lazy" style={{ objectPosition: focus }} onError={onError} />;
}
