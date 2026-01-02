<script>
    import { onMount } from "svelte";
    import { flightStore } from "$lib/stores/flightData.svelte.js";
    import DailyFlightChart from "$lib/components/DailyFlightChart.svelte";
    import FlightTimesScatter from "$lib/components/FlightTimesScatter.svelte";
    import FlightMap from "$lib/components/FlightMap.svelte";
    import bannerImage from "$lib/assets/banner_LAT_dark.png";

    let scrollY = $state(0);

    onMount(() => {
        flightStore.loadData();
    });
</script>

<svelte:window bind:scrollY />

<svelte:head>
    <title
        >Lausanne-Blécherette (LSGL): Trafic avions, nuisances et statistiques -
        Flight Tracker</title
    >
    <meta
        name="description"
        content="Suivez le trafic aérien de l'aéroport de Lausanne-Blécherette en temps réel. Visualisation des mouvements d'avions, impacts sur le quartier Plaines-du-Loup et analyse des nuisances aériennes."
    />
    <meta
        name="keywords"
        content="Lausanne Blécherette aéroport, trafic aérien, nuisances sonores, quartier Plaines-Du-Loup, avions, LSGL, flight tracker, mouvements avions, statistiques vol"
    />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://lsgl-tracker.vercel.app/" />
    <meta
        property="og:title"
        content="Lausanne-Blécherette (LSGL): Trafic avions et statistiques"
    />
    <meta
        property="og:description"
        content="Visualisation interactive des vols, atterrissages et décollages à la Blécherette. Données factuelles sur le trafic au-dessus de Lausanne et des Plaines-du-Loup."
    />
    <meta
        property="og:image"
        content="https://raw.githubusercontent.com/loz-airport/LSGL_tracker/main/lsgl-viz/src/lib/assets/banner_LAT_dark.png"
    />

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta
        property="twitter:title"
        content="Lausanne-Blécherette (LSGL): Trafic avions et statistiques"
    />
    <meta
        property="twitter:description"
        content="Visualisation interactive des vols à la Blécherette. Données factuelles sur le trafic au-dessus de Lausanne."
    />
    <meta
        property="twitter:image"
        content="https://raw.githubusercontent.com/loz-airport/LSGL_tracker/main/lsgl-viz/src/lib/assets/banner_LAT_dark.png"
    />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
    <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
    />
</svelte:head>

