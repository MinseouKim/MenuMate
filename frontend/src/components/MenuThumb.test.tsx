import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Category, MenuItem } from '../api/contracts';
import { MenuThumb } from './common';

const categories: Category[] = [{ id: 'a', name: 'A', sortOrder: 2 }, { id: 'b', name: 'B', sortOrder: 1 }];
const item = (imageUrl: string | null): MenuItem => ({
  id: 'm1', name: '된장찌개', price: 9000, categoryId: 'a', description: null, imageUrl, tags: [], priority: 0, sortOrder: 1,
});

describe('메뉴 사진 (D77, D40)', () => {
  it('사진이 있으면 사진을 크게 보여 준다 (자리 크기를 미리 잡아 화면이 흔들리지 않게)', () => {
    const { container } = render(<MenuThumb item={item('/static/menu-images/m1.jpg')} categories={categories} />);
    const img = container.querySelector('img.thumb')!;
    expect(img.getAttribute('src')).toBe('/static/menu-images/m1.jpg');
    expect(img.getAttribute('width')).toBeTruthy();
    expect(img.getAttribute('height')).toBeTruthy();
    expect(img.getAttribute('alt')).toBe('');
  });

  it('사진이 없으면 카테고리 순서의 색 카드 + 메뉴명', () => {
    const { container } = render(<MenuThumb item={item(null)} categories={categories} />);
    const card = container.querySelector('div.thumb')!;
    expect(card.textContent).toBe('된장찌개');
    expect(card.getAttribute('data-tint')).toBe('2'); // sortOrder 순서로 두 번째 카테고리
  });

  it('사진을 못 불러오면 색 카드로 바꾸고, 다른 사진 주소가 오면 다시 사진을 시도한다', () => {
    const { container, rerender } = render(<MenuThumb item={item('/static/broken.jpg')} categories={categories} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('div.thumb')!.textContent).toBe('된장찌개');
    rerender(<MenuThumb item={item('/static/ok.jpg')} categories={categories} />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/static/ok.jpg');
  });
});
