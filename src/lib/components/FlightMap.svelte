<script>
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";

    import { flightStore } from "$lib/stores/flightData.svelte.js";

    let {
        arrivalStateVectors = [],
        departureStateVectors = [],
    } = $props();

    let selectedDateRange = $state("7");

    // Generate date range options
    const dateRangeOptions = [
        { value: "3", label: "3 derniers jours" },
        { value: "7", label: "7 derniers jours" },
    ];

    // Add 7-day ranges up to 30 days (non-overlapping)
    // Week 1: days 7-13 ago, Week 2: days 14-20 ago, Week 3: days 21-27 ago, Week 4: days 28-30 ago
    for (let week = 1; week <= 4; week++) {
        const daysAgoStart = week * 7; // Newest day in the range (e.g., 7 days ago for week 1)
        const daysAgoEnd = Math.min(daysAgoStart + 6, 30); // Oldest day in the range (e.g., 13 days ago for week 1)
        
        // startDate is the oldest date (furthest in the past)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgoEnd);
        startDate.setHours(0, 0, 0, 0);
        
        // endDate is the newest date (closest to today)
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - daysAgoStart);
        endDate.setHours(23, 59, 59, 999);
        
        // Only add if the range is valid (at least 1 day)
        if (daysAgoEnd >= daysAgoStart) {
            dateRangeOptions.push({
                value: `week-${week}`,
                label: `7 derniers jours (semaine ${week})`,
                startDate,
                endDate
            });
        }
    }

    function handleDateRangeChange() {
        const option = dateRangeOptions.find(opt => opt.value === selectedDateRange);
        if (!option) return;

        if (option.startDate && option.endDate) {
            // Date range (week)
            flightStore.setDateRange(null, option.startDate, option.endDate);
        } else {
            // Number of days
            const days = parseInt(option.value);
            flightStore.setDateRange(days, null, null);
        }
    }

    $effect(() => {
        handleDateRangeChange();
    });

    /** @type {HTMLDivElement} */
    let mapContainer = $state();
    /** @type {any} */
    let map;
    /** @type {Array<any>} */
    let pathLayers = [];

    // LSGL coordinates
    const LSGL_LAT = 46.545;
    const LSGL_LON = 6.617;

    $effect(() => {
        // React to changes in state vectors and date range from store
        if (map && (arrivalStateVectors.length > 0 || departureStateVectors.length > 0 || flightStore.dateRangeDays !== undefined || flightStore.dateRangeStart !== null || flightStore.dateRangeEnd !== null)) {
            updateFlightPaths();
        }
    });

    function initMap() {
        if (!browser || !mapContainer) return;

        try {
            if (map) {
                map.remove();
            }

            map = L.map(mapContainer, {
                center: [LSGL_LAT, LSGL_LON],
                zoom: 9,
                zoomControl: true,
            });

            // Dark mode tile layer
            L.tileLayer(
                "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
                {
                    attribution:
                        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: "abcd",
                    maxZoom: 20,
                },
            ).addTo(map);

            // Add airport marker
            const airportIcon = L.divIcon({
                className: "airport-marker",
                html: '<div class="pulse">✈</div>',
                iconSize: [30, 30],
            });

            L.marker([LSGL_LAT, LSGL_LON], { icon: airportIcon })
                .addTo(map)
                .bindPopup("<strong>LSGL</strong><br>Lausanne-Blécherette");
        } catch (e) {
            console.error("Leaflet initialization failed:", e);
        }
    }

    function updateFlightPaths() {
        if (!map) {
            console.log("FlightMap: Map not initialized yet");
            return;
        }

        const arrivalsRaw = $state.snapshot(arrivalStateVectors) || [];
        const departuresRaw = $state.snapshot(departureStateVectors) || [];

        console.log(`FlightMap: Updating paths with ${arrivalsRaw.length} arrivals and ${departuresRaw.length} departures`);

        // Don't return early - we still want to show the map even if there's no data

        // Clear existing paths
        pathLayers.forEach((layer) => map.removeLayer(layer));
        pathLayers = [];

        // Calculate date range from store
        let startDate, endDate;
        if (flightStore.dateRangeStart && flightStore.dateRangeEnd) {
            // Use provided date range
            startDate = new Date(flightStore.dateRangeStart);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(flightStore.dateRangeEnd);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Use number of days
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            startDate = new Date();
            startDate.setDate(startDate.getDate() - flightStore.dateRangeDays);
            startDate.setHours(0, 0, 0, 0);
        }

        // Filter state vectors by date range
        const filteredArrivals = arrivalsRaw.filter((sv) => {
            if (!sv.arrival_date || !(sv.arrival_date instanceof Date) || isNaN(sv.arrival_date.getTime())) {
                return false;
            }
            try {
                const date = sv.arrival_date;
                return (
                    date >= startDate &&
                    date <= endDate &&
                    sv.latitude != null &&
                    sv.longitude != null &&
                    !isNaN(sv.latitude) &&
                    !isNaN(sv.longitude)
                );
            } catch (e) {
                return false;
            }
        });

        const filteredDepartures = departuresRaw.filter((sv) => {
            if (!sv.departure_date || !(sv.departure_date instanceof Date) || isNaN(sv.departure_date.getTime())) {
                return false;
            }
            try {
                const date = sv.departure_date;
                return (
                    date >= startDate &&
                    date <= endDate &&
                    sv.latitude != null &&
                    sv.longitude != null &&
                    !isNaN(sv.latitude) &&
                    !isNaN(sv.longitude)
                );
            } catch (e) {
                return false;
            }
        });

        // Group by flight ID
        const arrivalPaths = groupByFlightId(filteredArrivals);
        const departurePaths = groupByFlightId(filteredDepartures);

        // Helper to get flight info and metadata for a flight ID
        const getFlightInfo = (flightId, isArrival) => {
            const flights = isArrival ? flightStore.arrivalsData : flightStore.departuresData;
            const flight = flights.find(f => f.id === flightId || f.ICAO24 === flightId);
            if (!flight) return null;

            // Find metadata - CSV uses ICAO24 (uppercase)
            const flightIcao = flight.ICAO24 ? String(flight.ICAO24).toLowerCase() : null;
            const metadata = flightStore.aircraftMetadata.find(m => {
                // Check both uppercase and lowercase versions
                const metaIcao = (m.ICAO24 || m.icao24) ? String(m.ICAO24 || m.icao24).toLowerCase() : null;
                return metaIcao && flightIcao && metaIcao === flightIcao;
            });

            return { flight, metadata: metadata || null };
        };

        // Helper function to check if a value is valid (not NA, null, undefined, or empty)
        const isValidValue = (value) => {
            return value && value !== 'NA' && value !== 'null' && String(value).trim() !== '';
        };

        // Function to create popup content
        const createPopupContent = (flightInfo, isArrival) => {
            if (!flightInfo) return "Informations non disponibles";
            
            const { flight, metadata } = flightInfo;
            let html = `<div style="min-width: 200px;">`;
            
            // Flight type and callsign
            html += `<div style="font-weight: bold; margin-bottom: 8px; color: ${isArrival ? '#3b82f6' : '#f97316'};">`;
            html += `${isArrival ? 'ARRIVÉE' : 'DÉPART'}`;
            if (isValidValue(flight.call_sign)) {
                html += ` - ${flight.call_sign}`;
            }
            html += `</div>`;
            
            // ICAO24
            if (isValidValue(flight.ICAO24)) {
                html += `<div style="font-size: 12px; color: #888; margin-bottom: 8px;">ICAO24: ${flight.ICAO24}</div>`;
            }
            
            // Airports and times
            const origin = flight.origin || flight.departure_airport || flight.estDepartureAirport;
            const destination = flight.destination || flight.arrival_airport || flight.estArrivalAirport;
            
            if (isArrival) {
                if (isValidValue(origin)) {
                    html += `<div style="margin-bottom: 4px;"><strong>Aéroport de départ:</strong> ${origin}</div>`;
                }
                if (flight.departure_time) {
                    html += `<div style="margin-bottom: 4px; font-size: 12px;">Heure départ: ${flight.departure_time.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}</div>`;
                }
                if (flight.arrival_time) {
                    html += `<div style="margin-bottom: 4px; font-size: 12px;">Heure arrivée: ${flight.arrival_time.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}</div>`;
                }
                if (flight.arrival_time && flight.departure_time) {
                    const duration = Math.round((flight.arrival_time - flight.departure_time) / 60000);
                    if (duration > 0) {
                        const hours = Math.floor(duration / 60);
                        const minutes = duration % 60;
                        const durationStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
                        html += `<div style="margin-bottom: 4px;"><strong>Temps de vol:</strong> ${durationStr}</div>`;
                    }
                }
            } else {
                if (isValidValue(destination)) {
                    html += `<div style="margin-bottom: 4px;"><strong>Aéroport d'arrivée:</strong> ${destination}</div>`;
                }
                if (flight.departure_time) {
                    html += `<div style="margin-bottom: 4px; font-size: 12px;">Heure départ: ${flight.departure_time.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}</div>`;
                }
                if (flight.arrival_time) {
                    html += `<div style="margin-bottom: 4px; font-size: 12px;">Heure arrivée: ${flight.arrival_time.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}</div>`;
                }
                if (flight.arrival_time && flight.departure_time) {
                    const duration = Math.round((flight.arrival_time - flight.departure_time) / 60000);
                    if (duration > 0) {
                        const hours = Math.floor(duration / 60);
                        const minutes = duration % 60;
                        const durationStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
                        html += `<div style="margin-bottom: 4px;"><strong>Temps de vol:</strong> ${durationStr}</div>`;
                    }
                }
            }
            
            // Metadata
            if (metadata) {
                html += `<div style="border-top: 1px solid #333; margin-top: 8px; padding-top: 8px;">`;
                if (isValidValue(metadata.model)) {
                    html += `<div style="margin-bottom: 4px;"><strong>Modèle:</strong> ${metadata.model}</div>`;
                }
                if (isValidValue(metadata.origin_country)) {
                    html += `<div style="margin-bottom: 4px;"><strong>Pays d'immatriculation:</strong> ${metadata.origin_country}</div>`;
                }
                if (isValidValue(metadata.photo_url)) {
                    html += `<div style="margin-top: 8px;"><img src="${metadata.photo_url}" alt="Aircraft" style="max-width: 100%; border-radius: 4px;" onerror="this.style.display='none';" /></div>`;
                }
                html += `</div>`;
            }
            
            html += `</div>`;
            return html;
        };

        // Function to draw multi-segment colored paths based on altitude
        const drawPath = (pathPoints, baseColor, flightId, isArrival) => {
            if (pathPoints.length < 2) return;

            const flightInfo = getFlightInfo(flightId, isArrival);
            const popupContent = createPopupContent(flightInfo, isArrival);
            
            // Create a feature group for this path to attach popup
            const pathSegments = [];

            // Draw as multiple segments to have varying width/opacity per altitude
            for (let i = 0; i < pathPoints.length - 1; i++) {
                const p1 = pathPoints[i];
                const p2 = pathPoints[i + 1];

                // Use log altitude (clamped) to determine width/opacity
                // Standard cruise at 30k ft -> 10k meters
                // Alt is in meters
                const avgAlt = Math.max(
                    1,
                    ((p1.altitude || 0) + (p2.altitude || 0)) / 2,
                );
                const logAlt = Math.log10(avgAlt);

                // High altitude = thinner line (Inverse related)
                // logAlt range approx 0 (ground) to 4 (10,000m)
                // Reduced base weight for thinner lines
                const weight = Math.max(0.3, 3 - logAlt * 0.6);
                const opacity = Math.max(0.2, 1 - logAlt / 5);

                const polyline = L.polyline(
                    [
                        [p1.latitude, p1.longitude],
                        [p2.latitude, p2.longitude],
                    ],
                    {
                        color: baseColor,
                        weight: weight,
                        opacity: opacity,
                        smoothFactor: 1,
                    },
                ).addTo(map);

                pathSegments.push(polyline);
                pathLayers.push(polyline);
            }
            
            // Attach popup to the first segment (or create a group)
            if (pathSegments.length > 0 && flightInfo) {
                const group = L.featureGroup(pathSegments);
                group.bindPopup(popupContent, { maxWidth: 300 });
            }
        };

        // Draw arrival paths (blue)
        Object.entries(arrivalPaths).forEach(([flightId, points]) =>
            drawPath(points, "#60a5fa", flightId, true),
        );

        // Draw departure paths (orange)
        Object.entries(departurePaths).forEach(([flightId, points]) =>
            drawPath(points, "#fb923c", flightId, false),
        );

        // Fit map bounds to paths if any exist
        if (pathLayers.length > 0) {
            try {
                const group = new L.featureGroup(pathLayers);
                const bounds = group.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds.pad(0.1));
                    console.log(`FlightMap: Displaying ${pathLayers.length} path segments`);
                } else {
                    // Fallback if bounds are invalid
                    if (map && mapContainer && mapContainer.offsetParent !== null) {
                        map.setView([LSGL_LAT, LSGL_LON], 11);
                    }
                }
            } catch (e) {
                console.error("FlightMap: Error fitting bounds:", e);
                // Only set view if map is ready
                if (map && mapContainer && mapContainer.offsetParent !== null) {
                    try {
                        map.setView([LSGL_LAT, LSGL_LON], 11);
                    } catch (viewError) {
                        console.error("FlightMap: Error setting view:", viewError);
                    }
                }
            }
        } else {
            // Center on airport if no paths - only if map is ready
            if (map && mapContainer && mapContainer.offsetParent !== null) {
                try {
                    map.setView([LSGL_LAT, LSGL_LON], 11);
                    console.log("FlightMap: No paths to display, centering on airport");
                } catch (e) {
                    console.error("FlightMap: Error setting view:", e);
                }
            }
        }
    }

    /**
     * @param {Array<any>} stateVectors
     */
    function groupByFlightId(stateVectors) {
        /** @type {Record<string, Array<any>>} */
        const grouped = {};
        stateVectors.forEach((sv) => {
            if (!grouped[sv.id]) {
                grouped[sv.id] = [];
            }
            grouped[sv.id].push(sv);
        });

        // Sort each group by time
        Object.keys(grouped).forEach((id) => {
            grouped[id].sort((a, b) => {
                const timeA = a.requested_time instanceof Date ? a.requested_time.getTime() : (a.requested_time || 0);
                const timeB = b.requested_time instanceof Date ? b.requested_time.getTime() : (b.requested_time || 0);
                return timeA - timeB;
            });
        });

        return grouped;
    }

    onMount(() => {
        // Wait for map container to be in DOM before initializing
        const init = () => {
            if (mapContainer && !map) {
                initMap();
                // Update paths after map is fully initialized
                setTimeout(() => {
                    if (map && mapContainer) {
                        // Use invalidateSize to ensure map is ready
                        try {
                            map.invalidateSize();
                            updateFlightPaths();
                        } catch (e) {
                            console.error("FlightMap: Error during initialization:", e);
                        }
                    }
                }, 300);
            }
        };
        
        // Try immediately, then with a small delay if needed
        if (mapContainer) {
            init();
        } else {
            setTimeout(init, 100);
        }
    });

    onDestroy(() => {
        if (map) {
            map.remove();
        }
    });

