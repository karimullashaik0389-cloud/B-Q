#!/usr/bin/env python3
"""BQE1 file encryption used by the B&Q dashboards (same scheme as the web page).

File layout: b"BQE1" + salt(16) + iv(12) + AES-256-GCM ciphertext+tag.
Key = PBKDF2-HMAC-SHA256(password, salt, 600000 iterations).
New tab files (duplicates, buy box, codes, All variant) use the shared salt AUX_SALT so the page can
re-use one key after unlocking; any BQE1 file still decrypts with the password + the salt in its header.

The password is NEVER passed on the command line or printed. It comes from the environment variable
BQ_PASSWORD (GitHub Actions secret) or from a file named in BQ_PASSWORD_FILE.

  python3 bqcrypt.py enc IN OUT      python3 bqcrypt.py dec IN OUT
"""
import os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 600000
AUX_SALT = bytes.fromhex("94ccba845e4963161cceda2f070f59d4")   # public by design (it is in every file header)
_cache = {}

def password():
    pw = os.environ.get("BQ_PASSWORD")
    if not pw and os.environ.get("BQ_PASSWORD_FILE"):
        pw = open(os.environ["BQ_PASSWORD_FILE"]).read()
    pw = (pw or "").strip()
    if not pw:
        raise SystemExit("bqcrypt: no password (set BQ_PASSWORD or BQ_PASSWORD_FILE)")
    return pw.encode()

def key(salt):
    if salt not in _cache:
        _cache[salt] = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(password())
    return _cache[salt]

def encrypt(data, salt=AUX_SALT):
    iv = os.urandom(12)
    return b"BQE1" + salt + iv + AESGCM(key(salt)).encrypt(iv, data, None)

def decrypt(blob):
    if blob[:4] != b"BQE1" or len(blob) < 48:
        raise ValueError("not a BQE1 file")
    return AESGCM(key(bytes(blob[4:20]))).decrypt(bytes(blob[20:32]), bytes(blob[32:]), None)

if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("enc", "dec"):
        raise SystemExit(__doc__)
    data = open(sys.argv[2], "rb").read()
    out = encrypt(data) if sys.argv[1] == "enc" else decrypt(data)
    open(sys.argv[3], "wb").write(out)
