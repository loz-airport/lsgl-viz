<script>
    import { onMount } from "svelte";
    import { flightStore } from "$lib/stores/flightData.svelte.js";
    import DailyFlightChart from "$lib/components/DailyFlightChart.svelte";
    import FlightTimesScatter from "$lib/components/FlightTimesScatter.svelte";
    import FlightMap from "$lib/components/FlightMap.svelte";
    import bannerImage from "$lib/assets/banner_LAT_dark.png";

    onMount(() => {
        flightStore.loadData();
    });
</script>

<svelte:head>
    <title>Lausanne-Blécherette Airport Flight Tracker</title>
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
            <div class="hero-section">
                <div class="banner-container">
                    <img src={bannerImage} alt="Lausanne-Blécherette Airport" class="banner" />
                </div>
                <div class="title-section">
                    <h1>Lausanne-Blécherette Airport Flight Tracker</h1>
                <div class="airport-image">
                    <img
                        src="/src/lib/assets/Aerial_image_of_the_Lausanne-La_Blécherette_airfield.jpg"
                        alt="Vue aérienne de l'aérodrome de Lausanne-La Blécherette"
                        class="aerial-image"
                        loading="lazy"
                    />
                </div>
                </div>
            </div>
        </div>
    </header>

    <main>
        {#if flightStore.isLoading}
            <div class="loading">
                <div class="spinner"></div>
                <p>Chargement des données de vol...</p>
            </div>
        {:else if flightStore.loadError}
            <div class="error">
                <p>❌ Erreur lors du chargement: {flightStore.loadError}</p>
            </div>
        {:else if flightStore.isProcessing}
            <div class="processing">
                <div class="spinner"></div>
                <p>Traitement des données...</p>
            </div>
        {:else}
            <div class="intro-text">
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
            </div>
            <div class="charts">
                <DailyFlightChart data={flightStore.dailyFlightCounts} />
                <FlightTimesScatter data={flightStore.filteredFlights} />
                <FlightMap
                    arrivalStateVectors={flightStore.arrivalStateVectors}
                    departureStateVectors={flightStore.departureStateVectors}
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
    }

    .hero-section {
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    .banner-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 16px 0;
    }

    .banner {
        height: 100px;
        width: auto;
        max-width: 100%;
        object-fit: contain;
    }

    .title-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
    }

    h1 {
        margin: 0;
        font-size: 32px;
        font-weight: 700;
        background: linear-gradient(135deg, #60a5fa, #f97316);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-align: center;
    }

    .airport-image {
        width: 100%;
        max-width: 800px;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .aerial-image {
        width: 100%;
        height: auto;
        display: block;
        object-fit: cover;
    }

    main {
        flex: 1;
        padding: 32px;
        max-width: 1400px;
        width: 100%;
        margin: 0 auto;
    }

    .loading,
    .error,
    .processing {
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

    .processing p {
        color: rgba(255, 255, 255, 0.8);
    }

    .intro-text {
        max-width: 1400px;
        margin: 0 auto 32px auto;
        padding: 24px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .intro-text p {
        margin: 0;
        color: rgba(255, 255, 255, 0.9);
        font-size: 16px;
        line-height: 1.6;
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

        .banner {
            height: 70px;
        }

        h1 {
            font-size: 24px;
        }

        .airport-image {
            max-width: 100%;
        }

        .intro-text {
            padding: 16px;
        }

        .intro-text p {
            font-size: 14px;
        }
    }
</style>
