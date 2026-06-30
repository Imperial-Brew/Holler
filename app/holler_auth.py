"""
holler_auth.py - minimal, internalized auth for Holler.

Password + long-lived JWT. No external dependency, no new service to babysit.
Structured so that swapping Holler's self-issued tokens for an external IdP
(Authentik / Pocket ID / Authelia) later is a *localized* change - see
decode_token() and the SWAP POINT marker. When that day comes, the routes,
the get_current_user dependency, and the entire React frontend stay as-is.

Deps:
    pip install pyjwt bcrypt fastapi

One-time setup (see HOLLER_AUTH_SETUP.md for the full walk-through):
    1. python -c "import secrets; print(secrets.token_urlsafe(48))"   -> HOLLER_JWT_SECRET
    2. python holler_auth.py make-hash                                -> HOLLER_PW_HASH
"""
from __future__ import annotations

import os
import datetime as dt
from functools import lru_cache
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel


# ── Config (env-driven; nothing secret is hardcoded) ───────────────────────
JWT_ALG    = "HS256"
JWT_ISSUER = "holler"                 # who minted the token
TOKEN_TTL  = dt.timedelta(days=30)    # long-lived: log in ~once a month per device


@lru_cache
def _secret() -> str:
    v = os.environ.get("HOLLER_JWT_SECRET")
    if not v:
        raise RuntimeError(
            'Set HOLLER_JWT_SECRET. Generate one with:\n'
            '  python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    return v


@lru_cache
def _pw_hash() -> str:
    v = os.environ.get("HOLLER_PW_HASH")
    if not v:
        raise RuntimeError("Set HOLLER_PW_HASH  (python holler_auth.py make-hash)")
    return v


def _user() -> str:
    # Single human for now. When you add a second person, swap _user()/_pw_hash()
    # for a Postgres `users` table lookup - nothing else in this file changes.
    return os.environ.get("HOLLER_USER", "dustin")


# ── Password hashing (bcrypt direct - no passlib version drama) ────────────
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Token mint / verify ────────────────────────────────────────────────────
def create_token(subject: str) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": subject,
        "iss": JWT_ISSUER,
        "iat": now,
        "exp": now + TOKEN_TTL,
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    # ── SWAP POINT ─────────────────────────────────────────────────────────
    # TODAY: Holler signs its own tokens with a shared secret (HS256).
    # LATER (the "one login for all my stuff" dream): your IdP issues the
    # tokens. This becomes -> fetch the IdP's public keys (JWKS), verify
    # RS256, and check issuer + audience. Everything below stays untouched.
    return jwt.decode(
        token,
        _secret(),
        algorithms=[JWT_ALG],
        issuer=JWT_ISSUER,
        options={"require": ["exp", "sub", "iss"]},
    )


# ── FastAPI wiring ─────────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


def authenticate(username: str, password: str) -> Optional[str]:
    if username != _user():
        return None
    if not verify_password(password, _pw_hash()):
        return None
    return username


async def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    cred_err = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise cred_err
    sub = payload.get("sub")
    if not sub:
        raise cred_err
    return sub


# ── Routes - mount with: app.include_router(router) ────────────────────────
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    user = authenticate(form.username, form.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bad username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenOut(access_token=create_token(user))


@router.get("/me")
async def me(user: str = Depends(get_current_user)):
    return {"user": user}


# Protect any existing Holler route by adding the dependency, e.g.:
#
#   from holler_auth import get_current_user
#
#   @app.get("/tasks")
#   async def list_tasks(user: str = Depends(get_current_user)):
#       ...


# ── One-off helper: make a password hash for HOLLER_PW_HASH ────────────────
# Run:  python holler_auth.py make-hash
if __name__ == "__main__":
    import sys
    import getpass

    if len(sys.argv) > 1 and sys.argv[1] == "make-hash":
        pw = getpass.getpass("New Holler password: ")
        if pw != getpass.getpass("Confirm: "):
            sys.exit("Passwords didn't match.")
        print("\nSet this as HOLLER_PW_HASH:\n")
        print(hash_password(pw))
    else:
        print("usage: python holler_auth.py make-hash")
