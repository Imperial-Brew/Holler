# Deploying Holler with Docker Compose

## Prerequisites

- Docker & Docker Compose (v2)
- Copy `.env.example` to `.env` at the repo root and adjust values as needed

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
| `SECRET_KEY`        | backend   | App secret (unused currently) |
| `CORS_ORIGINS`      | backend   | Allowed origins (single-origin setup makes this less relevant) |
| `VITE_AUTH_TOKEN`    | frontend  | Stub auth token baked into frontend build |
| `APP_PORT`          | frontend  | Host port to expose (default: 80) |

`DATABASE_URL` and `DATABASE_URL_SYNC` are constructed automatically in `docker-compose.yml` from the Postgres credentials — no need to set them manually.

## Rebuild after code changes

```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head
```
