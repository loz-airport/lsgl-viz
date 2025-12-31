<script>
    import * as Plot from "@observablehq/plot";
    import { onMount, onDestroy } from "svelte";
    import { flightStore } from "$lib/stores/flightData.svelte.js";

    let { data = [] } = $props();

    let container = $state();
    let period = $state(7);
    /** @type {any} */
    let hoveredFlight = $state(null);
    // tooltipPos is no longer needed as the tooltip is now a fixed panel

    // Track previous data length to avoid unnecessary re-renders
    let prevDataLength = $state(0);

    // Helper function to check if a value is valid (not NA, null, undefined, or empty)
    function isValidValue(value) {
        return (
            value &&
            value !== "NA" &&
            value !== "null" &&
            String(value).trim() !== ""
        );
    }

    // Common airports mapping
    const COMMON_AIRPORTS = {
        LSGG: "Genève, Suisse",
        LSZH: "Zurich, Suisse",
        LFSB: "Bâle-Mulhouse, Suisse/France",
        LSGK: "Saanen, Suisse",
        LSGS: "Sion, Suisse",
        LSGC: "Les Eplatures, Suisse",
        LSZB: "Berne, Suisse",
        LSZA: "Lugano, Suisse",
        LFLB: "Chambéry, France",
        LFLL: "Lyon Saint-Exupéry, France",
        LFLP: "Annecy, France",
    };

    function getAirportName(code) {
        if (!code) return null;
        return COMMON_AIRPORTS[code] || null; // Return null if not found to fall back to code
    }

    // Custom downward triangle symbol matching Plot's standard triangle size
    const downTriangle = {
        draw(context, size) {
            // Standard equilateral triangle has area = size
            // To match visual weight, we match the area and then scale up slightly (1.1x)
            const r =
                (Math.sqrt((4 * size) / Math.sqrt(3)) / Math.sqrt(3)) * 1.1;
            const w = (r * Math.sqrt(3)) / 2;

            context.moveTo(0, r); // Bottom tip
            context.lineTo(w, -r / 2); // Top right
            context.lineTo(-w, -r / 2); // Top left
            context.closePath();
        },
    };

    $effect(() => {
        if (container && data.length > 0) {
            // Debounce chart rendering
            clearTimeout(container._renderTimeout);
            container._renderTimeout = setTimeout(() => {
                renderChart();
            }, 100);
        }
    });

    function handlePeriodChange(newPeriod) {
        period = parseInt(newPeriod);
        flightStore.dateRangeDays = period;
    }

    function renderChart() {
        const rawData = $state.snapshot(data);
        if (!container) return;
        container.innerHTML = "";

        // Prepare data with time of day
        // Group by aircraft and date to facilitate connections
        const flightsByAircraftAndDate = {};

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

                // Get airport code from CSV headers: departure_airport_ICAO or destination_airport_ICAO
                const airportCode =
                    flight.flight_type === "arrival"
                        ? flight.departure_airport_ICAO
                        : flight.destination_airport_ICAO;

                const enhancedFlight = {
                    ...flight,
                    date: date,
                    timeOfDay: hours,
                    airportCode: airportCode,
                    airportInfo: flightStore.getAirportInfo(airportCode),
                    formattedTime: time.toLocaleTimeString("fr-CH", {
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
                    fullDateTime: time.toLocaleString("fr-CH", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
                };

                // Grouping for connections
                const key = `${flight.ICAO24}_${date.toISOString().split("T")[0]}`;
                if (!flightsByAircraftAndDate[key])
                    flightsByAircraftAndDate[key] = [];
                flightsByAircraftAndDate[key].push(enhancedFlight);

                return enhancedFlight;
            })
            .filter((d) => d !== null);

        // Build connection segments
        const connectionSegments = [];
        Object.values(flightsByAircraftAndDate).forEach((flights) => {
            if (flights.length > 1) {
                // Sort by time
                flights.sort((a, b) => a.timeOfDay - b.timeOfDay);
                for (let i = 0; i < flights.length - 1; i++) {
                    const f1 = flights[i];
                    const f2 = flights[i + 1];
                    // Connect Arrival -> Departure (Stopover) or Departure -> Arrival (Training)
                    if (f1.flight_type !== f2.flight_type) {
                        const midTime = (f1.timeOfDay + f2.timeOfDay) / 2;
                        // Offset by ~12 hours to create a visible bow on the time axis
                        const bowOffset = 1000 * 60 * 60 * 12; // 12 hours in ms

                        const id = Math.random().toString(36).substr(2, 9);

                        // We use a group id for Plot.line
                        connectionSegments.push({
                            id,
                            x: new Date(f1.date.getTime()),
                            y: f1.timeOfDay,
                        });
                        connectionSegments.push({
                            id,
                            x: new Date(f1.date.getTime() + bowOffset),
                            y: midTime,
                        });
                        connectionSegments.push({
                            id,
                            x: new Date(f2.date.getTime()),
                            y: f2.timeOfDay,
                        });
                    }
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
                    color: "white",
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
                    label: "Heure",
                    domain: [0, 24],
                    ticks: 24,
                    tickFormat: (h) =>
                        `${Math.floor(h).toString().padStart(2, "0")}:00`,
                    grid: true,
                },
                color: {
                    domain: ["arrival", "departure"],
                    range: ["#f87171", "#22d3ee"], // Red for arrival (down), Cyan for departure (up)
                    legend: true,
                },
                symbol: {
                    domain: ["arrival", "departure"],
                    range: [downTriangle, "triangle"],
                },
                marks: [
                    // Connections
                    Plot.line(connectionSegments, {
                        x: "x",
                        y: "y",
                        z: "id", // Group by segment ID
                        stroke: "white",
                        strokeWidth: 1.5,
                        opacity: 0.2,
                        curve: "natural", // Makes it look curved
                    }),
                    // Background interaction helper
                    Plot.dot(chartData, {
                        x: "date",
                        y: "timeOfDay",
                        r: 12,
                        fill: "transparent",
                        stroke: "none",
                    }),
                    // Points for all flights - TIP DISABLED
                    Plot.dot(chartData, {
                        x: "date",
                        y: "timeOfDay",
                        fill: "flight_type",
                        symbol: "flight_type",
                        r: period === 7 ? 6 : 4,
                        opacity: 0.9,
                        stroke: "white",
                        strokeWidth: 1,
                        tip: false,
                    }),
                    // Pointer for updating sidebar
                    Plot.dot(
                        chartData,
                        Plot.pointer({
                            x: "date",
                            y: "timeOfDay",
                            fill: "none",
                            stroke: "none",
                        }),
                    ),
                ],
            });

            if (plot) {
                container.appendChild(plot);
                plot.addEventListener("input", () => {
                    if (plot.value) {
                        hoveredFlight = plot.value;
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
        if (data.length > 0) {
            renderChart();
        }
    });

    onDestroy(() => {
        if (container?._renderTimeout) {
            clearTimeout(container._renderTimeout);
        }
    });

    // Helper to format airport string
    function formatAirport(type, flight) {
        const code =
            type === "arrival"
                ? flight.departure_airport_ICAO
                : flight.destination_airport_ICAO;

        if (!code || code === "LSGL") return "Local (LSGL)"; // Handle local flights specially

        if (!code) return "Inconnu";

        const info = flightStore.getAirportInfo(code);
        if (info && info.name) {
            return `${info.city || info.name}, ${info.country || ""} (${code})`;
        }
        return code;
    }

    // Helper to calculate duration
    function getDuration(flight) {
        if (flight.arrival_time && flight.departure_time) {
            const diff = Math.abs(flight.arrival_time - flight.departure_time);
            const minutes = Math.floor(diff / 60000);
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return h > 0 ? `${h}h ${m}m` : `${m}min`;
        }
        return "--";
    }
</script>

<div class="chart-container">
    <div class="header">
        <div>
            <h2>Horaires des vols</h2>
            <p class="subtitle">
                ▲ Décollages · ▼ Atterrissages · Lignes courbes = Escales
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

    <div class="flight-detail-panel" class:visible={!!hoveredFlight}>
        {#if hoveredFlight}
            <div class="panel-header">
                <span
                    class="type-badge"
                    class:arrival={hoveredFlight.flight_type === "arrival"}
                >
                    {hoveredFlight.flight_type === "arrival"
                        ? "ATTERRISSAGE"
                        : "DÉCOLLAGE"}
                </span>
                <span class="time">{hoveredFlight.formattedTime}</span>
            </div>

            <div class="flight-main">
                <div class="callsign">
                    {hoveredFlight.call_sign || "Inconnu"}
                </div>
                <div class="icao">{hoveredFlight.ICAO24}</div>
            </div>

            <div class="route-info">
                <div class="route-row">
                    <span class="label"
                        >{hoveredFlight.flight_type === "arrival"
                            ? "Provenance"
                            : "Destination"}:</span
                    >
                    <span class="value"
                        >{formatAirport(
                            hoveredFlight.flight_type,
                            hoveredFlight,
                        )}</span
                    >
                </div>
                <div class="route-row">
                    <span class="label">Date:</span>
                    <span class="value"
                        >{new Intl.DateTimeFormat("fr-CH", {
                            dateStyle: "full",
                        }).format(hoveredFlight.date)}</span
                    >
                </div>
                {#if hoveredFlight.arrival_time && hoveredFlight.departure_time}
                    <div class="route-row">
                        <span class="label">Durée vol:</span>
                        <span class="value">{getDuration(hoveredFlight)}</span>
                    </div>
                {/if}
            </div>

            {#if hoveredFlight.metadata}
                <div class="metadata-info">
                    {#if isValidValue(hoveredFlight.metadata.model)}
                        <div class="model">
                            <strong>Modèle:</strong>
                            {hoveredFlight.metadata.model}
                        </div>
                    {:else}
                        <div
                            class="model"
                            style="color: rgba(255, 255, 255, 0.5);"
                        >
                            <strong>Modèle:</strong> Inconnu
                        </div>
                    {/if}
                    <div class="registration">
                        {#if isValidValue(hoveredFlight.metadata.origin_country)}
                            <strong>Pays:</strong>
                            {hoveredFlight.metadata.origin_country}
                        {:else}
                            <span style="color: rgba(255, 255, 255, 0.5);"
                                >Pays: Inconnu</span
                            >
                        {/if}
                    </div>
                </div>
                {#if isValidValue(hoveredFlight.metadata.photo_url)}
                    <div class="aircraft-img">
                        <img
                            src={hoveredFlight.metadata.photo_url}
                            alt="Aircraft"
                            onerror={(e) => {
                                e.target.style.display = "none";
                                const container = e.target.parentElement;
                                if (container) {
                                    container.innerHTML =
                                        '<div class="no-photo"><span>Photo non disponible</span></div>';
                                }
                            }}
                        />
                    </div>
                {:else}
                    <div class="no-photo">
                        <span>Photo non disponible</span>
                    </div>
                {/if}
            {:else}
                <div class="metadata-info">
                    <div style="color: rgba(255, 255, 255, 0.5);">
                        Métadonnées de l'appareil non disponibles
                    </div>
                </div>
            {/if}
        {:else}
            <div class="panel-placeholder">
                <p>Survolez un vol pour voir les détails</p>
            </div>
        {/if}
    </div>
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
        position: relative;
    }

    @media (max-width: 900px) {
        .chart-container {
            grid-template-columns: 1fr;
            padding-bottom: 120px; /* Space for the bottom sheet */
        }

        .flight-detail-panel {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 100;
            background: rgba(15, 23, 42, 0.95) !important;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 16px 16px 0 0 !important;
            padding: 16px !important;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
            transform: translateY(100%);
            transition: transform 0.3s ease-out;
            max-height: 40vh !important;
            min-height: auto !important;
            overflow-y: auto;
        }

        .flight-detail-panel.visible {
            transform: translateY(0);
        }

        .panel-placeholder {
            display: none !important;
        }

        /* Adjust image size in bottom sheet */
        .aircraft-img {
            max-height: 120px;
            overflow: hidden;
            border-radius: 6px !important;
        }

        .aircraft-img img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
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

    .route-info {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
    }

    .route-row {
        display: flex;
        flex-direction: column;
        margin-bottom: 8px;
    }

    .route-row:last-child {
        margin-bottom: 0;
    }

    .label {
        font-size: 11px;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.5);
        font-weight: 600;
        margin-bottom: 2px;
        letter-spacing: 0.5px;
    }

    .value {
        font-size: 14px;
        color: white;
        font-weight: 500;
        line-height: 1.4;
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
        background: #22d3ee; /* Cyan for Departure */
        text-transform: uppercase;
    }

    .type-badge.arrival {
        background: #f87171; /* Red for Arrival */
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
        margin-bottom: 8px;
    }

    .registration {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.9);
        margin-top: 4px;
    }

    .no-photo {
        margin-top: 16px;
        padding: 20px;
        text-align: center;
        color: rgba(255, 255, 255, 0.4);
        font-size: 12px;
        border: 1px dashed rgba(255, 255, 255, 0.2);
        border-radius: 8px;
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
</style>
