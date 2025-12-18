import { json } from '@sveltejs/kit';
import { getSqlitePath } from '$lib/server/db';
import { env } from '$env/dynamic/private';

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, '');
}

async function isReachable(url: string, timeoutMs = 1500): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await fetch(url, { signal: controller.signal });
		return res.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

export const GET = async () => {
	const qdrantUrl = (env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/+$/, '');
	let qdrantReady = false;

	try {
		const res = await fetch(`${qdrantUrl}/readyz`);
		qdrantReady = res.ok;
	} catch {
		qdrantReady = false;
	}

	const ollamaBaseUrl = normalizeBaseUrl(env.OLLAMA_BASE_URL ?? '');
	const ollamaModel = env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
	const ollamaReachable = ollamaBaseUrl ? await isReachable(`${ollamaBaseUrl}/api/tags`) : false;

	return json({
		ok: true,
		sqlite: { path: getSqlitePath() },
		qdrant: { url: qdrantUrl, ready: qdrantReady },
		ollama: {
			baseUrl: ollamaBaseUrl,
			model: ollamaModel,
			reachable: ollamaReachable
		}
	});
};
