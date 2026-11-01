import { useState } from 'react';
import type { MenuReview } from './menuReviews';

// 긴 리뷰는 요약을 먼저 보여 주고, '전체 리뷰 보기'로 원문 전체를 펼칩니다.
export function ReviewItem({ review }: { review: MenuReview }) {
  const [open, setOpen] = useState(false); const short = review.summary && !open;
  return <li>
    {review.scope && <span className="review-scope">{review.scope}</span>}
    {short ? <p className="review-summary-text"><span className="review-summary-label">요약</span>{review.summary}</p> : <q>{review.quote}</q>}
    {review.summary && <button className="review-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '요약 보기' : '전체 리뷰 보기'}</button>}
    <span className="review-meta">{review.platform}{review.rating !== null && <> · <span aria-label={`별점 ${review.rating}점`}>{'★'.repeat(review.rating)}</span></>} · {review.date}</span>
  </li>;
}
