import { json } from '@sveltejs/kit';
import { getSqlitePath } from '$lib/server/db';
import { env } from '$env/dynamic/private';

export const GET = async () => {
	const qdrantUrl = (env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/+$/, '');
	let qdrantReady = false;

	try {
		const res = await fetch(`${qdrantUrl}/readyz`);
		qdrantReady = res.ok;
	} catch {
		qdrantReady = false;
	}

	return json({
		ok: true,
		sqlite: { path: getSqlitePath() },
		qdrant: { url: qdrantUrl, ready: qdrantReady },
		ollama: {
			baseUrl: env.OLLAMA_BASE_URL ?? '',
			model: env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'
		}
	});
};

