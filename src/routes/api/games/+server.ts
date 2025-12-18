import { json } from '@sveltejs/kit';
import { upsertGame, listGames, type UpsertGameInput } from '$lib/server/db';
import { getEmbedding } from '$lib/server/ollama';
import { upsertVector } from '$lib/server/qdrant';

export const GET = async ({ url }) => {
	const limit = Number(url.searchParams.get('limit') ?? '60');
	return json({ results: listGames(limit) });
};

export const POST = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body.' }, { status: 400 });
	}

	if (!body || typeof body !== 'object') {
		return json({ error: 'Invalid body.' }, { status: 400 });
	}

	const input = body as Partial<UpsertGameInput>;
	const title = typeof input.title === 'string' ? input.title.trim() : '';

	if (!title) {
		return json({ error: '`title` is required.' }, { status: 400 });
	}

	const id =
		typeof input.id === 'string' && input.id.trim()
			? input.id.trim()
			: `custom:${crypto.randomUUID()}`;

	const stores = Array.isArray(input.stores) ? input.stores.filter((s) => typeof s === 'string') : [];
	const summary = typeof input.summary === 'string' ? input.summary : null;
	const coverUrl = typeof input.coverUrl === 'string' ? input.coverUrl : null;

	const game = upsertGame({ id, title, summary, coverUrl, stores });

	// Best-effort semantic indexing (optional: needs Ollama + Qdrant).
	try {
		const embedding = await getEmbedding([game.title, game.summary].filter(Boolean).join('\n\n'));
		if (embedding) await upsertVector(game.id, embedding);
	} catch {
		// Intentionally ignored (keyword search still works).
	}

	return json(game, { status: 201 });
};

