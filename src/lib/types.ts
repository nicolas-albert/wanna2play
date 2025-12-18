export type Game = {
	id: string;
	title: string;
	summary?: string | null;
	coverUrl?: string | null;
	stores: string[];
};

export type SearchMode = 'semantic' | 'keyword';

export type SearchResponse = {
	mode: SearchMode;
	query: string;
	results: Game[];
};

export type HealthResponse = {
	ok: boolean;
	sqlite: { path: string };
	qdrant: { url: string; ready: boolean };
	ollama: { baseUrl: string; model: string; reachable: boolean };
};
