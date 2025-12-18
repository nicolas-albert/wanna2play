import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';

type QdrantSearchResult = {
	result?: Array<{
		id: string | number;
		score: number;
		payload?: Record<string, unknown>;
	}>;
};

type QdrantCollectionInfo = {
	result?: {
		config?: {
			params?: {
				vectors?: {
					size?: number;
				};
			};
		};
	};
};

const baseUrl = (env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/+$/, '');
const collection = (env.QDRANT_COLLECTION ?? 'wanna2play_games').trim();

let ensuredVectorSize: number | null = null;

function gameIdToPointId(gameId: string): string {
	// Qdrant point IDs must be an integer or a UUID.
	// We keep our own string game IDs (e.g. "steam:123", "gog:xyz") in the payload and use a deterministic UUID
	// derived from the game ID as the Qdrant point ID.
	const digest = createHash('sha256').update(gameId).digest();
	const bytes = digest.subarray(0, 16);

	// Make it look like a UUIDv4 (deterministic, but valid format).
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex = Buffer.from(bytes).toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function qdrantRequest(path: string, init?: RequestInit): Promise<Response> {
	return await fetch(`${baseUrl}${path}`, {
		...init,
		headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
	});
}

export async function ensureCollection(vectorSize: number): Promise<void> {
	if (!collection) return;
	if (ensuredVectorSize === vectorSize) return;

	const res = await qdrantRequest(`/collections/${encodeURIComponent(collection)}`);
	if (res.ok) {
		const data = (await res.json()) as QdrantCollectionInfo;
		const existing = data.result?.config?.params?.vectors?.size;
		if (typeof existing === 'number' && existing !== vectorSize) {
			throw new Error(
				`Qdrant collection '${collection}' has vector size ${existing}, expected ${vectorSize}. ` +
					`Use a consistent embeddings model (or recreate the collection).`
			);
		}
		ensuredVectorSize = vectorSize;
		return;
	}

	// Create collection if it doesn't exist.
	if (res.status === 404) {
		const create = await qdrantRequest(`/collections/${encodeURIComponent(collection)}`, {
			method: 'PUT',
			body: JSON.stringify({
				vectors: { size: vectorSize, distance: 'Cosine' }
			})
		});
		if (!create.ok) {
			throw new Error(`Failed to create Qdrant collection '${collection}' (HTTP ${create.status}).`);
		}
		ensuredVectorSize = vectorSize;
	}
}

export async function upsertVector(id: string, vector: number[]): Promise<void> {
	if (!collection) return;

	await ensureCollection(vector.length);

	const res = await qdrantRequest(`/collections/${encodeURIComponent(collection)}/points?wait=true`, {
		method: 'PUT',
		body: JSON.stringify({
			points: [{ id: gameIdToPointId(id), vector, payload: { id } }]
		})
	});

	if (!res.ok) {
		throw new Error(`Qdrant upsert failed (HTTP ${res.status}).`);
	}
}

export async function searchSimilar(vector: number[], limit: number): Promise<string[]> {
	if (!collection) return [];

	await ensureCollection(vector.length);

	const res = await qdrantRequest(`/collections/${encodeURIComponent(collection)}/points/search`, {
		method: 'POST',
		body: JSON.stringify({
			vector,
			limit,
			with_payload: true
		})
	});

	if (!res.ok) return [];
	const data = (await res.json()) as QdrantSearchResult;
	const results = data.result ?? [];

	return results
		.map((hit) => String(hit.payload?.id ?? hit.id))
		.filter((id) => id.length > 0);
}