</script>

<div class="map-container">
    <div class="map-header">
        <h2>Trajectoires des vols</h2>
        <div class="controls">
            <label class="date-selector-label">
                Période:
                <select bind:value={selectedDateRange} class="date-selector">
                    {#each dateRangeOptions as option}
                        <option value={option.value}>{option.label}</option>
                    {/each}
                </select>
            </label>
        </div>
    </div>
    <div class="legend">
        <span class="legend-item"
            ><span class="color-box arrival"></span> Arrivées</span
        >
        <span class="legend-item"
            ><span class="color-box departure"></span> Départs</span
        >
        <span class="legend-item opacity-info">
            <span class="opacity-box"></span>
            <span>Lignes fines = Haute altitude</span>
        </span>
    </div>
    <div bind:this={mapContainer} class="map"></div>
</div>

<style>
    .map-container {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 24px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .map-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 16px;
    }

    h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #fff;
    }

    .controls {
        display: flex;
        gap: 12px;
        align-items: center;
    }

    .date-selector-label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-weight: 500;
    }

    .date-selector {
        background: rgba(59, 130, 246, 0.2);
        color: #60a5fa;
        padding: 6px 16px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        border: 1px solid rgba(59, 130, 246, 0.3);
        cursor: pointer;
        transition: background 0.2s, border-color 0.2s;
    }

    .date-selector:hover {
        background: rgba(59, 130, 246, 0.3);
        border-color: rgba(59, 130, 246, 0.5);
    }

    .date-selector:focus {
        outline: none;
        border-color: rgba(59, 130, 246, 0.6);
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    .legend {
        display: flex;
        gap: 20px;
        margin-bottom: 12px;
        font-size: 14px;
        flex-wrap: wrap;
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.9);
    }

    .color-box {
        width: 30px;
        height: 3px;
        border-radius: 2px;
    }

    .color-box.arrival {
        background: #3b82f6;
    }

    .color-box.departure {
        background: #f97316;
    }

    .opacity-box {
        width: 30px;
        height: 1px;
        background: white;
        opacity: 0.5;
    }

    .map {
        width: 100%;
        height: 600px;
        border-radius: 8px;
        overflow: hidden;
    }

    :global(.airport-marker) {
        background: none;
        border: none;
    }

    :global(.pulse) {
        font-size: 24px;
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.2);
            opacity: 0.8;
        }
    }
</style>
