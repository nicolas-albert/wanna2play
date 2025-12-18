import { json } from '@sveltejs/kit';
import { getEmbedding } from '$lib/server/ollama';
import { searchSimilar } from '$lib/server/qdrant';
import { getGamesByIds, listGames, searchGamesKeyword } from '$lib/server/db';
import type { SearchMode } from '$lib/types';

export const GET = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const limit = Number(url.searchParams.get('limit') ?? '60');

	if (!query) {
		return json({
			mode: 'keyword' satisfies SearchMode,
			query,
			results: listGames(limit)
		});
	}

	// Try semantic search first. If anything fails, fall back to keyword search.
	try {
		const embedding = await getEmbedding(query);
		if (embedding) {
			const ids = await searchSimilar(embedding, Math.max(1, Math.min(limit, 60)));
			const results = getGamesByIds(ids);
			if (results.length > 0) {
				return json({ mode: 'semantic' satisfies SearchMode, query, results });
			}
		}
	} catch {
		// ignore
	}

	return json({
		mode: 'keyword' satisfies SearchMode,
		query,
		results: searchGamesKeyword(query, limit)
	});
};

