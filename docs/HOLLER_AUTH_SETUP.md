# Holler auth — setup & roadmap

Internalized auth for Holler: a password login that issues a long-lived JWT.
No external service, no new dependency to babysit, fully owned and traceable —
and deliberately shaped so it becomes the on-ramp to a self-hosted "one login
for all my stuff" identity layer later, instead of something you throw away.

Two files:
- `holler_auth.py` — FastAPI backend (login route + route-guard dependency)
- `holler_auth_client.js` — React/PWA frontend (caches token, attaches it, handles 401)

---

## Setup (~15 min)

**1. Install deps**
```
pip install pyjwt bcrypt
```

**2. Generate a signing secret**
```
python -c "import secrets; print(secrets.token_urlsafe(48))"
```
Set it as the `HOLLER_JWT_SECRET` env var.

**3. Make your password hash**
```
python holler_auth.py make-hash
```
Set the output as `HOLLER_PW_HASH`. Optionally set `HOLLER_USER` (defaults to `dustin`).

**4. Wire it into the backend** (`main.py`)
```python
from holler_auth import router, get_current_user

app.include_router(router)        # adds POST /auth/login and GET /auth/me

# guard any existing route by adding the dependency:
@app.get("/tasks")
async def list_tasks(user: str = Depends(get_current_user)):
    ...
```

**5. Wire it into the frontend**
Set `VITE_API_URL` to where the backend answers, then use `login()` and
`authFetch()` from `holler_auth_client.js` (usage sketch is at the bottom of
that file).

---

## The one box left to check before this faces the public IP: HTTPS

Auth fixes *who can get in*. It does **not** fix *who can read the traffic*.
Over plain HTTP on a public static IP, the password and the token travel in
cleartext and can be sniffed off the wire. So before you forward a TorGuard
port at this:

- Put a TLS-terminating reverse proxy in front (Caddy will get and renew a
  cert with almost no config), **or**
- At minimum run a self-signed cert and accept it on your devices.

Bind Holler to `0.0.0.0` only *behind* that proxy; let the proxy be the only
thing actually exposed. With login + HTTPS in place, a forwarded port on
146.70.x.x is a reasonable thing to do — which it absolutely was not before.

Other knobs:
- Token lifetime is 30 days (`TOKEN_TTL` in `holler_auth.py`). Shorten for
  tighter security, lengthen for fewer logins.
- One user, seeded from env. Add a Postgres `users` table when there's a
  second human — only `_user()` / `_pw_hash()` change.

---

## The roadmap: from this → "my phone is me, everything checks one source"

You sized the identity layer correctly as a ~1-year project — it earns its
keep at app three or four (doors, latches, codes), not app one. Here's why
tonight's choice doesn't fight that future and actively pours its first slab:

This auth is built around *"validate a token, trust an issuer."* That's the
exact shape an OIDC IdP (Authentik / Pocket ID / Authelia) speaks. When you
stand one up:

1. In `holler_auth.py`, change **`decode_token()`** to verify the IdP's tokens
   — RS256 against the IdP's published keys (JWKS), checking issuer + audience.
   That's the **SWAP POINT** comment in the file.
2. `get_current_user`, every guarded route, and the entire React app stay
   **unchanged** — they already just trust a verified token.
3. `/auth/login` retires (the IdP hosts the login page); the frontend's
   `login()` becomes "redirect to the IdP" instead of posting a password.

Same shape, new issuer. The ESP32 side of the dream — a door reader checking
an RFID/token against that *same* identity your phone carries — bolts onto the
exact same "trust the issuer" foundation. Holler stays the hub it all reports to.

Tonight you're not choosing between the quick fix and the dream. You're
pouring the slab the dream bolts onto.
