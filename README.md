# Wanna2Play

Wanna2Play is a small self-hosted web app to browse *all* your game libraries (Steam, Epic, GOG, …) and quickly answer: **“What can I play?”**

The long-term goal is a catalog-first experience (not “installed games only”), with:
- a simple UI (search → cards → details)
- semantic search (Qdrant vectors + Ollama embeddings)
- a lightweight relational store for structured metadata (SQLite)

This repo is an MVP scaffold: ingestion/crawlers will come later.

## Quick start (Docker Compose)

1) Optional: enable semantic search via Ollama
- Install & run Ollama on your machine (or anywhere reachable).
- Copy the env file and set `OLLAMA_BASE_URL`:

```bash
cp .env.example .env
```

2) Start the stack

```bash
docker compose up --build
```

3) Open the app
- `http://localhost:3210`
- Click **“Seed demo data”** to populate a small sample library.

Notes:
- The app is exposed on `0.0.0.0:3210` by default (LAN access). If you want localhost-only, change the port mapping in `docker-compose.yml` to `127.0.0.1:3210:3000`.
- Qdrant is only exposed to the Docker network by default (no host port binding).
- If `OLLAMA_BASE_URL` is not set or Ollama is unreachable, Wanna2Play falls back to keyword search (SQLite `LIKE`).
- If you run Ollama on the host *outside* Docker, make sure the URL is reachable from inside the container (e.g. `http://host.docker.internal:11434` on some setups, or your host IP).

## Import your Steam library

1) Configure your Steam credentials in `.env`:
- `STEAM_API_KEY` (create one: https://steamcommunity.com/dev/apikey)
- `STEAM_ID` (SteamID64 — you can find it on https://steamid.io/)

2) Run the importer (one-shot container):

```bash
docker compose --profile tools run --rm steam-import
```

The importer calls the Wanna2Play API to upsert your games and (if Ollama + Qdrant are configured) automatically indexes them for semantic search.

## Local development

```bash
npm install
npm run dev
```

## Roadmap ideas
- Multi-store importers (Steam/Epic/GOG/Ubisoft/…)
- De-duplication across stores (single canonical “game”)
- Multi-criteria filtering (genre, rating, playtime, “finished by”, “to play by”…)
- Metadata providers (IGDB/OpenCritic/HowLongToBeat/SteamGridDB…)
- Optional “AI librarian” over your catalog (MCP + Qdrant)
