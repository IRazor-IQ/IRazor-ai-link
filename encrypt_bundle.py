#!/usr/bin/env python3
"""
IRazor Bundle Encryptor — uses cryptography lib (matches Java AES/CBC/PKCS5Padding exactly)
Usage:
    python3 encrypt_bundle.py                  → bundle.zip → bundle.enc
    python3 encrypt_bundle.py input.zip        → custom input
    python3 encrypt_bundle.py input.zip out.enc

Output: bundle.enc — ضعه في app/src/main/assets/
Format: [16 bytes IV][AES-256-CBC encrypted ZIP]
Key:    PBKDF2-HMAC-SHA256(password, salt, 65536 iter, 32 bytes)
"""

import sys, os, hashlib
from pathlib import Path

# ── Must match MainActivity.kt ─────────────────────────────────────────────────
PASSWORD = b"IRazorSecretKey2025!"
SALT     = b"IRazorSalt1234567890"
ITER     = 65536
KEY_LEN  = 32

def encrypt(input_path: Path, output_path: Path):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives import padding
    from cryptography.hazmat.backends import default_backend

    print(f"[IRazor] Reading   : {input_path}")
    data = input_path.read_bytes()
    print(f"[IRazor] Input     : {len(data):,} bytes")

    print(f"[IRazor] Deriving key (PBKDF2 {ITER} iter)…")
    key = hashlib.pbkdf2_hmac('sha256', PASSWORD, SALT, ITER, KEY_LEN)
    iv  = os.urandom(16)

    print(f"[IRazor] Encrypting (AES-256-CBC / PKCS7)…")
    padder = padding.PKCS7(128).padder()
    padded = padder.update(data) + padder.finalize()

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    enc = cipher.encryptor()
    ct = enc.update(padded) + enc.finalize()

    output_path.write_bytes(iv + ct)
    print(f"[IRazor] Output    : {output_path}  ({len(iv+ct):,} bytes)")
    print(f"[IRazor] Done ✅   ضع bundle.enc في app/src/main/assets/")

if __name__ == "__main__":
    inp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("bundle.zip")
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("bundle.enc")
    if not inp.exists():
        print(f"[IRazor] ❌ ما لقيت الملف: {inp}"); sys.exit(1)
    encrypt(inp, out)
