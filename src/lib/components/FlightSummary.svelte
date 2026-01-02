<script>
    import * as Plot from "@observablehq/plot";
    import { onMount } from "svelte";
    import { flightStore } from "$lib/stores/flightData.svelte.js";
    import { isValidValue } from "$lib/utils/dataLoader.js";

    let { arrivals = [], departures = [] } = $props();

    let airportsContainer = $state();
    let aircraftContainer = $state();
    let hoveredAircraft = $state(null);
    let tooltipPos = $state({ x: 0, y: 0 });

    // Calculate Average Daily Flights (Last 30 Days)
    const dailyAverage = $derived.by(() => {
        if (!arrivals.length && !departures.length) return "0.0";

        // Use last 30 days logic consistent with the dashboard
        const days = 30;
        const totalFlights = arrivals.length + departures.length;
        return (totalFlights / days).toFixed(1);
    });

    // Top 10 Connected Airports
    const topAirports = $derived.by(() => {
        const counts = {};

        arrivals.forEach((f) => {
            const icao = f.departure_airport_ICAO;
            if (!icao) return;
            if (!counts[icao])
                counts[icao] = { icao, arrivals: 0, departures: 0, total: 0 };
            counts[icao].arrivals++;
            counts[icao].total++;
        });

        departures.forEach((f) => {
            const icao = f.destination_airport_ICAO;
            if (!icao) return;
            if (!counts[icao])
                counts[icao] = { icao, arrivals: 0, departures: 0, total: 0 };
            counts[icao].departures++;
            counts[icao].total++;
        });

        return Object.values(counts)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .flatMap((d) => {
                const info = flightStore.getAirportInfo(d.icao);
                let rawName = info?.name || d.icao;
                // Strip "Airport" from the end
                let airportName = rawName.replace(/\sAirport$/, "");

                const countryCode = info?.country ? ` (${info.country})` : "";

                if (d.icao === "LSGL") {
                    airportName = "Lausanne-Blécherette (Boucles)";
                } else if (airportName === "NA" || !airportName) {
                    airportName = "Aéroport inconnu";
                } else {
                    airportName += countryCode;
                }

                return [
                    {
                        icao: d.icao,
                        type: "Atterrissages",
                        count: d.arrivals,
                        name: airportName,
                    },
                    {
                        icao: d.icao,
                        type: "Décollages",
                        count: d.departures,
                        name: airportName,
                    },
                ];
            });
    });

    // Top 10 Aircraft
    const topAircraft = $derived.by(() => {
        const counts = {};

        arrivals.forEach((f) => {
            const icao24 = f.ICAO24;
            if (!icao24) return;
            if (!counts[icao24])
                counts[icao24] = {
                    icao24,
                    arrivals: 0,
                    departures: 0,
                    total: 0,
                    metadata: f.metadata,
                };
            counts[icao24].arrivals++;
            counts[icao24].total++;
        });

        departures.forEach((f) => {
            const icao24 = f.ICAO24;
            if (!icao24) return;
            if (!counts[icao24])
                counts[icao24] = {
                    icao24,
                    arrivals: 0,
                    departures: 0,
                    total: 0,
                    metadata: f.metadata,
                };
            counts[icao24].departures++;
            counts[icao24].total++;
        });

        return Object.values(counts)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .flatMap((d) => [
                {
                    icao24: d.icao24,
                    type: "Landings",
                    count: d.arrivals,
                    metadata: d.metadata,
                    callsign: d.metadata?.callsign || d.icao24,
                },
                {
                    icao24: d.icao24,
                    type: "Take-offs",
                    count: d.departures,
                    metadata: d.metadata,
                    callsign: d.metadata?.callsign || d.icao24,
                },
            ]);
    });

    function renderCharts() {
        if (!airportsContainer || !aircraftContainer) return;

        // Render Airports Chart
        airportsContainer.innerHTML = "";
        const airportPlot = Plot.plot({
            width: airportsContainer.clientWidth,
            height: 350,
            marginLeft: 220,
            x: { label: "Nombre de vols", grid: true },
            y: {
                label: null,
                domain: [...new Set(topAirports.map((d) => d.icao))],
                tickFormat: (icao) => {
                    const entry = topAirports.find((a) => a.icao === icao);
                    return entry ? entry.name : icao;
                },
                tickSize: 0,
            },
            color: {
                domain: ["Atterrissages", "Décollages"],
                range: ["#3b82f6", "#f97316"],
                legend: true,
            },
            marks: [
                Plot.barX(
                    topAirports,
                    Plot.stackX({
                        x: "count",
                        y: "icao",
                        fill: "type",
                        insetTop: 0,
                        insetBottom: 0,
                        stroke: null,
                        shapeRendering: "crispEdges",
                    }),
                ),
                Plot.text(
                    topAirports,
                    Plot.stackX({
                        x: "count",
                        y: "icao",
                        text: (d) => (d.count > 0 ? d.count : ""),
                        fill: "white",
                        fontWeight: "bold",
                        fontSize: 10,
                    }),
                ),
                Plot.ruleX([0], { strokeOpacity: 0.2 }),
            ],
            style: {
                background: "transparent",
                color: "white",
                fontSize: "11px",
            },
        });
        airportsContainer.appendChild(airportPlot);

        // Render Aircraft Chart
        aircraftContainer.innerHTML = "";
        const aircraftPlot = Plot.plot({
            width: aircraftContainer.clientWidth,
            height: 350,
            x: { label: null, padding: 0.4 },
            y: { label: "Performance", grid: true },
            color: {
                domain: ["Landings", "Take-offs"],
                range: ["#60a5fa", "#fb923c"],
            },
            marks: [
                Plot.barY(topAircraft, {
                    x: "icao24",
                    y: "count",
                    fill: "type",
                }),
                Plot.ruleY([0]),
            ],
            style: {
                background: "transparent",
                color: "white",
            },
        });
        aircraftContainer.appendChild(aircraftPlot);

        // Interaction handling for aircraft chart
        const bars = aircraftContainer.querySelectorAll("rect");
        // Observable plot groups objects by type, so we need to find the data index
        // Since we flatMapped [landings, takeoffs], the bars follow that order per category
        // but Plot might reorder. A safer way is to use Plot's own interactivity if possible,
        // but for a "WOW" effect, custom DOM tooltips are better.
        // Let's use a simpler mapping: we know topAircraft has 20 entries (10 aircraft * 2 types)
        bars.forEach((bar, i) => {
            bar.style.cursor = "pointer";
            bar.style.transition = "filter 0.2s";

            bar.addEventListener("mouseenter", (e) => {
                const d = topAircraft[i];
                if (!d) return;

                // Aggregate counts for matches
                const matches = topAircraft.filter(
                    (a) => a.icao24 === d.icao24,
                );
                const landings =
                    matches.find((m) => m.type === "Landings")?.count || 0;
                const takeoffs =
                    matches.find((m) => m.type === "Take-offs")?.count || 0;

                hoveredAircraft = {
                    ...d,
                    landings,
                    takeoffs,
                };

                updateTooltipPos(e);
                bar.style.filter = "brightness(1.5)";
            });

            bar.addEventListener("mousemove", (e) => {
                updateTooltipPos(e);
            });

            bar.addEventListener("mouseleave", () => {
                hoveredAircraft = null;
                bar.style.filter = "none";
            });
        });
    }

    function updateTooltipPos(e) {
        const rect = aircraftContainer.getBoundingClientRect();
        tooltipPos = {
            x: e.clientX - rect.left + 15,
            y: e.clientY - rect.top - 150,
        };
    }

    onMount(() => {
        renderCharts();
        window.addEventListener("resize", renderCharts);
        return () => window.removeEventListener("resize", renderCharts);
    });

    $effect(() => {
        if (arrivals.length || departures.length) {
            renderCharts();
        }
    });
