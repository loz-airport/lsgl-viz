<script>
    import * as Plot from "@observablehq/plot";
    import { onMount } from "svelte";

    let { data = [] } = $props();

    let container = $state();

    $effect(() => {
        console.log("FlightTimesScatter effect triggered", {
            hasContainer: !!container,
            dataLength: data.length,
        });
        if (container && data.length > 0) {
            renderChart();
        }
    });

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
                    date: date,
                    timeOfDay: hours,
                    type: flight.flight_type,
                    callSign: flight.call_sign,
                    icao24: flight.ICAO24,
                    formattedTime: time.toLocaleTimeString("fr-CH", {
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
                };
            })
            .filter((d) => d !== null);

        // Find round trips (same aircraft departing and arriving on same day at LSGL)
        const roundTrips = [];
        const grouped = chartData.reduce((acc, flight) => {
            const key = `${flight.icao24}_${flight.date.toISOString().split("T")[0]}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(flight);
            return acc;
        }, {});

        Object.values(grouped).forEach((flights) => {
            if (flights.length === 2) {
                const departure = flights.find((f) => f.type === "departure");
                const arrival = flights.find((f) => f.type === "arrival");
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
                        strokeWidth: 1,
                        opacity: 0.2,
                        curve: "natural",
                    }),
                    // Points for all flights
                    Plot.dot(chartData, {
                        x: "date",
                        y: "timeOfDay",
                        fill: "type",
                        symbol: "type",
                        r: 5,
                        opacity: 0.8,
                        tip: true,
                        stroke: "white",
                        strokeWidth: 0.5,
                        title: (d) =>
                            `${d.type === "arrival" ? "Arrivée" : "Départ"}\n${d.callSign || d.icao24}\n${d.formattedTime}`,
                    }),
                ],
            });

            console.log("Plot generated:", !!plot);
            if (plot) container.appendChild(plot);
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
</script>

<div class="chart-container">
    <h2>Horaires des vols</h2>
    <p class="subtitle">▲ Départs · ▼ Arrivées</p>
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
        margin: 0 0 8px 0;
        font-size: 20px;
        font-weight: 600;
        color: #fff;
    }

    .subtitle {
        margin: 0 0 20px 0;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
    }

    .chart {
        width: 100%;
        min-height: 500px;
        overflow-x: auto;
        border: 1px dashed rgba(255, 255, 255, 0.1); /* Temporary debug border */
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
</style>
