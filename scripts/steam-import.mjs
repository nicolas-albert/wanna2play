#!/usr/bin/env node

const STEAM_API_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/';
const STEAM_COMMUNITY_BASE = 'https://steamcommunity.com';

function requiredEnv(name) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

function optionalEnv(name) {
	const value = process.env[name]?.trim();
	return value ? value : null;
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

async function fetchText(url, init) {
	const res = await fetch(url, init);
	const text = await res.text();
	if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${text.slice(0, 200)}`);
	return text;
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

function decodeXmlEntities(text) {
	return text
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'");
}

function extractTag(xml, tag) {
	const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
	const match = xml.match(re);
	if (!match) return null;
	return match[1] ?? null;
}

function parseCommunityGamesXml(xml) {
	const errorMessage = extractTag(xml, 'error');
	if (errorMessage) {
		throw new Error(
			`Steam Community error: ${decodeXmlEntities(errorMessage).trim()}. ` +
				`Make sure your Steam privacy "Game details" is Public.`
		);
	}

	const games = [];
	const re = /<game>([\s\S]*?)<\/game>/gi;
	let match;
	while ((match = re.exec(xml)) !== null) {
		const block = match[1] ?? '';

		const appIdRaw = extractTag(block, 'appID') ?? extractTag(block, 'appid');
		const nameRaw = extractTag(block, 'name');
		const hoursRaw = extractTag(block, 'hoursOnRecord');

		const appid = appIdRaw ? Number.parseInt(appIdRaw.trim(), 10) : NaN;
		let name = nameRaw ? nameRaw.trim() : '';

		const cdata = name.match(/^<!\[CDATA\[(.*)\]\]>$/s);
		if (cdata) name = cdata[1] ?? name;

		name = decodeXmlEntities(name).trim();

		if (!Number.isFinite(appid) || !name) continue;

		const hours = hoursRaw ? Number.parseFloat(hoursRaw.replace(',', '.')) : null;
		const playtimeForever = Number.isFinite(hours) ? Math.round(hours * 60) : null;

		games.push({ appid, name, playtimeForever });
	}

	return games;
}

function buildCommunityGamesUrl(profile) {
	const cleaned = profile.trim();
	if (!cleaned) throw new Error('STEAM_PROFILE is empty.');

	if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
		const url = new URL(cleaned);
		const parts = url.pathname.split('/').filter(Boolean);
		const idx = parts.findIndex((p) => p === 'id' || p === 'profiles');
		if (idx >= 0 && parts[idx + 1]) {
			const kind = parts[idx];
			const value = parts[idx + 1];
			return `${STEAM_COMMUNITY_BASE}/${kind}/${encodeURIComponent(value)}/games/?tab=all&xml=1`;
		}
		throw new Error('STEAM_PROFILE URL must contain /id/<vanity> or /profiles/<steamid64>.');
	}

	if (/^\d{15,20}$/.test(cleaned)) {
		return `${STEAM_COMMUNITY_BASE}/profiles/${encodeURIComponent(cleaned)}/games/?tab=all&xml=1`;
	}

	return `${STEAM_COMMUNITY_BASE}/id/${encodeURIComponent(cleaned)}/games/?tab=all&xml=1`;
}

async function getOwnedGamesFromCommunity({ profile }) {
	const url = buildCommunityGamesUrl(profile);
	const xml = await fetchText(url, {
		headers: {
			accept: 'text/xml,application/xml;q=0.9,*/*;q=0.8',
			'user-agent': 'wanna2play/1.0 (+https://github.com/nicolas-albert/wanna2play)'
		}
	});

	const games = parseCommunityGamesXml(xml);
	if (games.length === 0) {
		throw new Error(
			'No games found from Steam Community. Make sure your Steam privacy "Game details" is Public.'
		);
	}

	return games;
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
	const appUrl = normalizeUrl(process.env.WANNA2PLAY_APP_URL ?? 'http://app:3000');
	const concurrency = Number.parseInt(process.env.IMPORT_CONCURRENCY ?? '4', 10);
	const apiKey = optionalEnv('STEAM_API_KEY');
	const steamId = optionalEnv('STEAM_ID');
	const steamProfile = optionalEnv('STEAM_PROFILE');

	console.log(`[steam-import] app: ${appUrl}`);
	console.log(
		`[steam-import] source: ${
			apiKey && steamId ? 'steam-web-api' : steamProfile ? 'steam-community' : 'missing-config'
		}`
	);

	await waitForApp(appUrl);

	const owned =
		apiKey && steamId
			? await getOwnedGames({ apiKey, steamId })
			: steamProfile
				? await getOwnedGamesFromCommunity({ profile: steamProfile })
				: (() => {
						throw new Error(
							'Configure either (STEAM_API_KEY + STEAM_ID) or STEAM_PROFILE. See README for details.'
						);
					})();
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
