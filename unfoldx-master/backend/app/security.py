"""Credential vault (Fernet), password hashing (scrypt), and tokens (JWT).

Production note: a real deployment would keep the Fernet key in a KMS/secret manager and rotate it;
here it comes from FERNET_KEY (or is derived from SECRET_KEY in dev)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet, InvalidToken


class Vault:
    def __init__(self, fernet_key: str | None, secret_key: str):
        if fernet_key:
            key = fernet_key.encode()
        else:
            key = base64.urlsafe_b64encode(hashlib.sha256(("vault:" + secret_key).encode()).digest())
        self._f = Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        return self._f.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._f.decrypt(ciphertext.encode()).decode()
        except InvalidToken as e:  # wrong key or tampered ciphertext
            raise ValueError("credential could not be decrypted (wrong FERNET_KEY?)") from e


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except ValueError:
        return False


def create_token(user_id: str, secret: str, ttl_minutes: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    return jwt.encode({"sub": user_id, "exp": exp, "iss": "uaw"}, secret, algorithm="HS256")


def decode_token(token: str, secret: str, *, external: bool = False) -> dict:
    opts = {"verify_aud": False} if external else {}
    return jwt.decode(token, secret, algorithms=["HS256"], options=opts)
