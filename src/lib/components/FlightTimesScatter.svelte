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

    // Custom downward triangle symbol
    const downTriangle = {
        draw(context, size) {
            // User provided path for d3: M0,-50 L50,50 L-50,50 Z
            // We need to scale this to the 'size' (area) provided by Plot
            // standard size is usually in px^2. sqrt(size) is roughly the side/diameter.
            const s = Math.sqrt(size);
            // Triangle down: top-left (-,-), top-right (+,-), bottom (0, +) ?
            // The user's example "M0,-50 L50,50 L-50,50 Z" looks like:
            // 0,-50 (top center?). Wait. SVG coord system: 0,0 is top-left usually?
            // Actually in Plot symbols, 0,0 is center.
            // Downward pointing:
            const h = s * 0.866; // height of equilateral triangle side s
            const r = h / 2; // roughly radius

            // Let's just use a simple inverted triangle logic
            context.moveTo(0, s / 1.5); // Bottom tip
            context.lineTo(s / 1.5, -s / 2); // Top right
            context.lineTo(-s / 1.5, -s / 2); // Top left
            context.closePath();
        },
    };

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
                color: {
                    domain: ["arrival", "departure"],
                    range: ["#3b82f6", "#f97316"], // Bleu pour atterrissages, orange pour décollages
                },
                symbol: {
                    domain: ["arrival", "departure"],
                    range: [downTriangle, "triangle"], // Use standard triangle for departures
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
                        // Disable built-in tip to avoid empty white box conflicts with sidebar
                        tip: false,
                        title: (d) => {
                            const dateStr = new Intl.DateTimeFormat("fr-CH", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                            }).format(d.date);
                            let info = `${dateStr}\n${d.flight_type === "arrival" ? "Atterrissage" : "Décollage"}: ${d.formattedTime}`;

                            // Add flight duration if available
                            if (d.arrival_time && d.departure_time) {
                                const duration = Math.round(
                                    (d.arrival_time - d.departure_time) / 60000,
                                );
                                if (duration > 0) {
                                    const hours = Math.floor(duration / 60);
                                    const minutes = duration % 60;
                                    const durationStr =
                                        hours > 0
                                            ? `${hours}h ${minutes}min`
                                            : `${minutes}min`;
                                    info += `\nTemps de vol: ${durationStr}`;
                                }
                            }

                            // Add airport info
                            const code =
                                d.flight_type === "arrival"
                                    ? d.origin ||
                                      d.departure_airport ||
                                      d.estDepartureAirport
                                    : d.destination ||
                                      d.arrival_airport ||
                                      d.estArrivalAirport;

                            if (code) {
                                // Try to get info from store first, fall back to code
                                const airportInfo =
                                    flightStore.getAirportInfo(code);
                                if (airportInfo && airportInfo.name) {
                                    info += `\n${d.flight_type === "arrival" ? "Provenance" : "Destination"}: ${airportInfo.name}`;
                                    if (airportInfo.country) {
                                        info += ` (${airportInfo.country})`;
                                    }
                                } else {
                                    info += `\n${d.flight_type === "arrival" ? "Provenance" : "Destination"}: ${code}`;
                                }
                            }

                            return info;
                        },
                    }),
                ],
            });

            if (plot) {
                // Add event listener to the SVG to show our custom tooltip
                container.appendChild(plot);

                // Hacky way to catch the hover data from Plot's tip
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
        console.log("FlightTimesScatter mounted", {
            hasContainer: !!container,
        });
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
                            <strong>Pays d'immatriculation:</strong>
                            {hoveredFlight.metadata.origin_country}
                        {:else}
                            <span style="color: rgba(255, 255, 255, 0.5);"
                                >Pays d'immatriculation: Inconnu</span
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
                <p>Survolez un vol pour voir les détails de l'appareil</p>
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
