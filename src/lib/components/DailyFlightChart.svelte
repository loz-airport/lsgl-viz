<script>
	import * as Plot from "@observablehq/plot";
	import { onMount, onDestroy } from "svelte";
	import { flightStore } from "$lib/stores/flightData.svelte.js";

	let { data = [] } = $props();

	let container = $state();
	let period = $state(7);

	// Track previous data length to avoid unnecessary re-renders
	let prevDataLength = $state(0);

	$effect(() => {
		if (container && data.length > 0 && data.length !== prevDataLength) {
			prevDataLength = data.length;
			// Debounce chart rendering to avoid excessive re-renders
			clearTimeout(container._renderTimeout);
			container._renderTimeout = setTimeout(() => {
				renderChart();
			}, 150);
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
					{ date: d.date, type: "Atterrissages", count: d.arrivals },
					{ date: d.date, type: "Décollages", count: d.departures },
				]);

				marks = [
					Plot.barY(chartData, {
						x: "type",
						y: "count",
						fill: "type",
						fx: "date",
					}),
					Plot.tip(
						chartData,
						Plot.pointerX({
							x: "type",
							fx: "date",
							y: "count",
							title: (d) => {
								const dateStr = new Intl.DateTimeFormat(
									"fr-CH",
									{
										day: "numeric",
										month: "long",
										year: "numeric",
									},
								).format(d.date);
								// Find the full data for this date
								const dateData = rawData.find(
									(r) =>
										r.date.getTime() === d.date.getTime(),
								);
								if (dateData) {
									return `${dateStr}\nAtterrissages: ${dateData.arrivals}\nDécollages: ${dateData.departures}`;
								}
								return `${dateStr}\n${d.type}: ${d.count}`;
							},
						}),
					),
					Plot.ruleY([0]),
				];
			} else {
				// Generate weekend background rectangles
				const weekendRects = [];
				if (rawData.length > 0) {
					const minDate = new Date(
						Math.min(...rawData.map((d) => d.date.getTime())),
					);
					const maxDate = new Date(
						Math.max(...rawData.map((d) => d.date.getTime())),
					);

					for (
						let d = new Date(minDate);
						d <= maxDate;
						d.setDate(d.getDate() + 1)
					) {
						const dayOfWeek = d.getDay();
						if (dayOfWeek === 0 || dayOfWeek === 6) {
							const nextDate = new Date(d);
							nextDate.setDate(nextDate.getDate() + 1);
							weekendRects.push({
								x1: new Date(d),
								x2: nextDate,
							});
						}
					}
				}
				// Line chart for 30 days
				marks = [
					// Weekend background - full height rectangles (using null for y to span the full chart)
					...(weekendRects.length > 0
						? [
								Plot.rectX(weekendRects, {
									x1: "x1",
									x2: "x2",
									fill: "rgba(128, 128, 128, 0.15)",
									stroke: "none",
								}),
							]
						: []),
					Plot.lineY(rawData, {
						x: "date",
						y: "arrivals",
						stroke: "#3b82f6",
						strokeWidth: 2,
						curve: "monotone-x",
					}),
					Plot.lineY(rawData, {
						x: "date",
						y: "departures",
						stroke: "#f97316",
						strokeWidth: 2,
						curve: "monotone-x",
					}),
					Plot.dot(rawData, {
						x: "date",
						y: "arrivals",
						fill: "#3b82f6",
						r: 3,
						tip: false, // Disable built-in tip to use the custom one
					}),
					Plot.dot(rawData, {
						x: "date",
						y: "departures",
						fill: "#f97316",
						r: 3,
						tip: false,
					}),
					// Explicit tooltip mark
					Plot.tip(
						rawData,
						Plot.pointerX({
							x: "date",
							y: "arrivals", // Anchor to arrivals or just use x? pointerX mostly needs x.
							// Adding a dummy channel or relying on X.
							title: (d) => {
								const dateStr = new Intl.DateTimeFormat(
									"fr-CH",
									{
										day: "numeric",
										month: "long",
										year: "numeric",
									},
								).format(d.date);
								return `${dateStr}\nAtterrissages: ${d.arrivals}\nDécollages: ${d.departures}`;
							},
						}),
					),
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
						if (isNaN(date.getTime())) return "";
						try {
							return new Intl.DateTimeFormat("fr-CH", {
								month: "short",
								day: "numeric",
							}).format(date);
						} catch (e) {
							return "";
						}
					},
				},
				x: {
					label: null,
					tickFormat: (d) => {
						const date = new Date(d);
						if (isNaN(date.getTime())) return "";
						try {
							return new Intl.DateTimeFormat("fr-CH", {
								month: "short",
								day: "numeric",
							}).format(date);
						} catch (e) {
							return "";
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
					domain: ["Atterrissages", "Décollages"],
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

	// Cleanup timeouts on destroy
	onDestroy(() => {
		if (container?._renderTimeout) {
			clearTimeout(container._renderTimeout);
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
