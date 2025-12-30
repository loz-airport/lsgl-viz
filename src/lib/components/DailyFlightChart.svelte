<script>
	import * as Plot from "@observablehq/plot";
	import { onMount } from "svelte";
	import { flightStore } from "$lib/stores/flightData.svelte.js";

	let { data = [] } = $props();

	let container = $state();
	let period = $state(7);

	$effect(() => {
		if (container && data.length > 0) {
			renderChart();
		}
	});

	function handlePeriodChange(newPeriod) {
		period = newPeriod;
		flightStore.dateRangeDays = newPeriod;
	}

	function renderChart() {
		const rawData = $state.snapshot(data);
		// Clear previous chart
		if (!container) return;
		container.innerHTML = "";

		try {
			let marks = [];
			let chartData = [];

			if (period === 7) {
				// Transform data for grouped bar chart
				chartData = rawData.flatMap((d) => [
					{ date: d.date, type: "Arrivées", count: d.arrivals },
					{ date: d.date, type: "Départs", count: d.departures },
				]);

				marks = [
					Plot.barY(chartData, {
						x: "type",
						y: "count",
						fill: "type",
						fx: "date",
						tip: true,
						title: (d) => {
							const dateStr = new Intl.DateTimeFormat("fr-CH", {
								day: "numeric",
								month: "long",
								year: "numeric",
							}).format(d.date);
							return `${dateStr}\n${d.type}: ${d.count} vol${d.count > 1 ? "s" : ""}`;
						},
					}),
					Plot.ruleY([0]),
				];
			} else {
				// Line chart for 30 days
				marks = [
					Plot.lineY(rawData, {
						x: "date",
						y: "arrivals",
						stroke: "#3b82f6",
						strokeWidth: 2,
						curve: "monotone-x",
						tip: true,
						title: (d) => {
							const dateStr = new Intl.DateTimeFormat("fr-CH", {
								day: "numeric",
								month: "long",
								year: "numeric",
							}).format(d.date);
							return `${dateStr}\nArrivées: ${d.arrivals} vol${d.arrivals > 1 ? "s" : ""}\nDéparts: ${d.departures} vol${d.departures > 1 ? "s" : ""}`;
						},
					}),
					Plot.lineY(rawData, {
						x: "date",
						y: "departures",
						stroke: "#f97316",
						strokeWidth: 2,
						curve: "monotone-x",
						tip: true,
						title: (d) => {
							const dateStr = new Intl.DateTimeFormat("fr-CH", {
								day: "numeric",
								month: "long",
								year: "numeric",
							}).format(d.date);
							return `${dateStr}\nArrivées: ${d.arrivals} vol${d.arrivals > 1 ? "s" : ""}\nDéparts: ${d.departures} vol${d.departures > 1 ? "s" : ""}`;
						},
					}),
					Plot.dot(rawData, {
						x: "date",
						y: "arrivals",
						fill: "#3b82f6",
						r: 3,
						tip: true,
						title: (d) => {
							const dateStr = new Intl.DateTimeFormat("fr-CH", {
								day: "numeric",
								month: "long",
								year: "numeric",
							}).format(d.date);
							return `${dateStr}\nArrivées: ${d.arrivals} vol${d.arrivals > 1 ? "s" : ""}\nDéparts: ${d.departures} vol${d.departures > 1 ? "s" : ""}`;
						},
					}),
					Plot.dot(rawData, {
						x: "date",
						y: "departures",
						fill: "#f97316",
						r: 3,
						tip: true,
						title: (d) => {
							const dateStr = new Intl.DateTimeFormat("fr-CH", {
								day: "numeric",
								month: "long",
								year: "numeric",
							}).format(d.date);
							return `${dateStr}\nArrivées: ${d.arrivals} vol${d.arrivals > 1 ? "s" : ""}\nDéparts: ${d.departures} vol${d.departures > 1 ? "s" : ""}`;
						},
					}),
					Plot.ruleY([0]),
				];
			}

			const plot = Plot.plot({
				marginLeft: 60,
				marginBottom: 50,
				width: container.offsetWidth > 0 ? container.offsetWidth : 600,
				height: 400,
				style: {
					background: "transparent",
					fontSize: "14px",
					fontFamily: "Inter, system-ui, sans-serif",
				},
				fx: {
					label: null,
					axis: "bottom",
					tickFormat: (d) => {
						const date = new Date(d);
						if (isNaN(date.getTime())) return '';
						try {
							return new Intl.DateTimeFormat("fr-CH", {
								month: "short",
								day: "numeric",
							}).format(date);
						} catch (e) {
							return '';
						}
					},
				},
				x: {
					label: null,
					tickFormat: (d) => {
						const date = new Date(d);
						if (isNaN(date.getTime())) return '';
						try {
							return new Intl.DateTimeFormat("fr-CH", {
								month: "short",
								day: "numeric",
							}).format(date);
						} catch (e) {
							return '';
						}
					},
					grid: period === 30,
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
				marks: marks,
			});

			if (plot) container.appendChild(plot);
		} catch (e) {
			console.error("Plot rendering failed:", e);
		}
	}

	onMount(() => {
		if (data.length > 0) {
			renderChart();
		}
	});
</script>

<div class="chart-container">
	<div class="header">
		<h2>Vols quotidiens</h2>
		<div class="toggle">
			<button
				class:active={period === 7}
				onclick={() => handlePeriodChange(7)}>7j</button
			>
			<button
				class:active={period === 30}
				onclick={() => handlePeriodChange(30)}>30j</button
			>
		</div>
	</div>
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

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 24px;
	}

	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: #fff;
	}

	.toggle {
		display: flex;
		background: rgba(255, 255, 255, 0.1);
		padding: 4px;
		border-radius: 8px;
	}

	.toggle button {
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		padding: 6px 12px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.2s;
	}

	.toggle button.active {
		background: #3b82f6;
		color: white;
	}

	.chart {
		width: 100%;
		min-height: 400px;
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
