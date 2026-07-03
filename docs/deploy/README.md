# Deploying Holler with Docker Compose

## Prerequisites

- Docker & Docker Compose (v2)
- Copy `.env.example` to `.env` at the repo root and adjust values as needed
- **Set the auth variables** — `HOLLER_JWT_SECRET` and `HOLLER_PW_HASH` are
  required; the backend raises on the first login without them. Generate them
  per [HOLLER_AUTH_SETUP.md](../HOLLER_AUTH_SETUP.md):

  ```bash
  # signing secret -> HOLLER_JWT_SECRET
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  # password hash  -> HOLLER_PW_HASH
  python app/holler_auth.py make-hash
  ```

  `HOLLER_USER` is optional (defaults to `dustin`).

## Bring it up

```bash
docker compose up -d --build
```

Three services start:

| Service    | Description                                  | Port |
|------------|----------------------------------------------|------|
| `db`       | Postgres 16 — data in a named volume         | 5432 (internal) |
| `backend`  | FastAPI via Uvicorn                           | 8000 (internal) |
| `frontend` | Caddy serving the React PWA + reverse-proxying `/api` to `backend` | 80 (host, configurable via `APP_PORT`) |

The backend waits for the database healthcheck before starting.

## Run migrations & seed

After the stack is up, run Alembic migrations and seed data inside the backend container:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
```

## Access the app

Open `http://localhost` (or `http://localhost:<APP_PORT>` if you changed the port).

The frontend Caddy server handles:
- Static file serving for the React PWA
- Reverse proxy: `/api/*` → `backend:8000` (with the `/api` prefix stripped)
- SPA fallback: unknown paths return `index.html`
- Cache headers: `no-cache` on HTML/service-worker, `immutable` on hashed
  `/assets/*` — so a rebuild reaches installed PWAs on the next load

## HTTPS (public exposure)

The Caddyfile defines a second listener on `:14443` for
`holler.drabapps.com` that obtains and renews a Let's Encrypt cert via the
Porkbun DNS challenge — set `PORKBUN_API_KEY` / `PORKBUN_API_SECRET_KEY` and
forward the port. The plain-HTTP `:80` listener needs neither and is fine for
LAN use. Do not forward `:80` to the public internet — login and tokens
travel in cleartext over HTTP (see [HOLLER_AUTH_SETUP.md](../HOLLER_AUTH_SETUP.md)).

## Postgres data volume

Data is stored in a Docker named volume called `pgdata`. It survives `docker compose down && docker compose up`.

To place the volume on a specific disk (e.g. an SSD), configure the Docker Desktop data directory or the Docker daemon's `data-root` setting to point at that disk. The named volume will then live on that disk automatically.

To fully remove the volume (destroys all data):

```bash
docker compose down -v
```

## Environment variables

See `.env.example` for all available variables. Key ones:

| Variable            | Used by   | Description |
|---------------------|-----------|-------------|
| `POSTGRES_USER`     | db        | Postgres username |
| `POSTGRES_PASSWORD` | db        | Postgres password |
| `POSTGRES_DB`       | db        | Database name |
| `HOLLER_JWT_SECRET` | backend   | **Required.** Secret that signs login tokens |
| `HOLLER_PW_HASH`    | backend   | **Required.** bcrypt hash of the login password |
| `HOLLER_USER`       | backend   | Login username (default: `dustin`) |
| `CORS_ORIGINS`      | backend   | Allowed origins (single-origin setup makes this less relevant) |
| `SECRET_KEY`        | backend   | Unused — superseded by `HOLLER_JWT_SECRET` |
| `VITE_AUTH_TOKEN`   | frontend  | Legacy stub baked into the build; not used by auth anymore |
| `APP_PORT`          | frontend  | Host port to expose (default: 80) |
| `PORKBUN_API_KEY` / `PORKBUN_API_SECRET_KEY` | caddy | Only for the public HTTPS listener on `:14443` (Let's Encrypt via DNS challenge). Plain HTTP on `:80` needs neither. |

`DATABASE_URL` and `DATABASE_URL_SYNC` are constructed automatically in `docker-compose.yml` from the Postgres credentials — no need to set them manually. `FORWARDED_ALLOW_IPS` is set to `*` in compose so uvicorn trusts Caddy's `X-Forwarded-Proto` (otherwise redirects come back as `http`).

## Rebuild after code changes

```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head
```
