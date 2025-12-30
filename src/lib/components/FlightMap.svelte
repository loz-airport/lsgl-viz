<script>
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";

    let {
        arrivalStateVectors = [],
        departureStateVectors = [],
        dateRangeDays = 7,
        dateRangeStart = null,
        dateRangeEnd = null,
    } = $props();

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
        // React to changes in state vectors and date range
        if (map && (arrivalStateVectors.length > 0 || departureStateVectors.length > 0 || dateRangeDays !== undefined || dateRangeStart !== null || dateRangeEnd !== null)) {
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

        // Calculate date range
        let startDate, endDate;
        if (dateRangeStart && dateRangeEnd) {
            // Use provided date range
            startDate = new Date(dateRangeStart);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(dateRangeEnd);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Use number of days
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            startDate = new Date();
            startDate.setDate(startDate.getDate() - dateRangeDays);
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

        // Function to draw multi-segment colored paths based on altitude
        const drawPath = (pathPoints, baseColor) => {
            if (pathPoints.length < 2) return;

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
                const weight = Math.max(0.5, 5 - logAlt);
                const opacity = Math.max(0.1, 1 - logAlt / 5);

                const polyline = L.polyline(
                    [
                        [p1.latitude, p1.longitude],
                        [p2.latitude, p2.longitude],
                    ],
                    {
                        color: baseColor,
                        weight: weight * 1.5,
                        opacity: opacity,
                        smoothFactor: 1,
                    },
                ).addTo(map);

                pathLayers.push(polyline);
            }
        };

        // Draw arrival paths (blue)
        Object.values(arrivalPaths).forEach((points) =>
            drawPath(points, "#60a5fa"),
        );

        // Draw departure paths (orange)
        Object.values(departurePaths).forEach((points) =>
            drawPath(points, "#fb923c"),
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
        margin-bottom: 16px;
    }

    h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #fff;
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
