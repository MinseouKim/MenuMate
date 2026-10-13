import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export function Modal({ title, aside, large, children, onClose }: { title: string; aside?: ReactNode; large?: boolean; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`menu-info-dialog ${large ? 'large-dialog' : ''}`} aria-labelledby="modal-title" onCancel={onClose}><div className="info-heading"><div className="info-title"><h2 id="modal-title">{title}</h2>{aside}</div><button onClick={onClose} aria-label="팝업 닫기">닫기</button></div>{children}</dialog>;
}
