# -*- coding: utf-8 -*-
"""One-time interactive setup for the local VOOM admin account."""
import getpass, hashlib, json, os, secrets, subprocess, sys
from pathlib import Path

auth_dir = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Voom_system" / "SecurityDashboard"
auth_file = auth_dir / "admin_auth.json"
auth_dir.mkdir(parents=True, exist_ok=True)
if auth_file.exists():
    answer = input("An admin config already exists. Replace it and invalidate existing credentials? Type RESET to continue: ").strip()
    if answer != "RESET":
        print("No changes made.")
        raise SystemExit(0)
username = input("Admin username [admin]: ").strip() or "admin"
if len(username) > 80 or not username.replace("_","").replace("-","").isalnum():
    print("Username must contain only letters, numbers, underscore or hyphen.")
    raise SystemExit(2)
while True:
    password = getpass.getpass("Set a strong admin password (16+ characters): ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.")
        continue
    if len(password) < 16:
        print("Password must be at least 16 characters.")
        continue
    break
salt = secrets.token_bytes(16)
derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
data = {"username": username, "role": "admin", "salt": salt.hex(), "password_hash": derived.hex(), "kdf": "scrypt-n16384-r8-p1", "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}
auth_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
try:
    subprocess.run(["icacls", str(auth_dir), "/inheritance:r", "/grant:r", f"{getpass.getuser()}:(OI)(CI)F", "SYSTEM:(OI)(CI)F"], check=True, capture_output=True, text=True)
    subprocess.run(["icacls", str(auth_file), "/inheritance:r", "/grant:r", f"{getpass.getuser()}:F", "SYSTEM:F"], check=True, capture_output=True, text=True)
    print("Windows ACL hardening: applied")
except Exception as exc:
    print("WARNING: Windows ACL hardening could not be verified automatically.")
    print("Restrict this file and folder to the current Windows user and SYSTEM before production.")
print(f"Admin configuration created: {auth_file}")
print("Password is not stored in plaintext. Keep it in a password manager.")
print("Now start with: python server.py")
