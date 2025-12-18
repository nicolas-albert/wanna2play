import { json } from '@sveltejs/kit';
import { getGameById } from '$lib/server/db';

export const GET = async ({ params }) => {
	const game = getGameById(params.id);
	if (!game) return json({ error: 'Not found.' }, { status: 404 });
	return json(game);
};

