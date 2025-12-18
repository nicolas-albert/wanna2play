import { env } from '$env/dynamic/private';

type EmbeddingsResponse = { embedding?: number[] };
type EmbedResponse = { embeddings?: number[][] };

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, '');
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 12_000): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

export async function getEmbedding(text: string): Promise<number[] | null> {
	const baseUrlRaw = env.OLLAMA_BASE_URL ?? '';
	const model = (env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text').trim();
	const baseUrl = normalizeBaseUrl(baseUrlRaw);

	if (!baseUrl) return null;
	if (!model) return null;

	const body = JSON.stringify({ model, prompt: text });
	const res = await fetchJson(`${baseUrl}/api/embeddings`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body
	});

	if (res.ok) {
		const data = (await res.json()) as EmbeddingsResponse;
		if (Array.isArray(data.embedding) && data.embedding.length > 0) return data.embedding;
		return null;
	}

	// Newer Ollama versions support /api/embed
	if (res.status === 404) {
		const res2 = await fetchJson(`${baseUrl}/api/embed`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ model, input: text })
		});

		if (!res2.ok) return null;
		const data = (await res2.json()) as EmbedResponse;
		const first = data.embeddings?.[0];
		if (Array.isArray(first) && first.length > 0) return first;
	}

	return null;
}

