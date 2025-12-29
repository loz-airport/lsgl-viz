    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";

    let {
        arrivalStateVectors = [],
        departureStateVectors = [],
        selectedDay = 0,
    } = $props();

    /** @type {HTMLDivElement} */
    let mapContainer = $state();
    /** @type {any} */
    let map; // No need for $state if not used in template
    /** @type {Array<any>} */
    let pathLayers = [];

    // LSGL coordinates
    const LSGL_LAT = 46.545;
    const LSGL_LON = 6.617;

    $effect(() => {
        console.log("FlightMap effect triggered", {
            hasMap: !!map,
            svLength: arrivalStateVectors.length,
        });
        if (map) {
            updateFlightPaths();
        }
    });

    function initMap() {
        if (!browser || !mapContainer) return;
        console.log("Initializing map on container with size:", mapContainer.offsetWidth, "x", mapContainer.offsetHeight);
        
        try {
            if (map) {
                map.remove();
            }

            map = L.map(mapContainer, {
                center: [LSGL_LAT, LSGL_LON],
                zoom: 9,
                zoomControl: true,
            });

            console.log("Map instance created");

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
        } catch (e) {
            console.error("Leaflet initialization failed:", e);
        }
    }

    function updateFlightPaths() {
        if (!map || !arrivalStateVectors.length) return;

        // Clear existing paths
        pathLayers.forEach((layer) => map.removeLayer(layer));
        pathLayers = [];

        // Calculate target date string
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - selectedDay);
        const targetDateStr = targetDate.toISOString().split("T")[0];

        // Filter state vectors by selected date
        const filteredArrivals = arrivalStateVectors.filter((sv) => {
            if (!sv.arrival_date) return false;
            const dateStr = sv.arrival_date.toISOString().split("T")[0];
            return (
                dateStr === targetDateStr &&
                sv.latitude != null &&
                sv.longitude != null
            );
        });

        const filteredDepartures = departureStateVectors.filter((sv) => {
            if (!sv.departure_date) return false;
            const dateStr = sv.departure_date.toISOString().split("T")[0];
            return (
                dateStr === targetDateStr &&
                sv.latitude != null &&
                sv.longitude != null
            );
        });

        // Group by flight ID
        const arrivalPaths = groupByFlightId(filteredArrivals);
        const departurePaths = groupByFlightId(filteredDepartures);

        // Draw arrival paths (blue)
        Object.entries(arrivalPaths).forEach(([id, points]) => {
            if (points.length < 2) return;

            const latlngs = points.map((p) => [p.latitude, p.longitude]);
            const polyline = L.polyline(latlngs, {
                color: "#60a5fa", // Brighter blue
                weight: 3,
                opacity: 0.8,
                smoothFactor: 1,
            }).addTo(map);

            polyline.bindPopup(
                `<strong>Arrivée</strong><br>ICAO: ${points[0].ICAO24}<br>Points: ${points.length}`,
            );
            pathLayers.push(polyline);
        });

        // Draw departure paths (orange)
        Object.entries(departurePaths).forEach(([id, points]) => {
            if (points.length < 2) return;

            const latlngs = points.map((p) => [p.latitude, p.longitude]);
            const polyline = L.polyline(latlngs, {
                color: "#fb923c", // Brighter orange
                weight: 3,
                opacity: 0.8,
                smoothFactor: 1,
            }).addTo(map);

            polyline.bindPopup(
                `<strong>Départ</strong><br>ICAO: ${points[0].ICAO24}<br>Points: ${points.length}`,
            );
            pathLayers.push(polyline);
        });

        // Fit map bounds to paths if any exist
        if (pathLayers.length > 0) {
            const group = new L.featureGroup(pathLayers);
            map.fitBounds(group.getBounds().pad(0.1));
        } else {
            // Center on airport if no paths
            map.setView([LSGL_LAT, LSGL_LON], 11);
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
            grouped[id].sort(
                (a, b) => (a.requested_time || 0) - (b.requested_time || 0),
            );
        });

        return grouped;
    }

    onMount(() => {
        console.log("FlightMap mounted", { hasContainer: !!mapContainer });
        initMap();
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
            <label>
                Journée:
                <select bind:value={selectedDay}>
                    <option value={0}>Aujourd'hui</option>
                    <option value={1}>Hier</option>
                    <option value={2}>Il y a 2 jours</option>
                    <option value={3}>Il y a 3 jours</option>
                    <option value={4}>Il y a 4 jours</option>
                    <option value={5}>Il y a 5 jours</option>
                    <option value={6}>Il y a 6 jours</option>
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

    label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
    }

    select {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
    }

    select:hover {
        background: rgba(255, 255, 255, 0.15);
    }

    .legend {
        display: flex;
        gap: 20px;
        margin-bottom: 12px;
        font-size: 14px;
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
