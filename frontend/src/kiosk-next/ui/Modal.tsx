import { useEffect, useRef, type ReactNode } from 'react';

/** 팝업. 브라우저 기본 <dialog>를 써서 포커스 가두기·Esc 닫기를 그대로 얻습니다. */
export function Modal({ title, aside, onClose, hideClose = false, className = '', children }: { title: string; aside?: ReactNode; onClose: () => void; hideClose?: boolean; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className={`kx-modal ${className}`.trim()} aria-labelledby="kx-modal-title" onCancel={onClose}>
      <div className="kx-modal-head">
        <div className="kx-modal-title"><h2 id="kx-modal-title">{title}</h2>{aside}</div>
        {!hideClose && <button className="kx-btn kx-btn-quiet" onClick={onClose} aria-label="팝업 닫기">닫기</button>}
      </div>
      <div className="kx-modal-body">{children}</div>
    </dialog>
  );
}
