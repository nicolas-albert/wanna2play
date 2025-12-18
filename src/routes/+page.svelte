<script lang="ts">
	import { onMount } from 'svelte';
	import type { Game, HealthResponse, SearchResponse } from '$lib/types';

	let query = $state('');
	let mode = $state<'semantic' | 'keyword'>('keyword');
	let results = $state<Game[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let health = $state<HealthResponse | null>(null);

	let selected = $state<Game | null>(null);
	let dialog = $state<HTMLDialogElement | null>(null);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	async function loadHealth() {
		try {
			const res = await fetch('/api/health');
			if (!res.ok) return;
			health = (await res.json()) as HealthResponse;
		} catch {
			// ignore
		}
	}

	async function load(q: string) {
		isLoading = true;
		error = null;

		try {
			const url = new URL('/api/search', window.location.origin);
			if (q.trim()) url.searchParams.set('q', q.trim());

			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const data = (await res.json()) as SearchResponse;
			mode = data.mode;
			results = data.results;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			isLoading = false;
		}
	}

	function onInput(value: string) {
		query = value;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => load(query), 250);
	}

	async function seedDemo() {
		isLoading = true;
		error = null;
		try {
			const res = await fetch('/api/seed', { method: 'POST' });
			if (res.status === 409) {
				// Library already has data.
				await load('');
				return;
			}
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			await load('');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			isLoading = false;
		}
	}

	function openDetails(game: Game) {
		selected = game;
		dialog?.showModal();
	}

	onMount(() => {
		void loadHealth();
		void load('');
	});
</script>

<div class="container">
	<div class="topbar">
		<div class="brand">
			<h1>Wanna2Play</h1>
			<p>One place to browse all your game libraries.</p>
		</div>
		<div class="pill">
			{#if health?.ollama.reachable}
				{mode === 'semantic' ? 'Semantic search' : 'Semantic ready'}
			{:else}
				Keyword search
			{/if}
		</div>
	</div>

	<div class="search">
		<div class="searchbar">
			<input
				placeholder="Search games (stores, backlog, favorites — coming soon)"
				value={query}
				oninput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
			/>
			<button class="btn" onclick={() => load(query)} disabled={isLoading}>Search</button>
		</div>
		<div class="hint">
			<div>
				{#if isLoading}
					Loading…
				{:else if error}
					<span class="muted">Error:</span> {error}
				{:else}
					{results.length} game{results.length === 1 ? '' : 's'}
				{/if}
			</div>
			<div class="muted">
				{#if health?.ollama.baseUrl && !health?.ollama.reachable}
					Ollama is not reachable at <code>{health.ollama.baseUrl}</code>.
				{:else if !health?.ollama.baseUrl}
					Set <code>OLLAMA_BASE_URL</code> to enable semantic search.
				{:else}
					Semantic search is enabled (<code>{health.ollama.model}</code>).
				{/if}
			</div>
		</div>
	</div>

	{#if results.length === 0 && !isLoading}
		<div style="margin-top: 18px; display: flex; gap: 10px; align-items: center;">
			<div class="muted">Library is empty.</div>
			<button class="btn" onclick={seedDemo}>Seed demo data</button>
		</div>
	{/if}

	<div class="grid">
		{#each results as game (game.id)}
			<button class="card" type="button" onclick={() => openDetails(game)}>
				<div class="cover">
					{#if game.coverUrl}
						<img src={game.coverUrl} alt="" loading="lazy" />
					{/if}
				</div>
				<div class="card-body">
					<p class="title">{game.title}</p>
					<div class="meta">
						{#each game.stores as store}
							<span class="tag">{store}</span>
						{/each}
					</div>
				</div>
			</button>
		{/each}
	</div>
</div>

<dialog bind:this={dialog}>
	<div class="dialog-inner">
		<div class="dialog-head">
			<h2>{selected?.title ?? ''}</h2>
			<button class="close" onclick={() => dialog?.close()}>Close</button>
		</div>

		{#if selected}
			<p class="muted" style="margin: 10px 0 0;">
				Stores: {selected.stores.length ? selected.stores.join(', ') : '—'}
			</p>
			{#if selected.summary}
				<p style="margin: 12px 0 0; line-height: 1.55;">
					{selected.summary}
				</p>
			{/if}
			<p class="muted" style="margin: 14px 0 0;">ID: {selected.id}</p>
		{/if}
	</div>
</dialog>
