// 카메라·마이크 권한 요청과 실패 원인별 안내 문구.
export type Device = '마이크' | '카메라';

export function mediaErrorMessage(error: unknown, device: Device): string {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return `보안 주소(https 또는 localhost)에서만 ${device}를 쓸 수 있어요. 주소를 확인해 주세요.`;
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return `${device} 권한이 막혀 있어요. 주소창 왼쪽 아이콘에서 ${device}를 '허용'으로 바꾼 뒤 새로고침해 주세요. 앱 안의 미리보기 창이라면 Chrome에서 직접 열어 주세요.`;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return `연결된 ${device}를 찾지 못했어요. ${device} 연결을 확인해 주세요.`;
  if (name === 'NotReadableError' || name === 'AbortError') return `다른 프로그램이 ${device}를 사용 중이에요. 화상회의 앱 등을 닫고 다시 시도해 주세요.`;
  return `${device}를 시작하지 못했어요. 버튼으로 골라 주세요.`;
}

/** 마이크 권한만 미리 받아 두고 바로 끕니다. 성공하면 null, 실패하면 안내 문구를 돌려줍니다. */
export async function requestMicrophone(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) return mediaErrorMessage(new DOMException('', 'NotSupportedError'), '마이크');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach(t => t.stop());
    return null;
  } catch (error) {
    return mediaErrorMessage(error, '마이크');
  }
}

/** 이미 허용된 상태인지 확인합니다. 확인할 수 없으면 false. */
export async function microphoneGranted(): Promise<boolean> {
  try { return (await navigator.permissions?.query({ name: 'microphone' as PermissionName }))?.state === 'granted'; } catch { return false; }
}