</script>

<div class="summary-container">
    <div class="stat-box glass">
        <div class="stat-header">
            <span class="stat-icon">📈</span>
            <h3>Activité quotidienne</h3>
        </div>
        <div class="stat-value">{dailyAverage}</div>
        <div class="stat-label">vols en moyenne par jour (30j)</div>
        <p class="stat-description">
            Au cours des 30 derniers jours, il y a eu en moyenne <strong
                >{dailyAverage}</strong
            > vols passant par l'aéroport de la Blécherette (LSGL).
        </p>
    </div>

    <div class="charts-grid">
        <div class="chart-card glass">
            <h3>Top 10 aéroports connectés à la Blécherette</h3>
            <div bind:this={airportsContainer} class="chart-container"></div>
            <p class="chart-footnote">
                Les vols effectuant une boucle depuis la Blécherette comptent
                comme 1 décollage + 1 atterrissage
            </p>
        </div>

        <div class="chart-card glass aircraft-card">
            <h3>Top 10 aéronefs les plus actifs</h3>
            <div
                bind:this={aircraftContainer}
                class="chart-container aircraft-chart"
            ></div>

            {#if hoveredAircraft}
                <div
                    class="custom-tooltip glass"
                    style="left: {tooltipPos.x}px; top: {tooltipPos.y}px;"
                >
                    <div class="tooltip-header">
                        <span class="tooltip-callsign"
                            >{hoveredAircraft.metadata?.call_sign ||
                                hoveredAircraft.icao24}</span
                        >
                        <span class="tooltip-icao"
                            >{hoveredAircraft.icao24}</span
                        >
                    </div>

                    <div class="tooltip-body">
                        {#if hoveredAircraft.metadata?.photo_url && hoveredAircraft.metadata.photo_url !== "NA"}
                            <div class="tooltip-photo">
                                <img
                                    src={hoveredAircraft.metadata.photo_url}
                                    alt="Aircraft"
                                />
                            </div>
                        {/if}

                        <div class="tooltip-info">
                            <div class="info-row">
                                <span class="label">Modèle:</span>
                                <span class="value"
                                    >{hoveredAircraft.metadata?.model ||
                                        "Inconnu"}</span
                                >
                            </div>
                            <div class="info-row">
                                <span class="label">Pays:</span>
                                <span class="value"
                                    >{hoveredAircraft.metadata
                                        ?.country_of_registration ||
                                        "Inconnu"}</span
                                >
                            </div>
                            <div class="info-divider"></div>
                            <div class="info-row stats">
                                <span class="label">Atterrissages:</span>
                                <span class="value landing"
                                    >{hoveredAircraft.landings}</span
                                >
                            </div>
                            <div class="info-row stats">
                                <span class="label">Décollages:</span>
                                <span class="value takeoff"
                                    >{hoveredAircraft.takeoffs}</span
                                >
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .summary-container {
        display: flex;
        flex-direction: column;
        gap: 32px;
        margin-bottom: 60px;
    }

    .glass {
        background: rgba(255, 255, 255, 0.03);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }

    .stat-box {
        text-align: center;
        max-width: 600px;
        margin: 0 auto;
        border: 1px solid rgba(96, 165, 250, 0.2);
        background: linear-gradient(
            135deg,
            rgba(30, 41, 59, 0.5),
            rgba(15, 23, 42, 0.5)
        );
    }

    .stat-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-bottom: 16px;
    }

    .stat-icon {
        font-size: 24px;
    }

    .stat-box h3 {
        margin: 0;
        font-family: "Outfit", sans-serif;
        font-size: 18px;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .stat-value {
        font-size: 64px;
        font-weight: 800;
        font-family: "Outfit", sans-serif;
        color: #fff;
        line-height: 1;
        margin-bottom: 8px;
        background: linear-gradient(135deg, #fff, #60a5fa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .stat-label {
        font-size: 14px;
        color: #60a5fa;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 24px;
    }

    .stat-description {
        color: rgba(255, 255, 255, 0.6);
        font-size: 16px;
        line-height: 1.6;
        margin: 0;
    }

    .stat-description strong {
        color: #fff;
    }

    .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
        gap: 32px;
    }

    .chart-card h3 {
        margin-top: 0;
        margin-bottom: 24px;
        font-family: "Outfit", sans-serif;
        font-size: 20px;
        font-weight: 700;
        color: #fff;
    }

    .chart-container {
        width: 100%;
        min-height: 350px;
    }

    .chart-footnote {
        margin-top: 16px;
        font-size: 11px;
        font-style: italic;
        color: rgba(255, 255, 255, 0.4);
        text-align: right;
    }

    @media (max-width: 768px) {
        .charts-grid {
            grid-template-columns: 1fr;
        }

        .stat-value {
            font-size: 48px;
        }

        .glass {
            padding: 24px;
        }
    }

    /* SVG styling override */
    :global(.aircraft-chart svg text),
    :global(.chart-container svg text) {
        font-family: "Outfit", sans-serif !important;
    }

    /* Legend styling */
    :global(.chart-container figure) {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    :global(.chart-container [class*="legend"]) {
        color: white !important;
        font-family: "Outfit", sans-serif !important;
        font-size: 12px !important;
        margin-bottom: 8px;
    }

    .aircraft-card {
        position: relative;
    }

    .custom-tooltip {
        position: absolute;
        width: 280px;
        z-index: 1000;
        padding: 16px;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
        pointer-events: none;
        transition: transform 0.1s ease-out;
    }

    .tooltip-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .tooltip-callsign {
        font-size: 18px;
        font-weight: 700;
        color: #fff;
    }

    .tooltip-icao {
        font-size: 11px;
        font-family: monospace;
        color: rgba(255, 255, 255, 0.4);
    }

    .tooltip-photo {
        width: 100%;
        height: 120px;
        border-radius: 8px;
        overflow: hidden;
        margin-bottom: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .tooltip-photo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .tooltip-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .info-row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
    }

    .info-row .label {
        color: rgba(255, 255, 255, 0.5);
    }

    .info-row .value {
        color: #fff;
        font-weight: 500;
        text-align: right;
    }

    .info-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 4px 0;
    }

    .info-row.stats {
        font-size: 12px;
    }

    .value.landing {
        color: #60a5fa;
    }

    .value.takeoff {
        color: #fb923c;
    }
</style>
