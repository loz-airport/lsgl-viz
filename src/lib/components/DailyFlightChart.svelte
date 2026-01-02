<script>
	import * as Plot from "@observablehq/plot";
	import { onMount, onDestroy } from "svelte";
	import { flightStore } from "$lib/stores/flightData.svelte.js";

	let { data = [] } = $props();

	let container = $state();
	let period = $state(7);
	let hoveredData = $state(null);
	let tooltipPos = $state({ x: 0, y: 0 });

	function handlePeriodChange(newPeriod) {
		period = newPeriod;
		flightStore.dateRangeDays = newPeriod;
	}

	function renderChart() {
		const rawData = $state.snapshot(data);
		if (!container) return;
		container.innerHTML = "";

		try {
			let marks = [];
			let chartData = [];

			if (period === 7) {
				chartData = rawData.flatMap((d) => [
					{
						date: d.date,
						type: "Atterrissages",
						arrivals: d.arrivals,
						departures: d.departures,
						count: d.arrivals,
						isGrouped: true,
					},
					{
						date: d.date,
						type: "Décollages",
						arrivals: d.arrivals,
						departures: d.departures,
						count: d.departures,
						isGrouped: true,
					},
				]);

				marks = [
					Plot.barY(chartData, {
						x: "type",
						y: "count",
						fill: "type",
						fx: "date",
						stroke: "white",
						strokeWidth: 0.5,
					}),
					Plot.ruleY([0]),
					Plot.dot(
						chartData,
						Plot.pointerX({
							x: "type",
							y: "count",
							fx: "date",
							fill: "none",
							stroke: "none",
						}),
					),
				];
			} else {
				const weekendRects = [];
				if (rawData.length > 0) {
					const minDates = rawData
						.map((d) => d.date.getTime())
						.filter((t) => !isNaN(t));
					if (minDates.length > 0) {
						const minDate = new Date(Math.min(...minDates));
						const maxDate = new Date(Math.max(...minDates));

						for (
							let d = new Date(minDate);
							d <= maxDate;
							d.setDate(d.getDate() + 1)
						) {
							if (d.getDay() === 0 || d.getDay() === 6) {
								const nextDate = new Date(d);
								nextDate.setDate(nextDate.getDate() + 1);
								weekendRects.push({
									x1: new Date(d),
									x2: nextDate,
								});
							}
						}
					}
				}

				marks = [
					Plot.rectX(weekendRects, {
						x1: "x1",
						x2: "x2",
						fill: "rgba(255, 255, 255, 0.05)",
					}),
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
						r: 4,
						stroke: "white",
					}),
					Plot.dot(rawData, {
						x: "date",
						y: "departures",
						fill: "#f97316",
						r: 4,
						stroke: "white",
					}),
					Plot.ruleY([0]),
					// Transform to track the pointer and update plot.value
					Plot.dot(
						rawData,
						Plot.pointerX({
							x: "date",
							y: "arrivals",
							fill: "none",
							stroke: "none",
						}),
					),
				];
			}

			const plotOptions = {
				marginLeft: 60,
				marginBottom: 50,
				width: container.offsetWidth > 0 ? container.offsetWidth : 600,
				height: 400,
				style: {
					background: "transparent",
					fontSize: "12px",
					fontFamily: "Inter, system-ui, sans-serif",
					color: "white",
				},
				x: {
					label: null,
					tickFormat: (d) => {
						const date = d instanceof Date ? d : new Date(d);
						if (isNaN(date.getTime())) return "";
						return new Intl.DateTimeFormat("fr-CH", {
							month: "short",
							day: "numeric",
						}).format(date);
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
			};

			// Only add fx scale for grouped bar chart
			if (period === 7) {
				plotOptions.fx = {
					label: null,
					axis: "bottom",
					tickFormat: (d) => {
						const date = d instanceof Date ? d : new Date(d);
						if (isNaN(date.getTime())) return "";
						return new Intl.DateTimeFormat("fr-CH", {
							month: "short",
							day: "numeric",
						}).format(date);
					},
				};
			}

			const plot = Plot.plot(plotOptions);

			if (plot) {
				container.appendChild(plot);

				plot.addEventListener("input", (e) => {
					if (plot.value) {
						hoveredData = plot.value;
					} else {
						hoveredData = null;
					}
				});
			}
		} catch (e) {
			console.error("Plot rendering failed:", e);
		}
	}

	$effect(() => {
		if (data.length > 0 && container) {
			renderChart();
		}
	});

	onMount(() => {
		const handleMouseMove = (e) => {
			tooltipPos = { x: e.clientX, y: e.clientY };
		};
		window.addEventListener("mousemove", handleMouseMove);
		return () => window.removeEventListener("mousemove", handleMouseMove);
	});

	onDestroy(() => {
		if (container?._renderTimeout) clearTimeout(container._renderTimeout);
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

	{#if hoveredData}
		<div
			class="custom-tooltip"
			style="left: {tooltipPos.x + 12}px; top: {tooltipPos.y - 60}px;"
		>
			<div class="tooltip-date">
				{new Intl.DateTimeFormat("fr-CH", {
					day: "numeric",
					month: "long",
					year: "numeric",
				}).format(hoveredData.date)}
			</div>
			<div class="tooltip-row">
				<span class="dot arrivals"></span>
				<span class="label">Atterrissages:</span>
				<span class="value"
					>{hoveredData.arrivals ?? hoveredData.count}</span
				>
			</div>
			{#if hoveredData.departures !== undefined}
				<div class="tooltip-row">
					<span class="dot departures"></span>
					<span class="label">Décollages:</span>
					<span class="value">{hoveredData.departures}</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.chart-container {
		position: relative;
		/* padding and margin removed, handled by parent .glass container */
	}

	/* Glass effect removed to use parent container style */

	.custom-tooltip {
		position: fixed;
		pointer-events: none;
		background: #1e293b;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 10px 14px;
		color: white;
		font-size: 13px;
		z-index: 10000;
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		transition: transform 0.2s ease-out;
	}

	@media (max-width: 600px) {
		.custom-tooltip {
			left: 0 !important;
			right: 0 !important;
			bottom: 0 !important;
			top: auto !important;
			width: 100%;
			border-radius: 16px 16px 0 0;
			padding: 20px;
			background: rgba(30, 41, 59, 0.98);
			border-top: 1px solid rgba(255, 255, 255, 0.3);
			border-left: none;
			border-right: none;
			border-bottom: none;
			transform: translateY(0);
			pointer-events: auto;
		}
	}

	.tooltip-date {
		font-weight: 600;
		margin-bottom: 8px;
		color: rgba(255, 255, 255, 0.9);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		padding-bottom: 4px;
	}

	.tooltip-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.dot.arrivals {
		background: #3b82f6;
	}
	.dot.departures {
		background: #f97316;
	}

	.tooltip-row .label {
		color: rgba(255, 255, 255, 0.6);
	}

	.tooltip-row .value {
		font-weight: 700;
		margin-left: auto;
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

	@media (max-width: 600px) {
		.chart-container {
			padding: 16px;
		}
		.chart {
			min-height: 300px;
		}
		h2 {
			font-size: 18px;
		}
	}

	:global(.chart svg) {
		max-width: 100%;
	}
</style>
