import hashlib

import pytest

from menumate_engine.fetch import SOURCES, verify


def test_sources_are_pinned_and_licensed():
    assert set(SOURCES) == {'kr3', 'delivery', 'freqfood'}
    for s in SOURCES.values():
        assert s['url'].startswith('https://')
        assert s['license'] and s['name'] and s['page']
        assert s.get('sha256') or s.get('size')


def test_verify_checks_hash_and_size(tmp_path):
    f = tmp_path / 'x.bin'
    f.write_bytes(b'menumate')
    good = hashlib.sha256(b'menumate').hexdigest()
    assert verify(f, {'sha256': good})
    assert verify(f, {'size': 8})
    assert not verify(f, {'sha256': '0' * 64})
    assert not verify(f, {'size': 9})
    assert not verify(tmp_path / 'missing.bin', {'size': 8})
