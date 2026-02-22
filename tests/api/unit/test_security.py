"""
Unit tests for the security module (Fernet encrypt/decrypt).
"""
import os
import pytest
from cryptography.fernet import Fernet


@pytest.fixture(autouse=True)
def set_encryption_key(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("ENCRYPTION_KEY", key)
    # Clear lru_cache so the new env var is picked up
    from app.core import config
    config.get_settings.cache_clear()
    yield
    config.get_settings.cache_clear()


def test_encrypt_decrypt_roundtrip():
    from app.core.security import encrypt_api_key, decrypt_api_key
    original = "sk-test-1234567890abcdef"
    encrypted = encrypt_api_key(original)
    assert encrypted != original
    assert decrypt_api_key(encrypted) == original


def test_encrypt_produces_different_ciphertext_each_time():
    from app.core.security import encrypt_api_key
    key = "sk-test-abc"
    # Fernet uses a random IV so each call produces different ciphertext
    enc1 = encrypt_api_key(key)
    enc2 = encrypt_api_key(key)
    assert enc1 != enc2


def test_decrypt_wrong_key_raises():
    from cryptography.fernet import Fernet, InvalidToken
    from app.core.security import encrypt_api_key
    encrypted = encrypt_api_key("secret-key")

    # Decrypt with a different key
    other_fernet = Fernet(Fernet.generate_key())
    with pytest.raises(InvalidToken):
        other_fernet.decrypt(encrypted.encode())


def test_encrypt_empty_string():
    from app.core.security import encrypt_api_key, decrypt_api_key
    encrypted = encrypt_api_key("")
    assert decrypt_api_key(encrypted) == ""


def test_encrypt_unicode():
    from app.core.security import encrypt_api_key, decrypt_api_key
    original = "sk-🔑-unicode-key"
    encrypted = encrypt_api_key(original)
    assert decrypt_api_key(encrypted) == original
