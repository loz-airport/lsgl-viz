<script>
    import * as Plot from "@observablehq/plot";
    import { onMount } from "svelte";
    import { flightStore } from "$lib/stores/flightData.svelte.js";

    let { data = [] } = $props();

    let container = $state();
    let period = $state(7);
    /** @type {any} */
    let hoveredFlight = $state(null);
    // tooltipPos is no longer needed as the tooltip is now a fixed panel

    $effect(() => {
        if (container && data.length > 0) {
            renderChart();
        }
    });

    function handlePeriodChange(newPeriod) {
        period = parseInt(newPeriod);
        flightStore.dateRangeDays = period;
    }

    function renderChart() {
        const rawData = $state.snapshot(data);
        console.log(
            "Rendering FlightTimesScatter with",
            rawData.length,
            "items",
        );
        // Clear previous chart
        if (!container) return;
        container.innerHTML = "";

        // Prepare data with time of day
        const chartData = rawData
            .map((flight) => {
                const time =
                    flight.flight_type === "arrival"
                        ? flight.arrival_time
                        : flight.departure_time;
                const date =
                    flight.flight_type === "arrival"
                        ? flight.arrival_date
                        : flight.departure_date;

                if (!time || !date) return null;

                const hours = time.getHours() + time.getMinutes() / 60;

                return {
                    ...flight,
                    date: date,
                    timeOfDay: hours,
                    formattedTime: time.toLocaleTimeString("fr-CH", {
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
                };
            })
            .filter((d) => d !== null);

        // Find round trips (same aircraft departing and arriving on same day at LSGL)
        /** @type {any[]} */
        const roundTrips = [];
        const grouped = chartData.reduce((acc, flight) => {
            const key = `${flight.ICAO24}_${flight.date.toISOString().split("T")[0]}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(flight);
            return acc;
        }, {});

        Object.values(grouped).forEach((flights) => {
            if (Array.isArray(flights) && flights.length >= 2) {
                const departure = flights.find(
                    (f) => f.flight_type === "departure",
                );
                const arrival = flights.find(
                    (f) => f.flight_type === "arrival",
                );
                if (departure && arrival) {
                    roundTrips.push({ departure, arrival });
                }
            }
        });

        try {
            const plot = Plot.plot({
                marginLeft: 60,
                marginBottom: 50,
                width: container.offsetWidth > 0 ? container.offsetWidth : 700,
                height: 500,
                style: {
                    background: "transparent",
                    fontSize: "14px",
                    fontFamily: "Inter, system-ui, sans-serif",
                },
                x: {
                    type: "time",
                    label: null,
                    tickFormat: (d) =>
                        new Intl.DateTimeFormat("fr-CH", {
                            month: "short",
                            day: "numeric",
                        }).format(d),
                },
                y: {
                    label: "Heure de la journée",
                    domain: [0, 24],
                    ticks: 12,
                    tickFormat: (h) =>
                        `${Math.floor(h).toString().padStart(2, "0")}:00`,
                    grid: true,
                },
                symbol: {
                    domain: ["arrival", "departure"],
                    range: ["triangle", "circle"],
                },
                marks: [
                    // Curves for round trips
                    Plot.link(roundTrips, {
                        x1: (d) => d.departure.date,
                        y1: (d) => d.departure.timeOfDay,
                        x2: (d) => d.arrival.date,
                        y2: (d) => d.arrival.timeOfDay,
                        stroke: "#ffffff",
                        strokeWidth: 2,
                        opacity: 0.4,
                        curve: "natural",
                    }),
                    // Points for all flights
                    Plot.dot(chartData, {
                        x: "date",
                        y: "timeOfDay",
                        fill: "flight_type",
                        symbol: "flight_type",
                        r: period === 7 ? 6 : 4,
                        opacity: 0.8,
                        stroke: "white",
                        strokeWidth: 0.5,
                        // Use built-in pointer interaction to find data
                        tip: true,
                    }),
                ],
            });

            if (plot) {
                // Add event listener to the SVG to show our custom tooltip
                // We'll use the 'input' event if Observable Plot supports it,
                // but standard way is to detect the 'plot.tip' or add a custom layer.
                // To keep it simple and fix the previous error, I'll use a voronoi-less approach
                // and just use the built-in tip for now OR add a proper mouse handler.
                container.appendChild(plot);

                // Hacky way to catch the hover data from Plot's tip
                plot.addEventListener("input", () => {
                    if (plot.value) {
                        hoveredFlight = plot.value;
                        // We'll need coordinates. Plot doesn't expose them easily here.
                        // So I'll stick to standard Plot tip for now but find a way to include metadata.
                    } else {
                        hoveredFlight = null;
                    }
                });
            }
        } catch (e) {
            console.error("Plot rendering failed:", e);
        }
    }

    onMount(() => {
        console.log("FlightTimesScatter mounted", {
            hasContainer: !!container,
        });
        if (data.length > 0) {
            renderChart();
        }
    });

    // We'll use a slightly different approach for the tooltip since Plot 0.6 tips are hard to hijack for images
    // I will use the built-in title for the 4 text fields and maybe a separate "Selected Aircraft" panel if it's too hard to put image in tooltip
    // Actually, I'll try to use a custom mark for the tooltip.
</script>

<div class="chart-container">
    <div class="header">
        <div>
            <h2>Horaires des vols</h2>
            <p class="subtitle">
                ▲ Départs · ● Arrivées · Lignes courbes = Escales
            </p>
        </div>
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

    {#if hoveredFlight}
        <div class="flight-detail-panel">
            <div class="panel-header">
                <span
                    class="type-badge"
                    class:arrival={hoveredFlight.flight_type === "arrival"}
                >
                    {hoveredFlight.flight_type === "arrival"
                        ? "ARRIVÉE"
                        : "DÉPART"}
                </span>
                <span class="time">{hoveredFlight.formattedTime}</span>
            </div>

            <div class="flight-main">
                <div class="callsign">
                    {hoveredFlight.call_sign || "Inconnu"}
                </div>
                <div class="icao">{hoveredFlight.ICAO24}</div>
            </div>

            {#if hoveredFlight.metadata}
                <div class="metadata-info">
                    <div class="model">
                        {hoveredFlight.metadata.model || "Modèle inconnu"}
                    </div>
                    <div class="registration">
                        {#if hoveredFlight.metadata.country_of_registration}
                            <span class="flag">📍</span>
                            {hoveredFlight.metadata.country_of_registration}
                        {/if}
                    </div>
                </div>
                {#if hoveredFlight.metadata.photo_url}
                    <div class="aircraft-img">
                        <img
                            src={hoveredFlight.metadata.photo_url}
                            alt="Aircraft"
                        />
                    </div>
                {/if}
            {/if}
        </div>
    {:else}
        <div class="panel-placeholder">
            <p>Survolez un vol pour voir les détails de l'appareil</p>
        </div>
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
        display: grid;
        grid-template-columns: 1fr 280px;
        gap: 24px;
    }

    .header {
        grid-column: 1 / -1;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
    }

    h2 {
        margin: 0 0 4px 0;
        font-size: 20px;
        font-weight: 600;
        color: #fff;
    }

    .subtitle {
        margin: 0;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.6);
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
        background: #f97316;
        color: white;
    }

    .chart {
        width: 100%;
        min-height: 500px;
        overflow-x: auto;
    }

    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        color: rgba(255, 255, 255, 0.6);
    }

    :global(.chart svg) {
        max-width: 100%;
    }

    .flight-detail-panel,
    .panel-placeholder {
        background: rgba(15, 23, 42, 0.4);
        border-radius: 12px;
        padding: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        height: min-content;
        min-height: 400px;
    }

    .panel-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: rgba(255, 255, 255, 0.4);
        font-size: 14px;
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }

    .type-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 4px;
        background: #f97316;
    }

    .type-badge.arrival {
        background: #3b82f6;
    }

    .time {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
    }

    .flight-main {
        margin-bottom: 12px;
    }

    .callsign {
        font-size: 24px;
        font-weight: 700;
        letter-spacing: -0.5px;
    }

    .icao {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.5);
        font-family: monospace;
    }

    .metadata-info {
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 12px;
        margin-top: 12px;
    }

    .model {
        font-size: 14px;
        font-weight: 500;
        color: #cbd5e1;
    }

    .registration {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 4px;
    }

    .aircraft-img {
        margin-top: 16px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.2);
    }

    .aircraft-img img {
        width: 100%;
        height: auto;
        display: block;
    }

    @media (max-width: 900px) {
        .chart-container {
            grid-template-columns: 1fr;
        }
        .flight-detail-panel,
        .panel-placeholder {
            min-height: auto;
        }
    }
</style>
