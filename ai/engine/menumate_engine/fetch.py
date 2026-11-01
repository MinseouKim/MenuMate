"""학습 데이터 받기. 인터넷이 필요한 건 이 단계뿐이다. 받은 파일은 data/(git 제외)에 둔다.

    .venv/bin/python -m menumate_engine.fetch
출처와 라이선스는 ai/docs/datasets.md.
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / 'data'

SOURCES = {
    'kr3': {
        'name': 'KR3: Korean Restaurant Reviews with Ratings',
        'page': 'https://huggingface.co/datasets/leey4n/KR3',
        'license': 'CC BY-NC-SA 4.0',
        'url': 'https://huggingface.co/datasets/leey4n/KR3/resolve/290dc889066d7127077a2bec7f0be726fdeaa760/kr3.parquet',
        'file': 'kr3.parquet',
        'sha256': 'fdd83253eb3b69ce94956e58fd5578ea39d2459e45383f4a0c1ab35ad9354c5b',
    },
    'delivery': {
        'name': 'Bias-Free Dataset of Food Delivery App Reviews with Data Poisoning Attacks (v2, Korean)',
        'page': 'https://data.mendeley.com/datasets/rnyrpzyw3h/2',
        'license': 'CC BY 4.0',
        'url': 'https://data.mendeley.com/public-files/datasets/rnyrpzyw3h/files/52fd38ac-5bf6-44f3-ab15-92254b21fb2a/file_downloaded',
        'file': 'delivery_ko.csv',
        'sha256': '1dc78b0bc2542f16e24e24c77048bc564d36d172e514a42b5397424b9e38605b',
    },
    'freqfood': {
        'name': '한국보건산업진흥원_국민영양통계 다빈도음식의 식품섭취량',
        'page': 'https://www.data.go.kr/data/15160119/fileData.do',
        'license': '공공데이터 이용허락범위 제한 없음',
        'url': 'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003668305&fileDetailSn=1&insertDataPrcus=N',
        'file': 'freqfood.csv',
        # 공공데이터포털은 같은 주소로 갱신본을 줄 수 있어 해시 대신 받은 크기를 적는다 (2026-09-26 갱신본)
        'size': 521770,
    },
}


def verify(path: Path, source: dict) -> bool:
    if not path.exists():
        return False
    if source.get('sha256'):
        h = hashlib.sha256()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''):
                h.update(chunk)
        return h.hexdigest() == source['sha256']
    return path.stat().st_size == source.get('size')


def fetch(key: str) -> Path:
    s = SOURCES[key]
    dest = DATA_DIR / s['file']
    if verify(dest, s):
        print(f'  있음  {dest.name}')
        return dest
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + '.part')
    print(f'  받는 중 {dest.name} ...', flush=True)
    req = urllib.request.Request(s['url'], headers={'User-Agent': 'Mozilla/5.0 (MenuMate engine)'})
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, 'wb') as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    if not verify(tmp, s):
        tmp.unlink(missing_ok=True)
        raise SystemExit(f'{dest.name}: 해시/크기가 맞지 않습니다. 출처가 바뀌었는지 datasets.md를 확인하세요.')
    tmp.rename(dest)
    return dest


if __name__ == '__main__':
    for key in sys.argv[1:] or SOURCES:
        fetch(key)
    print('완료')
