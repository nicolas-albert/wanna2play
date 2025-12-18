import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import type { Game } from '$lib/types';

const sqlitePath = env.SQLITE_PATH ?? path.resolve('data/wanna2play.sqlite');
fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

const db = new Database(sqlitePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS games (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	summary TEXT,
	cover_url TEXT,
	stores_json TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_games_title ON games(title);
CREATE INDEX IF NOT EXISTS idx_games_updated_at ON games(updated_at);
`);

type GameRow = {
	id: string;
	title: string;
	summary: string | null;
	cover_url: string | null;
	stores_json: string;
};

function rowToGame(row: GameRow): Game {
	return {
		id: row.id,
		title: row.title,
		summary: row.summary,
		coverUrl: row.cover_url,
		stores: JSON.parse(row.stores_json) as string[]
	};
}

export function getSqlitePath(): string {
	return sqlitePath;
}

export function countGames(): number {
	const row = db.prepare('SELECT COUNT(*) as count FROM games').get() as { count: number };
	return row.count ?? 0;
}

export function listGames(limit: number): Game[] {
	const rows = db
		.prepare(
			`SELECT id, title, summary, cover_url, stores_json
			 FROM games
			 ORDER BY updated_at DESC
			 LIMIT ?`
		)
		.all(Math.max(1, Math.min(limit, 200))) as GameRow[];

	return rows.map(rowToGame);
}

export function getGameById(id: string): Game | null {
	const row = db
		.prepare('SELECT id, title, summary, cover_url, stores_json FROM games WHERE id = ?')
		.get(id) as GameRow | undefined;

	return row ? rowToGame(row) : null;
}

export function getGamesByIds(ids: string[]): Game[] {
	if (ids.length === 0) return [];

	const placeholders = ids.map(() => '?').join(',');
	const rows = db
		.prepare(
			`SELECT id, title, summary, cover_url, stores_json
			 FROM games
			 WHERE id IN (${placeholders})`
		)
		.all(...ids) as GameRow[];

	const byId = new Map(rows.map((row) => [row.id, rowToGame(row)]));
	return ids.map((id) => byId.get(id)).filter((game): game is Game => Boolean(game));
}

export type UpsertGameInput = {
	id: string;
	title: string;
	summary?: string | null;
	coverUrl?: string | null;
	stores?: string[] | null;
};

export function upsertGame(input: UpsertGameInput): Game {
	const now = Date.now();
	const existing = getGameById(input.id);
	const stores = (input.stores ?? existing?.stores ?? []).filter(Boolean);

	db.prepare(
		`INSERT INTO games (id, title, summary, cover_url, stores_json, created_at, updated_at)
		 VALUES (@id, @title, @summary, @cover_url, @stores_json, @created_at, @updated_at)
		 ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			summary = excluded.summary,
			cover_url = excluded.cover_url,
			stores_json = excluded.stores_json,
			updated_at = excluded.updated_at`
	).run({
		id: input.id,
		title: input.title,
		summary: input.summary ?? null,
		cover_url: input.coverUrl ?? null,
		stores_json: JSON.stringify(stores),
		created_at: existing ? now : now,
		updated_at: now
	});

	return getGameById(input.id)!;
}

export function searchGamesKeyword(query: string, limit: number): Game[] {
	const q = `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
	const rows = db
		.prepare(
			`SELECT id, title, summary, cover_url, stores_json
			 FROM games
			 WHERE title LIKE ? ESCAPE '\\'
			    OR summary LIKE ? ESCAPE '\\'
			 ORDER BY updated_at DESC
			 LIMIT ?`
		)
		.all(q, q, Math.max(1, Math.min(limit, 200))) as GameRow[];

	return rows.map(rowToGame);
}

