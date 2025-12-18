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

