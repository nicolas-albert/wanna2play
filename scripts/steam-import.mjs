#!/usr/bin/env node

const STEAM_API_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/';

function requiredEnv(name) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

function normalizeUrl(url) {
	return url.trim().replace(/\/+$/, '');
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, init) {
	const res = await fetch(url, init);
	const text = await res.text();

	let data;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}

	if (!res.ok) {
		const msg = typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200);
		throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${msg}`);
	}

	return data;
}

async function waitForApp(appUrl, tries = 60) {
	for (let i = 1; i <= tries; i += 1) {
		try {
			await fetchJson(`${appUrl}/api/health`);
			return;
		} catch {
			await sleep(1000);
		}
	}

	throw new Error(`App is not reachable at ${appUrl} after ${tries}s`);
}

async function getOwnedGames({ apiKey, steamId }) {
	const url = new URL(STEAM_API_URL);
	url.searchParams.set('key', apiKey);
	url.searchParams.set('steamid', steamId);
	url.searchParams.set('include_appinfo', '1');
	url.searchParams.set('include_played_free_games', '1');
	url.searchParams.set('format', 'json');

	const data = await fetchJson(url.toString());
	const games = data?.response?.games ?? [];
	if (!Array.isArray(games)) return [];

	return games
		.map((g) => ({
			appid: typeof g?.appid === 'number' ? g.appid : null,
			name: typeof g?.name === 'string' ? g.name.trim() : '',
			playtimeForever: typeof g?.playtime_forever === 'number' ? g.playtime_forever : null
		}))
		.filter((g) => Boolean(g.appid) && Boolean(g.name));
}

function steamCoverUrl(appid) {
	// Most modern Steam games have this "library" cover. If it 404s, the UI keeps a gradient placeholder.
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
}

async function upsertGame(appUrl, { id, title, coverUrl, stores }) {
	return await fetchJson(`${appUrl}/api/games`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ id, title, coverUrl, stores })
	});
}

async function runPool(items, concurrency, worker) {
	const results = [];
	let index = 0;

	const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
		while (true) {
			const current = index;
			index += 1;
			if (current >= items.length) break;
			results[current] = await worker(items[current], current);
		}
	});

	await Promise.all(workers);
	return results;
}

async function main() {
	const apiKey = requiredEnv('STEAM_API_KEY');
	const steamId = requiredEnv('STEAM_ID');
	const appUrl = normalizeUrl(process.env.WANNA2PLAY_APP_URL ?? 'http://app:3000');
	const concurrency = Number.parseInt(process.env.IMPORT_CONCURRENCY ?? '4', 10);

	console.log(`[steam-import] app: ${appUrl}`);
	console.log(`[steam-import] fetching owned games for steamid: ${steamId}`);

	await waitForApp(appUrl);

	const owned = await getOwnedGames({ apiKey, steamId });
	console.log(`[steam-import] fetched: ${owned.length} games`);

	let imported = 0;
	let failed = 0;

	await runPool(owned, concurrency, async (game, idx) => {
		const id = `steam:${game.appid}`;
		const title = game.name;
		const coverUrl = steamCoverUrl(game.appid);

		try {
			await upsertGame(appUrl, { id, title, coverUrl, stores: ['steam'] });
			imported += 1;
		} catch (e) {
			failed += 1;
			console.error(`[steam-import] failed (${id}):`, e instanceof Error ? e.message : e);
		}

		if ((idx + 1) % 25 === 0 || idx + 1 === owned.length) {
			console.log(`[steam-import] progress: ${idx + 1}/${owned.length} (ok=${imported}, fail=${failed})`);
		}
	});

	console.log(`[steam-import] done (ok=${imported}, fail=${failed})`);
	if (failed > 0) process.exitCode = 2;
}

main().catch((e) => {
	console.error('[steam-import] fatal:', e instanceof Error ? e.message : e);
	process.exit(1);
});

