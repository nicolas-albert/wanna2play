import { json } from '@sveltejs/kit';
import { countGames, upsertGame } from '$lib/server/db';
import { getEmbedding } from '$lib/server/ollama';
import { upsertVector } from '$lib/server/qdrant';

const sampleGames = [
	{ title: 'Hades', stores: ['steam', 'epic'] },
	{ title: 'Outer Wilds', stores: ['steam'] },
	{ title: 'Disco Elysium', stores: ['steam', 'gog'] },
	{ title: 'Hollow Knight', stores: ['steam', 'gog'] },
	{ title: 'Celeste', stores: ['steam'] },
	{ title: 'Portal 2', stores: ['steam'] },
	{ title: 'Stardew Valley', stores: ['steam', 'gog'] },
	{ title: 'Slay the Spire', stores: ['steam'] },
	{ title: 'Subnautica', stores: ['steam', 'epic'] },
	{ title: 'It Takes Two', stores: ['steam'] },
	{ title: 'Ori and the Will of the Wisps', stores: ['steam'] },
	{ title: 'Control', stores: ['steam', 'epic', 'gog'] }
];

export const POST = async () => {
	if (countGames() > 0) {
		return json(
			{ error: 'Seed refused because the library is not empty.' },
			{ status: 409 }
		);
	}

	let embedded = 0;
	for (const entry of sampleGames) {
		const game = upsertGame({
			id: `sample:${entry.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')}`,
			title: entry.title,
			stores: entry.stores
		});

		try {
			const embedding = await getEmbedding(game.title);
			if (embedding) {
				await upsertVector(game.id, embedding);
				embedded += 1;
			}
		} catch {
			// ignore
		}
	}

	return json({ ok: true, inserted: sampleGames.length, embedded });
};

