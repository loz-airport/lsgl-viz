<script>
    import { onMount } from "svelte";
    import {
        loadFlightData,
        dailyFlightCounts,
        filteredFlights,
        arrivalStateVectors,
        departureStateVectors,
        isLoading,
        loadError,
    } from "$lib/stores/flightData.js";
    import DailyFlightChart from "$lib/components/DailyFlightChart.svelte";
    import FlightTimesScatter from "$lib/components/FlightTimesScatter.svelte";
    import FlightMap from "$lib/components/FlightMap.svelte";

    onMount(() => {
        loadFlightData();
    });
</script>

<svelte:head>
    <title>LSGL - Lausanne-Blécherette Flight Tracker</title>
    <meta
        name="description"
        content="Visualisation interactive des vols à l'aéroport de Lausanne-Blécherette (LSGL)"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
    />
</svelte:head>

<div class="app">
    <header>
        <div class="header-content">
            <div class="logo">
                <span class="icon">✈️</span>
                <div>
                    <h1>LSGL Flight Tracker</h1>
                    <p class="subtitle">Lausanne-Blécherette Airport</p>
                </div>
            </div>
            <div class="info">
                <span class="badge">7 derniers jours</span>
            </div>
        </div>
    </header>

    <main>
        {#if $isLoading}
            <div class="loading">
                <div class="spinner"></div>
                <p>Chargement des données de vol...</p>
            </div>
        {:else if $loadError}
            <div class="error">
                <p>❌ Erreur lors du chargement: {$loadError}</p>
            </div>
        {:else}
            <div class="charts">
                <DailyFlightChart data={$dailyFlightCounts} />
                <FlightTimesScatter data={$filteredFlights} />
                <FlightMap
                    arrivalStateVectors={$arrivalStateVectors}
                    departureStateVectors={$departureStateVectors}
                    selectedDay={0}
                />
            </div>
        {/if}
    </main>

    <footer>
        <p>
            Données fournies par <a
                href="https://opensky-network.org"
                target="_blank"
                rel="noopener">OpenSky Network</a
            >
            ·
            <a
                href="https://github.com/loz-airport/LSGL_tracker"
                target="_blank"
                rel="noopener">GitHub</a
            >
        </p>
    </footer>
</div>

<style>
    .app {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }

    header {
        background: rgba(0, 0, 0, 0.3);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding: 24px 32px;
        backdrop-filter: blur(20px);
    }

    .header-content {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
    }

    .logo {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .icon {
        font-size: 48px;
        line-height: 1;
    }

    h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 700;
        background: linear-gradient(135deg, #60a5fa, #f97316);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .subtitle {
        margin: 4px 0 0 0;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
    }

    .badge {
        background: rgba(59, 130, 246, 0.2);
        color: #60a5fa;
        padding: 6px 16px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        border: 1px solid rgba(59, 130, 246, 0.3);
    }

    main {
        flex: 1;
        padding: 32px;
        max-width: 1400px;
        width: 100%;
        margin: 0 auto;
    }

    .loading,
    .error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        gap: 20px;
    }

    .spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(255, 255, 255, 0.1);
        border-top-color: #60a5fa;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .loading p,
    .error p {
        color: rgba(255, 255, 255, 0.8);
        font-size: 16px;
    }

    .error p {
        color: #f87171;
    }

    .charts {
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    footer {
        background: rgba(0, 0, 0, 0.3);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding: 24px 32px;
        text-align: center;
        backdrop-filter: blur(20px);
    }

    footer p {
        margin: 0;
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
    }

    footer a {
        color: #60a5fa;
        text-decoration: none;
        transition: color 0.2s;
    }

    footer a:hover {
        color: #93c5fd;
        text-decoration: underline;
    }

    @media (max-width: 768px) {
        header {
            padding: 16px 20px;
        }

        main {
            padding: 20px;
        }

        .icon {
            font-size: 36px;
        }

        h1 {
            font-size: 22px;
        }
    }
</style>