<div class="app">
    <nav class="nav-floating" class:scrolled={scrollY > 50}>
        <div class="nav-content">
            <img src={bannerImage} alt="Logo" class="nav-logo" />
            <span class="nav-title">LSGL Tracker</span>
            <div class="nav-links">
                <a href="#vols-quotidiens">Statistiques</a>
                <a href="#map">Carte</a>
                <a
                    href="https://github.com/loz-airport/LSGL_tracker"
                    target="_blank">GitHub</a
                >
            </div>
        </div>
    </nav>

    <div class="hero">
        <div class="hero-bg" style="transform: translateY({scrollY * 0.4}px)">
            <img
                src="/src/lib/assets/Aerial_image_of_the_Lausanne-La_Blécherette_airfield.jpg"
                alt="Lausanne-Blécherette Airport"
            />
            <div class="hero-overlay"></div>
        </div>
        <div
            class="hero-content"
            style="transform: translateY({scrollY * 0.2}px); opacity: {1 -
                scrollY / 600}"
        >
            <h1 class="hero-title">
                <span class="eyebrow">Aéroport Lausanne-Blécherette</span>
                <span class="main-title"
                    >Cap sur la <span class="gradient">Transparence</span></span
                >
            </h1>
            <p class="hero-tagline">
                Visualisez l'occupation du ciel lausannois avec des données
                réelles et factuelles.
            </p>
            <div class="hero-actions">
                <a href="#stats" class="btn btn-primary">Explorer les données</a
                >
                <a href="#map" class="btn btn-outline">Voir la carte</a>
            </div>
        </div>
        <div class="scroll-indicator" class:hidden={scrollY > 100}>
            <span>Découvrez</span>
            <div class="mouse">
                <div class="wheel"></div>
            </div>
        </div>
    </div>

    <main id="stats">
        {#if flightStore.isLoading}
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Récupération des trajectoires...</p>
            </div>
        {:else if flightStore.loadError}
            <div class="error-state">
                <p>❌ Erreur de chargement: {flightStore.loadError}</p>
            </div>
        {:else if flightStore.isProcessing}
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Traitement des données en cours...</p>
            </div>
        {:else}
            <section class="info-section glass">
                <div class="info-content">
                    <h2>Objectiver le trafic aérien</h2>
                    <p>
                        L'activité de l'aéroport de la Blécherette suscite de
                        nombreuses questions. Ce projet vise à offrir aux
                        riverains comme aux passionnés un outil factuel pour
                        observer l'occupation du ciel lausannois, au-delà des
                        simples ressentis.
                    </p>
                    <div class="info-grid">
                        <div class="info-card">
                            <h3>Indépendant</h3>
                            <p>
                                S'appuie sur l'API communautaire OpenSky
                                Network.
                            </p>
                        </div>
                        <div class="info-card">
                            <h3>Factuel</h3>
                            <p>
                                Visualisation brute des signaux ADS-B des
                                aéronefs.
                            </p>
                        </div>
                        <div class="info-card">
                            <h3>Local</h3>
                            <p>
                                Focus spécifique sur LSGL et les quartiers
                                environnants.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <div class="dashboard">
                <div class="chart-section" id="vols-quotidiens">
                    <DailyFlightChart data={flightStore.dailyFlightCounts} />
                </div>
                <div class="chart-section" id="horaires">
                    <FlightTimesScatter data={flightStore.filteredFlights} />
                </div>
                <div class="chart-section map-full" id="map">
                    <FlightMap
                        arrivalStateVectors={flightStore.arrivalStateVectors}
                        departureStateVectors={flightStore.departureStateVectors}
                    />
                </div>
            </div>
        {/if}
    </main>

    <footer>
        <div class="footer-content">
            <p>
                Données fournies par <a
                    href="https://opensky-network.org"
                    target="_blank">OpenSky Network</a
                >
            </p>
            <p>
                Projet Open Source · <a
                    href="https://github.com/loz-airport/LSGL_tracker"
                    target="_blank">GitHub</a
                >
            </p>
        </div>
    </footer>
</div>

<style>
    .app {
        min-height: 100vh;
        background: #0f172a;
    }

    /* Floating Navigation */
    .nav-floating {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        padding: 16px 32px;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        background: transparent;
    }

    .nav-floating.scrolled {
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(20px);
        padding: 12px 32px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
    }

    .nav-content {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .nav-logo {
        height: 32px;
        width: auto;
    }

    .nav-title {
        font-family: "Outfit", sans-serif;
        font-weight: 700;
        letter-spacing: -0.5px;
        font-size: 18px;
        background: linear-gradient(135deg, #fff, #94a3b8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .nav-links {
        margin-left: auto;
        display: flex;
        gap: 32px;
    }

    .nav-links a {
        color: rgba(255, 255, 255, 0.7);
        text-decoration: none;
        font-size: 14px;
        font-weight: 500;
        transition: color 0.2s;
        font-family: "Outfit", sans-serif;
    }

    .nav-links a:hover {
        color: #fff;
    }

    /* Hero Section */
    .hero {
        position: relative;
        height: 100vh;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        margin-bottom: 80px;
    }

    .hero-bg {
        position: absolute;
        top: -10%;
        left: 0;
        width: 100%;
        height: 120%;
        z-index: 1;
        will-change: transform;
    }

    .hero-bg img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .hero-overlay {
        position: absolute;
        inset: 0;
        background: radial-gradient(
            circle at center,
            rgba(15, 23, 42, 0.4) 0%,
            rgba(15, 23, 42, 0.9) 100%
        );
        z-index: 2;
    }

    .hero-content {
        position: relative;
        z-index: 10;
        max-width: 800px;
        text-align: center;
        padding: 0 32px;
        will-change: transform, opacity;
    }

    .hero-title {
        margin-bottom: 24px;
    }

    .eyebrow {
        display: block;
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 4px;
        color: #60a5fa;
        margin-bottom: 12px;
        font-family: "Outfit", sans-serif;
    }

    .main-title {
        display: block;
        font-size: clamp(48px, 8vw, 84px);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -3px;
        font-family: "Outfit", sans-serif;
        color: #fff;
    }

    .gradient {
        background: linear-gradient(135deg, #60a5fa, #f97316);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .hero-tagline {
        font-size: clamp(16px, 2vw, 20px);
        color: rgba(255, 255, 255, 0.7);
        margin-bottom: 40px;
        max-width: 600px;
        margin-inline: auto;
    }

    .hero-actions {
        display: flex;
        gap: 16px;
        justify-content: center;
    }

    .btn {
        padding: 14px 28px;
        border-radius: 50px;
        font-weight: 600;
        font-size: 16px;
        text-decoration: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: "Outfit", sans-serif;
    }

    .btn-primary {
        background: #fff;
        color: #0f172a;
        box-shadow: 0 4px 20px rgba(255, 255, 255, 0.2);
    }

    .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 30px rgba(255, 255, 255, 0.3);
    }

    .btn-outline {
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        backdrop-filter: blur(10px);
    }

    .btn-outline:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: #fff;
    }

    /* Scroll Indicator */
    .scroll-indicator {
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        color: rgba(255, 255, 255, 0.4);
        font-size: 12px;
        font-family: "Outfit", sans-serif;
        letter-spacing: 2px;
        text-transform: uppercase;
        transition:
            opacity 0.3s,
            transform 0.3s;
    }

    .scroll-indicator.hidden {
        opacity: 0;
        transform: translate(-50%, 20px);
    }

    .mouse {
        width: 24px;
        height: 40px;
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        position: relative;
    }

    .wheel {
        width: 2px;
        height: 6px;
        background: #fff;
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        border-radius: 1px;
        animation: scroll 1.5s infinite;
    }

    @keyframes scroll {
        0% {
            transform: translate(-50%, 0);
            opacity: 1;
        }
        100% {
            transform: translate(-50%, 15px);
            opacity: 0;
        }
    }

    /* Main Content */
    main {
        max-width: 1400px;
        margin: 0 auto;
        padding: 0 32px 100px;
    }

    .info-section {
        margin-bottom: 80px;
        padding: 60px;
        border-radius: 32px;
    }

    .info-content h2 {
        font-family: "Outfit", sans-serif;
        font-size: 42px;
        font-weight: 700;
        margin-bottom: 24px;
        letter-spacing: -1px;
    }

    .info-content p {
        font-size: 18px;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.7;
        margin-bottom: 48px;
        max-width: 800px;
    }

    .info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 32px;
    }

    .info-card h3 {
        font-family: "Outfit", sans-serif;
        font-size: 20px;
        color: #fff;
        margin-bottom: 12px;
    }

    .info-card p {
        font-size: 15px;
        margin-bottom: 0;
    }

    /* Dashboard Layout */
    .dashboard {
        display: flex;
        flex-direction: column;
        gap: 60px;
    }

    .dashboard :global(.chart-container) {
        margin-bottom: 0; /* Override component margin */
    }

    .chart-section.map-full {
        height: 600px;
        border-radius: 24px;
        overflow: hidden;
    }

    /* States */
    .loading-state,
    .error-state {
        min-height: 400px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
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

    /* Footer */
    footer {
        padding: 80px 32px 40px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        text-align: center;
    }

    .footer-content p {
        color: rgba(255, 255, 255, 0.4);
        font-size: 14px;
        margin-bottom: 12px;
    }

    footer a {
        color: #60a5fa;
        text-decoration: none;
    }

    @media (max-width: 768px) {
        .nav-floating {
            padding: 16px 20px;
        }
        .nav-links {
            display: none;
        }
        .hero-title {
            margin-bottom: 16px;
        }
        .hero-tagline {
            margin-bottom: 32px;
        }
        main {
            padding: 0 20px 60px;
        }
        .info-section {
            padding: 40px 24px;
        }
        .info-content h2 {
            font-size: 32px;
        }
    }

    :global(figure) {
        margin: 0;
    }

    :global(.plot-d3-tip),
    :global(.plot-tip) {
        color: #1e293b !important;
        background: rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
        font-family: "Inter", system-ui, sans-serif !important;
        font-size: 13px !important;
        padding: 8px 12px !important;
        border-radius: 6px !important;
        pointer-events: none !important;
        z-index: 1000 !important;
        opacity: 1 !important;
        visibility: visible !important;
        display: block !important;
    }
</style>
