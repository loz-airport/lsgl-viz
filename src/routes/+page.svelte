<script>
    import { onMount } from "svelte";
    import { flightStore } from "$lib/stores/flightData.svelte.js";
    import DailyFlightChart from "$lib/components/DailyFlightChart.svelte";
    import FlightTimesScatter from "$lib/components/FlightTimesScatter.svelte";
    import FlightMap from "$lib/components/FlightMap.svelte";
    import FlightSummary from "$lib/components/FlightSummary.svelte";
    import bannerImage from "$lib/assets/banner_LAT_dark.png";
    import heroImage from "$lib/assets/hero_lausanne_airfield.jpg";

    let scrollY = $state(0);
    let mobileMenuOpen = $state(false);

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
            <div class="nav-links" class:open={mobileMenuOpen}>
                <a
                    href="#vols-quotidiens"
                    onclick={() => (mobileMenuOpen = false)}>Statistiques</a
                >
                <a href="#map" onclick={() => (mobileMenuOpen = false)}>Carte</a
                >
                <a href="#resources" onclick={() => (mobileMenuOpen = false)}
                    >Ressources</a
                >
                <a
                    href="https://github.com/loz-airport/LSGL_tracker"
                    target="_blank"
                    onclick={() => (mobileMenuOpen = false)}>GitHub</a
                >
            </div>
            <button
                class="mobile-menu-toggle"
                onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
                aria-label="Menu"
            >
                <span class="bar" class:open={mobileMenuOpen}></span>
                <span class="bar" class:open={mobileMenuOpen}></span>
                <span class="bar" class:open={mobileMenuOpen}></span>
            </button>
        </div>
    </nav>

    {#if mobileMenuOpen}
        <div
            class="mobile-overlay"
            onclick={() => (mobileMenuOpen = false)}
        ></div>
    {/if}

    <div class="hero">
        <div class="hero-bg" style="transform: translateY({scrollY * 0.4}px)">
            <img src={heroImage} alt="Lausanne-Blécherette Airport" />
            <div class="hero-overlay"></div>
        </div>
        <div
            class="hero-content"
            style="transform: translateY({scrollY * 0.2}px); opacity: {1 -
                scrollY / 600}"
        >
            <img src={bannerImage} alt="Logo" class="hero-logo" />
            <h1 class="hero-title">
                <span class="eyebrow">Aéroport Lausanne-Blécherette</span>
                <span class="main-title"
                    >Cap sur la <span class="gradient">transparence</span></span
                >
            </h1>
            <p class="hero-tagline">
                Visualisez l'occupation du ciel lausannois via l'aéroport de la
                Blécherette
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
                        Avec plus d'une dizaine de mouvements quotidiens,
                        l'activité de l'aéroport de la Blécherette suscite de
                        nombreuses questions. Ce projet «Lausanne Airport Flight
                        Tracker» vise à objectiver ces flux aériens. Combien
                        d’avions effectuent de simples boucles d'écolage ou des
                        trajets vers d'autres destinations? En récoltant et
                        visualisant les données réelles de vol, nous offrons aux
                        riverains comme aux passionnés de l'aéronautique un
                        outil factuel pour observer l'occupation du ciel
                        lausannois.
                    </p>
                    <div class="info-grid">
                        <div class="info-card">
                            <h3>Indépendant & factuel</h3>
                            <p>
                                S'appuie sur l'API communautaire OpenSky
                                Network. Visualisation brute des signaux ADS-B
                                des aéronefs.
                            </p>
                        </div>
                        <div class="info-card">
                            <h3>Actualisé en continu</h3>
                            <p>
                                Les données sont actualisées deux fois par jour
                                et restituées avec un différé de 24 heures. Pour
                                un suivi en temps réel, vous pouvez consulter
                                des sites commerciaux comme
                                <a
                                    href="https://www.flightradar24.com/data/airports/qyl"
                                    target="_blank">FlightRadar24</a
                                >
                                ou
                                <a
                                    href="https://fr.flightaware.com/live/airport/LSGL"
                                    target="_blank">FlightAware</a
                                >.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <FlightSummary
                arrivals={flightStore.getFilteredArrivals(30)}
                departures={flightStore.getFilteredDepartures(30)}
            />

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

    <section id="resources" class="resources-section glass">
        <div class="resources-content">
            <h2>Ressources et Articles en lien</h2>

            <div class="resources-grid">
                <div class="resource-group">
                    <h3>Organisations</h3>
                    <ul class="resource-list">
                        <li>
                            <a
                                href="https://adrb.ch/"
                                target="_blank"
                                rel="noopener"
                            >
                                <span class="link-title"
                                    >L’Association de Défense des Riverains de
                                    la Blécherette</span
                                >
                                <span class="link-url">adrb.ch</span>
                            </a>
                        </li>
                        <li>
                            <a
                                href="https://lausanne-airport.ch/"
                                target="_blank"
                                rel="noopener"
                            >
                                <span class="link-title"
                                    >Site officiel de l'aéroport</span
                                >
                                <span class="link-url">lausanne-airport.ch</span
                                >
                            </a>
                        </li>
                    </ul>
                </div>

                <div class="resource-group">
                    <h3>Presse et Médias</h3>
                    <ul class="resource-list press-list">
                        <li>
                            <a
                                href="https://www.rts.ch/info/regions/vaud/14116450-lausanne-souhaite-negocier-un-nouveau-protocole-avec-laeroport-de-la-blecherette.html"
                                target="_blank"
                                rel="noopener"
                            >
                                Lausanne souhaite négocier un nouveau protocole
                                (RTS, 2023)
                            </a>
                        </li>
                        <li>
                            <a
                                href="https://www.lematin.ch/story/nuisances-a-laeroport-de-la-blecherette-tout-va-tres-bien-selon-berne-519920535055"
                                target="_blank"
                                rel="noopener"
                            >
                                Nuisances à l'aéroport: "Tout va très bien selon
                                Berne" (Le Matin, 2021)
                            </a>
                        </li>
                        <li>
                            <a
                                href="https://www.letemps.ch/suisse/vaud/les-nuisances-de-l-aeroport-de-la-blecherette-considerees-comme-marginales"
                                target="_blank"
                                rel="noopener"
                            >
                                Les nuisances considérées comme marginales (Le
                                Temps, 2023)
                            </a>
                        </li>
                        <li>
                            <a
                                href="https://www.rts.ch/info/regions/vaud/12488474-a-lausanne-laeroport-de-la-blecherette-a-nouveau-sous-le-feu-des-critiques.html"
                                target="_blank"
                                rel="noopener"
                            >
                                L’aéroport à nouveau sous le feu des critiques
                                (RTS, 2021)
                            </a>
                        </li>
                        <li>
                            <a
                                href="https://www.letemps.ch/suisse/vaud/laeroport-blecherette-gagne-un-nouveau-combat-niveau-cantonal"
                                target="_blank"
                                rel="noopener"
                            >
                                La Blécherette gagne un nouveau combat cantonal
                                (Le Temps, 2022)
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </section>

    <footer>
        <div class="footer-content">
            <div class="footer-disclaimer">
                <p>
                    Initiative personnelle née de la pure curiosité, ce site a
                    été codé avec des compétences limitées en aéronautique et en
                    développement web, mais beaucoup de passion et de "vibe
                    coding" (propulsé par import antigravity & Gemini).
                </p>
                <p>
                    Le projet est actuellement en phase Bêta : merci d'avance
                    pour votre indulgence face aux inévitables bugs.
                </p>
                <p class="footer-cta">
                    Vous appréciez l'initiative ? ☕ <a
                        href="https://github.com/loz-airport/LSGL_tracker"
                        target="_blank">Contribuez au développement</a
                    > ou offrez-moi un café
                </p>
            </div>

            <div class="footer-credits">
                <small>
                    📷 Photo : <a
                        href="https://commons.wikimedia.org/wiki/File:Aerial_image_of_the_Lausanne-La_Bl%C3%A9cherette_airfield.jpg"
                        target="_blank"
                        rel="noopener">Carsten Steger, Wikimedia</a
                    >
                    · 📡 Données fournies par
                    <a
                        href="https://opensky-network.org"
                        target="_blank"
                        rel="noopener">OpenSky Network</a
                    >
                    · 💻 Code disponible en Open Source sur
                    <a
                        href="https://github.com/loz-airport/LSGL_tracker"
                        target="_blank"
                        rel="noopener">GitHub</a
                    >
                </small>
            </div>
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

    .mobile-menu-toggle {
        display: none;
        flex-direction: column;
        gap: 6px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        z-index: 1001;
    }

    .mobile-menu-toggle .bar {
        width: 24px;
        height: 2px;
        background: #fff;
        border-radius: 2px;
        transition: all 0.3s;
    }

    .mobile-menu-toggle .bar.open:nth-child(1) {
        transform: translateY(8px) rotate(45deg);
    }
    .mobile-menu-toggle .bar.open:nth-child(2) {
        opacity: 0;
    }
    .mobile-menu-toggle .bar.open:nth-child(3) {
        transform: translateY(-8px) rotate(-45deg);
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

    .hero-logo {
        height: 120px;
        width: auto;
        margin-bottom: 32px;
        filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.1));
    }

    .hero-title {
        margin-bottom: 24px;
    }

    .eyebrow {
        display: block;
        font-size: clamp(16px, 2.5vw, 22px);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 6px;
        color: #60a5fa;
        margin-bottom: 16px;
        font-family: "Outfit", sans-serif;
    }

    .main-title {
        display: block;
        font-size: clamp(32px, 6vw, 64px);
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -2px;
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

    .info-card p a {
        color: #60a5fa;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s;
    }

    .info-card p a:hover {
        color: #93c5fd;
        text-decoration: underline;
    }

    /* Dashboard Layout */
    .dashboard {
        display: flex;
        flex-direction: column;
        gap: 60px;
    }

    @media (max-width: 768px) {
        .dashboard {
            gap: 40px;
        }
    }

    .dashboard :global(.chart-container) {
        margin-bottom: 0; /* Override component margin */
    }

    .chart-section.map-full {
        height: auto;
        min-height: 700px;
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

    /* Resources Section */
    .resources-section {
        max-width: 1400px;
        margin: 0 auto 80px auto;
        padding: 60px;
        border-radius: 32px;
    }

    .resources-content h2 {
        font-family: "Outfit", sans-serif;
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 40px;
        letter-spacing: -0.5px;
        background: linear-gradient(135deg, #fff, #94a3b8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .resources-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 60px;
    }

    @media (max-width: 768px) {
        .resources-grid {
            gap: 40px;
        }
        .resources-section {
            padding: 40px 24px;
        }
    }

    .resource-group h3 {
        font-family: "Outfit", sans-serif;
        font-size: 18px;
        color: #60a5fa;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 24px;
        font-weight: 600;
    }

    .resource-list {
        list-style: none;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .resource-list li a {
        display: flex;
        flex-direction: column;
        text-decoration: none;
        transition: transform 0.2s;
    }

    .resource-list li a:hover {
        transform: translateX(8px);
    }

    .link-title {
        color: #fff;
        font-weight: 500;
        font-size: 16px;
        margin-bottom: 4px;
    }

    .link-url {
        color: rgba(255, 255, 255, 0.4);
        font-size: 13px;
        font-family: "Outfit", sans-serif;
    }

    .press-list li a {
        color: rgba(255, 255, 255, 0.8);
        font-size: 15px;
        line-height: 1.5;
        border-left: 2px solid rgba(255, 255, 255, 0.1);
        padding-left: 16px;
    }

    .press-list li a:hover {
        color: #fff;
        border-color: #60a5fa;
    }

    /* Footer */
    footer {
        padding: 80px 32px 60px;
        text-align: center;
        max-width: 800px;
        margin: 0 auto;
    }

    .footer-disclaimer p {
        color: rgba(255, 255, 255, 0.5);
        font-size: 15px;
        line-height: 1.6;
        margin-bottom: 16px;
    }

    .footer-cta {
        margin-top: 24px;
        font-weight: 500;
        color: #fff !important;
    }

    .footer-credits {
        margin-top: 48px;
        padding-top: 24px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .footer-credits small {
        color: rgba(255, 255, 255, 0.3);
        font-size: 12px;
        display: block;
        line-height: 2;
    }

    footer a {
        color: #60a5fa;
        text-decoration: underline;
        text-underline-offset: 4px;
        text-decoration-thickness: 1px;
        transition: all 0.2s;
    }

    footer a:hover {
        color: #93c5fd;
        text-decoration-thickness: 2px;
    }

    @media (max-width: 768px) {
        .nav-floating {
            padding: 12px 16px;
            width: calc(100% - 32px);
        }
        .mobile-menu-toggle {
            display: flex;
        }
        .nav-links {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: 280px;
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(20px);
            display: flex;
            flex-direction: column;
            padding: 100px 40px;
            gap: 32px;
            transform: translateX(100%);
            transition: transform 0.3s ease-in-out;
            z-index: 1000;
            border-left: 1px solid rgba(255, 255, 255, 0.1);
        }
        .nav-links.open {
            transform: translateX(0);
        }
        .nav-links a {
            font-size: 20px;
            font-weight: 600;
        }
        .mobile-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            z-index: 999;
        }
        .nav-logo {
            font-size: 16px;
        }
        .hero-logo {
            height: 80px;
            margin-bottom: 24px;
        }
        .hero-title {
            margin-bottom: 16px;
        }
        .eyebrow {
            font-size: 14px;
            letter-spacing: 4px;
        }
        .main-title {
            font-size: 32px;
        }
        .hero-tagline {
            font-size: 16px;
            margin-bottom: 32px;
            padding: 0 20px;
        }
        main {
            padding: 0 16px 60px;
        }
        .info-section {
            padding: 40px 20px;
            margin-bottom: 40px;
        }
        .info-content h2 {
            font-size: 28px;
            margin-bottom: 24px;
        }
        .info-grid {
            gap: 16px;
        }
        .resources-section {
            padding: 32px 20px;
            margin-bottom: 40px;
        }
        .resources-content h2 {
            font-size: 24px;
            margin-bottom: 32px;
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
