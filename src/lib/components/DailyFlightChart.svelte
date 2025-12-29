<script>
	import * as Plot from "@observablehq/plot";
	import { onMount } from "svelte";

	/** @type {Array<{date: Date, arrivals: number, departures: number}>} */
	export let data = [];

	let container;

	$: if (container && data.length > 0) {
		renderChart();
	}

	function renderChart() {
		// Clear previous chart
		container.innerHTML = "";

		// Transform data for grouped bar chart
		const chartData = data.flatMap((d) => [
			{ date: d.date, type: "Arrivées", count: d.arrivals },
			{ date: d.date, type: "Départs", count: d.departures },
		]);

		const plot = Plot.plot({
			marginLeft: 60,
			marginBottom: 50,
			width: Math.max(600, container.offsetWidth),
			height: 400,
			style: {
				background: "transparent",
				fontSize: "14px",
				fontFamily: "Inter, system-ui, sans-serif",
			},
			x: {
				type: "band",
				label: null,
				tickFormat: (d) => {
					const date = new Date(d);
					return new Intl.DateTimeFormat("fr-CH", {
						month: "short",
						day: "numeric",
					}).format(date);
				},
			},
			y: {
				label: "Nombre de vols",
				grid: true,
				nice: true,
			},
			color: {
				domain: ["Arrivées", "Départs"],
				range: ["#3b82f6", "#f97316"],
				legend: true,
			},
			marks: [
				Plot.barY(chartData, {
					x: "type",
					y: "count",
					fill: "type",
					fx: "date",
					tip: true,
					title: (d) =>
						`${d.type}: ${d.count} vol${d.count > 1 ? "s" : ""}`,
				}),
				Plot.ruleY([0]),
			],
		});

		container.appendChild(plot);
	}

	onMount(() => {
		if (data.length > 0) {
			renderChart();
		}
	});
</script>

<div class="chart-container">
	<h2>Vols quotidiens (7 derniers jours)</h2>
	{#if data.length === 0}
		<div class="empty-state">
			<p>Chargement des données...</p>
		</div>
	{:else}
		<div bind:this={container} class="chart"></div>
	{/if}
</div>

<style>
	.chart-container {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 24px;
		margin-bottom: 24px;
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	h2 {
		margin: 0 0 20px 0;
		font-size: 20px;
		font-weight: 600;
		color: #fff;
	}

	.chart {
		width: 100%;
		overflow-x: auto;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		color: rgba(255, 255, 255, 0.6);
	}

	:global(.chart svg) {
		max-width: 100%;
	}
</style>
