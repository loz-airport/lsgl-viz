<script>
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";

    import { flightStore } from "$lib/stores/flightData.svelte.js";

    let { arrivalStateVectors = [], departureStateVectors = [] } = $props();

    let selectedDateRange = $state("7");
    let mapDateRangeDays = $state(7);
    let mapDateRangeStart = $state(null);
    let mapDateRangeEnd = $state(null);
    let isAnimating = $state(false);
    let animationInterval = $state(null);
    let currentFlightIndex = $state(0);
    let animatedFlights = $state([]);
    let flightInfoPanel = $state(null);

    // Helper to check for valid values (not null, undefined, "NA", etc.)
    function isValidValue(val) {
        return val !== null && val !== undefined && val !== "" && val !== "NA";
    }

    // Helper to format date range
    function formatDateRange(startDate, endDate) {
        const start = new Intl.DateTimeFormat("fr-CH", {
            day: "numeric",
            month: "short",
        }).format(startDate);
        const end = new Intl.DateTimeFormat("fr-CH", {
            day: "numeric",
            month: "short",
        }).format(endDate);
        return `${start} - ${end}`;
    }

    // Generate date range options - reactive
    function getDateRangeOptions() {
        const options = [];
        const today = new Date();

        // 3 derniers jours
        const threeDaysAgo = new Date(today);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 2);
        options.push({
            value: "3",
            label: `3 derniers jours (${formatDateRange(threeDaysAgo, today)})`,
            days: 3,
        });

        // 7 derniers jours
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        options.push({
            value: "7",
            label: `7 derniers jours (${formatDateRange(sevenDaysAgo, today)})`,
            days: 7,
        });

        // Add 7-day ranges up to 30 days (non-overlapping)
        for (let week = 1; week <= 4; week++) {
            const daysAgoStart = week * 7;
            const daysAgoEnd = Math.min(daysAgoStart + 6, 30);

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysAgoEnd);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date();
            endDate.setDate(endDate.getDate() - daysAgoStart);
            endDate.setHours(23, 59, 59, 999);

            if (daysAgoEnd >= daysAgoStart) {
                options.push({
                    value: `week-${week}`,
                    label: formatDateRange(startDate, endDate),
                    startDate,
                    endDate,
                });
            }
        }
        return options;
    }

    const dateRangeOptions = $derived(getDateRangeOptions());

    function handleDateRangeChange() {
        console.log("Date range changed:", selectedDateRange);
        const option = dateRangeOptions.find(
            (opt) => opt.value === selectedDateRange,
        );
        if (!option) return;

        // Stop animation when changing range
        stopAnimation();

        if (option.startDate && option.endDate) {
            // Date range (week)
            mapDateRangeDays = null;
            mapDateRangeStart = option.startDate;
            mapDateRangeEnd = option.endDate;
        } else {
            // Number of days
            mapDateRangeDays = option.days || 7;
            mapDateRangeStart = null;
            mapDateRangeEnd = null;
        }
    }

    // Consolidate effects to handle initialization and updates correctly
    $effect(() => {
        // Track all dependencies for map update
        const currentData = {
            arrivals: arrivalStateVectors,
            departures: departureStateVectors,
            range: selectedDateRange,
            options: dateRangeOptions,
        };

        if (!map) return;

        // Find selected range details synchronously
        const option = currentData.options.find(
            (opt) => opt.value === currentData.range,
        );
        if (option) {
            // Stop animation immediately when range changes
            stopAnimation();

            // Update internal range state
            if (option.startDate && option.endDate) {
                mapDateRangeDays = null;
                mapDateRangeStart = option.startDate;
                mapDateRangeEnd = option.endDate;
            } else {
                mapDateRangeDays = option.days || 7;
                mapDateRangeStart = null;
                mapDateRangeEnd = null;
            }

            // Schedule update
            clearTimeout(map._updateTimeout);
            map._updateTimeout = setTimeout(() => {
                updateFlightPaths();
            }, 100);
        }
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
        if (
            map &&
            (arrivalStateVectors.length > 0 || departureStateVectors.length > 0)
        ) {
            clearTimeout(map._updateTimeout);
            map._updateTimeout = setTimeout(() => {
                updateFlightPaths();
            }, 200);
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

        // Use local props directly instead of snapshotting for better performance in loops
        const arrivalsRaw = arrivalStateVectors || [];
        const departuresRaw = departureStateVectors || [];

        console.log(
            `FlightMap: Updating paths with ${arrivalsRaw.length} arrivals and ${departuresRaw.length} departures`,
        );

        // Clear existing paths
        pathLayers.forEach((layer) => map?.removeLayer(layer));
        pathLayers = [];

        // Calculate date range carefully
        let startDate, endDate;
        if (mapDateRangeStart && mapDateRangeEnd) {
            startDate = new Date(mapDateRangeStart);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(mapDateRangeEnd);
            endDate.setHours(23, 59, 59, 999);
        } else {
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            startDate = new Date();
            startDate.setDate(startDate.getDate() - (mapDateRangeDays || 7));
            startDate.setHours(0, 0, 0, 0);
        }

        console.log(
            `FlightMap: Filtering from ${startDate.toISOString()} to ${endDate.toISOString()}`,
        );

        // Filter state vectors by date range
        const filteredArrivals = arrivalsRaw.filter((sv) => {
            const dateStr = sv.arrival_date || sv.arrival_time;
            if (!dateStr) return false;

            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return false;

            return (
                date >= startDate &&
                date <= endDate &&
                sv.latitude != null &&
                sv.longitude != null &&
                !isNaN(sv.latitude) &&
                !isNaN(sv.longitude)
            );
        });

        const filteredDepartures = departuresRaw.filter((sv) => {
            const dateStr = sv.departure_date || sv.departure_time;
            if (!dateStr) return false;

            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return false;

            return (
                date >= startDate &&
                date <= endDate &&
                sv.latitude != null &&
                sv.longitude != null &&
                !isNaN(sv.latitude) &&
                !isNaN(sv.longitude)
            );
        });

        // Group by flight ID and limit points per flight for performance
        const arrivalPaths = groupByFlightId(filteredArrivals);
        const departurePaths = groupByFlightId(filteredDepartures);

        // Limit the number of points per flight path for performance
        const maxPointsPerFlight = 20;
        Object.keys(arrivalPaths).forEach((flightId) => {
            if (arrivalPaths[flightId].length > maxPointsPerFlight) {
                // Keep first and last points, and sample intermediate points
                const points = arrivalPaths[flightId];
                const sampled = [points[0]]; // First point
                const step = Math.floor(
                    (points.length - 2) / (maxPointsPerFlight - 2),
                );
                for (let i = 1; i < points.length - 1; i += step) {
                    if (sampled.length < maxPointsPerFlight - 1) {
                        sampled.push(points[i]);
                    }
                }
                sampled.push(points[points.length - 1]); // Last point
                arrivalPaths[flightId] = sampled;
            }
        });

        Object.keys(departurePaths).forEach((flightId) => {
            if (departurePaths[flightId].length > maxPointsPerFlight) {
                const points = departurePaths[flightId];
                const sampled = [points[0]];
                const step = Math.floor(
                    (points.length - 2) / (maxPointsPerFlight - 2),
                );
                for (let i = 1; i < points.length - 1; i += step) {
                    if (sampled.length < maxPointsPerFlight - 1) {
                        sampled.push(points[i]);
                    }
                }
                sampled.push(points[points.length - 1]);
                departurePaths[flightId] = sampled;
            }
        });

        // Helper to get flight info and metadata for a flight ID
        const getFlightInfo = (flightId, isArrival) => {
            const flights = isArrival
                ? flightStore.arrivalsData
                : flightStore.departuresData;
            const flight = flights.find(
                (f) => f.id === flightId || f.ICAO24 === flightId,
            );
            if (!flight) return null;

            // Find metadata - CSV uses ICAO24 (uppercase)
            const flightIcao = flight.ICAO24
                ? String(flight.ICAO24).toLowerCase()
                : null;
            const metadata = flightStore.aircraftMetadata.find((m) => {
                // Check both uppercase and lowercase versions
                const metaIcao =
                    m.ICAO24 || m.icao24
                        ? String(m.ICAO24 || m.icao24).toLowerCase()
                        : null;
                return metaIcao && flightIcao && metaIcao === flightIcao;
            });

            return { flight, metadata: metadata || null };
        };

        // Helper function to check if a value is valid (not NA, null, undefined, or empty)
        const isValidValue = (value) => {
            return (
                value &&
                value !== "NA" &&
                value !== "null" &&
                String(value).trim() !== ""
            );
        };

        // Function to create popup content
        const createPopupContent = (flightInfo, isArrival) => {
            if (!flightInfo) return "Informations non disponibles";

            const { flight, metadata } = flightInfo;
            let html = `<div style="min-width: 200px;">`;

            // Flight type and callsign
            html += `<div style="font-weight: bold; margin-bottom: 8px; color: ${isArrival ? "#3b82f6" : "#f97316"};">`;
            html += `${isArrival ? "ATTERRISSAGE" : "DÉCOLLAGE"}`;
            if (isValidValue(flight.call_sign)) {
                html += ` - ${flight.call_sign}`;
            }
            html += `</div>`;

            // ICAO24
            if (isValidValue(flight.ICAO24)) {
                html += `<div style="font-size: 12px; color: #888; margin-bottom: 8px;">ICAO24: ${flight.ICAO24}</div>`;
            }

            // Airports using metadata from store
            const originCode = flight.departure_airport_ICAO;
            const destCode = flight.destination_airport_ICAO;

            const originInfo = flightStore.getAirportInfo(originCode);
            const destInfo = flightStore.getAirportInfo(destCode);

            if (isArrival) {
                if (
                    isValidValue(originCode) &&
                    originCode !== "LSGL" &&
                    originCode !== "NA"
                ) {
                    const name =
                        originInfo?.name && originInfo.name !== "NA"
                            ? `${originInfo.name} (${originCode})`
                            : originCode;
                    html += `<div style="margin-bottom: 4px;"><strong>Provenance:</strong> ${name}</div>`;
                    if (originInfo?.country && originInfo.country !== "NA") {
                        html += `<div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">${originInfo.country}</div>`;
                    }
                } else {
                    html += `<div style="margin-bottom: 4px;"><strong>Provenance:</strong> Local (LSGL)</div>`;
                }
            } else {
                if (
                    isValidValue(destCode) &&
                    destCode !== "LSGL" &&
                    destCode !== "NA"
                ) {
                    const name =
                        destInfo?.name && destInfo.name !== "NA"
                            ? `${destInfo.name} (${destCode})`
                            : destCode;
                    html += `<div style="margin-bottom: 4px;"><strong>Destination:</strong> ${name}</div>`;
                    if (destInfo?.country && destInfo.country !== "NA") {
                        html += `<div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">${destInfo.country}</div>`;
                    }
                } else {
                    html += `<div style="margin-bottom: 4px;"><strong>Destination:</strong> Local (LSGL)</div>`;
                }
            }

            if (flight.arrival_time && flight.departure_time) {
                const duration = Math.round(
                    (flight.arrival_time - flight.departure_time) / 60000,
                );
                if (duration > 0) {
                    const hours = Math.floor(duration / 60);
                    const minutes = duration % 60;
                    const durationStr =
                        hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
                    html += `<div style="margin-bottom: 4px;"><strong>Temps de vol:</strong> ${durationStr}</div>`;
                }
            }

            // Metadata
            if (metadata) {
                html += `<div style="border-top: 1px solid #333; margin-top: 8px; padding-top: 8px;">`;
                if (isValidValue(metadata.model)) {
                    html += `<div style="margin-bottom: 4px;"><strong>Modèle:</strong> ${metadata.model}</div>`;
                }
                if (isValidValue(metadata.origin_country)) {
                    html += `<div style="margin-bottom: 4px;"><strong>Pays:</strong> ${metadata.origin_country}</div>`;
                }
                if (
                    isValidValue(metadata.photo_url) &&
                    metadata.photo_url !== "NA"
                ) {
                    html += `<div style="margin-top: 8px;"><img src="${metadata.photo_url}" alt="Aircraft" style="max-width: 100%; border-radius: 4px;" onerror="this.style.display='none'; this.parentElement.style.display='none';" /></div>`;
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

            // Create a feature group for this path to attach popup and handle hover
            const pathSegments = [];
            let popup = null;

            // Draw as multiple segments to have varying width/opacity per altitude
            for (let i = 0; i < pathPoints.length - 1; i++) {
                const p1 = pathPoints[i];
                const p2 = pathPoints[i + 1];

                const alt1 =
                    p1.baro_altitude ?? p1.geo_altitude ?? p1.altitude ?? 0;
                const alt2 =
                    p2.baro_altitude ?? p2.geo_altitude ?? p2.altitude ?? 0;

                const avgAlt = Math.max(
                    622, // LSGL elevation is ~622m
                    (alt1 + alt2) / 2,
                );

                // Re-calibrated inverse log relationship
                // k / log10(alt/offset)
                // At 630m: 0.75 / log10(630/440) ≈ 5px (Max)
                // At 10000m: 0.75 / log10(10000/440) ≈ 0.55px (Min)
                const logRatio = Math.log10(avgAlt / 440);
                const weight = Math.min(5, Math.max(0.5, 0.75 / logRatio));
                const opacity = Math.min(1, Math.max(0.2, 0.8 / logRatio));

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
                        flightId: flightId, // Store flightID
                    },
                ).addTo(map);

                // Store original style params for animation reset
                polyline._originalWeight = weight;
                polyline._originalOpacity = opacity;
                polyline._flightId = flightId; // Backup

                pathSegments.push(polyline);
                pathLayers.push(polyline);
            }

            // Attach popup and hover effects to all segments
            if (pathSegments.length > 0 && flightInfo) {
                // Create popup
                popup = L.popup({ maxWidth: 350, className: "flight-popup" });

                // Add hover effects - ONLY if not animating
                pathSegments.forEach((segment, idx) => {
                    segment.on("mouseover", function (e) {
                        if (isAnimating) return; // Disable hover during animation

                        // Highlight all segments of this path
                        pathSegments.forEach((s, i) => {
                            s.setStyle({
                                weight: s._originalWeight * 2.5,
                                opacity: Math.min(1, s._originalOpacity * 2),
                            });
                        });

                        // Show popup
                        if (popup) {
                            popup.setContent(popupContent);
                            popup.setLatLng(e.latlng);
                            popup.openOn(map);
                        }
                    });

                    segment.on("mouseout", function () {
                        if (isAnimating) return;

                        // Restore original style
                        pathSegments.forEach((s, i) => {
                            s.setStyle({
                                weight: s._originalWeight,
                                opacity: s._originalOpacity,
                            });
                        });

                        // Close popup
                        if (popup) {
                            map.closePopup(popup);
                        }
                    });
                });
            }
        };

        // Prepare flights for animation (sorted by date, newest first, limited for performance)
        const allFlightsForAnimation = [];
        const maxFlightsForAnimation = 50; // Limit for performance

        Object.entries(arrivalPaths).forEach(([flightId, points]) => {
            if (
                points.length > 0 &&
                allFlightsForAnimation.length < maxFlightsForAnimation
            ) {
                const flightInfo = getFlightInfo(flightId, true);
                const date =
                    flightInfo?.flight?.arrival_date ||
                    flightInfo?.flight?.arrival_time ||
                    new Date(0);
                allFlightsForAnimation.push({
                    flightId,
                    points,
                    isArrival: true,
                    date,
                    flightInfo,
                });
            }
        });
        Object.entries(departurePaths).forEach(([flightId, points]) => {
            if (
                points.length > 0 &&
                allFlightsForAnimation.length < maxFlightsForAnimation
            ) {
                const flightInfo = getFlightInfo(flightId, false);
                const date =
                    flightInfo?.flight?.departure_date ||
                    flightInfo?.flight?.departure_time ||
                    new Date(0);
                allFlightsForAnimation.push({
                    flightId,
                    points,
                    isArrival: false,
                    date,
                    flightInfo,
                });
            }
        });

        // Sort by date (newest first)
        allFlightsForAnimation.sort(
            (a, b) => b.date.getTime() - a.date.getTime(),
        );
        animatedFlights = allFlightsForAnimation;
        console.log(
            `FlightMap: Prepared ${animatedFlights.length} flights for animation`,
        );

        // Don't draw with opacity here - standard draw
        Object.entries(arrivalPaths).forEach(([flightId, points]) => {
            drawPath(points, "#60a5fa", flightId, true);
        });

        Object.entries(departurePaths).forEach(([flightId, points]) => {
            drawPath(points, "#fb923c", flightId, false);
        });

        // Fit map bounds to paths if any exist
        if (pathLayers.length > 0 && !isAnimating) {
            try {
                const group = new L.featureGroup(pathLayers);
                const bounds = group.getBounds();
                if (bounds.isValid()) {
                    const paddedBounds = bounds.pad(0.1);
                    map.fitBounds(paddedBounds);
                    // Limit zoom out to the data bbox
                    map.setMaxBounds(paddedBounds.pad(0.5)); // Allow a bit of leeway
                    map.setMinZoom(map.getBoundsZoom(paddedBounds.pad(0.5)));
                }
            } catch (e) {
                console.error("FlightMap: Error fitting bounds:", e);
                if (map) map.setView([LSGL_LAT, LSGL_LON], 11);
            }
        }
    }

    function startAnimation() {
        if (isAnimating) return;

        // Correctly refer to animatedFlights state
        const flightsToAnimate = $state.snapshot(animatedFlights);

        // If we have flights to animate
        if (!flightsToAnimate || flightsToAnimate.length === 0) {
            console.warn("No flights to animate");
            // Add visual feedback
            alert("Aucun vol à animer pour la période sélectionnée.");
            return;
        }

        console.log(
            "Starting animation with",
            flightsToAnimate.length,
            "flights",
        );
        isAnimating = true;
        currentFlightIndex = 0;

        // Start animation loop
        showFlightInAnimation(currentFlightIndex);

        animationInterval = setInterval(() => {
            currentFlightIndex++;
            if (currentFlightIndex >= animatedFlights.length) {
                currentFlightIndex = 0;
            }
            showFlightInAnimation(currentFlightIndex);
        }, 3500); // Increased to 3.5s per flight as requested
    }

    function stopAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
        isAnimating = false;
        currentFlightIndex = 0;

        // Reset all layers to original style
        pathLayers.forEach((layer) => {
            layer.setStyle({
                weight: layer._originalWeight,
                opacity: layer._originalOpacity,
            });
        });

        // Clear info panel
        flightInfoPanel = null;

        // Fit bounds to all
        if (pathLayers.length > 0 && map) {
            try {
                const group = new L.featureGroup(pathLayers);
                const bounds = group.getBounds();
                if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
            } catch (e) {}
        }
    }

    function showFlightInAnimation(index) {
        if (index >= animatedFlights.length || !map) return;

        const flight = animatedFlights[index];
        const currentFlightId = String(flight.flightId); // Ensure string

        // Update all layers
        const currentSegments = [];
        let matchingLayers = 0;

        pathLayers.forEach((layer) => {
            // Check both storage methods just in case
            const layerFlightId = String(
                layer.options.flightId || layer._flightId,
            ); // Ensure string

            if (layerFlightId === currentFlightId) {
                matchingLayers++;
                // Highlight current
                layer.setStyle({
                    weight: Math.max(3, layer._originalWeight * 3),
                    opacity: 1, // Fully opaque
                });
                layer.bringToFront();
                currentSegments.push(layer);
            } else {
                // Dim others
                layer.setStyle({
                    weight: 1,
                    opacity: 0.05, // Very transparent (ghosts)
                });
            }
        });

        // Zoom to flight bounds
        if (currentSegments.length > 0) {
            const group = L.featureGroup(currentSegments);
            const bounds = group.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds.pad(0.2), { animate: true, duration: 1 });
            }
        }

        // Update info panel
        if (flight.flightInfo) {
            console.log(
                "FlightMap: Updating info panel for flight",
                flight.flightId,
            );
            flightInfoPanel = {
                flight: flight.flightInfo.flight,
                metadata: flight.flightInfo.metadata,
                isArrival: flight.isArrival,
            };
        } else {
            console.warn(
                "FlightMap: No flightInfo found for animation flight",
                flight.flightId,
            );
            // Fallback to show at least the ID if possible
            flightInfoPanel = {
                flight: { ICAO24: flight.flightId },
                metadata: null,
                isArrival: flight.isArrival,
            };
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
                const timeA =
                    a.requested_time instanceof Date
                        ? a.requested_time.getTime()
                        : a.requested_time || 0;
                const timeB =
                    b.requested_time instanceof Date
                        ? b.requested_time.getTime()
                        : b.requested_time || 0;
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
                            console.error(
                                "FlightMap: Error during initialization:",
                                e,
                            );
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
        stopAnimation();
        if (map?._updateTimeout) {
            clearTimeout(map._updateTimeout);
        }
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
                <select
                    bind:value={selectedDateRange}
                    class="date-selector"
                    style="cursor: pointer;"
                >
                    {#each dateRangeOptions as option}
                        <option value={option.value}>{option.label}</option>
                    {/each}
                </select>
            </label>
        </div>
    </div>
    <div class="legend">
        <span class="legend-item"
            ><span class="color-box arrival"></span> Atterrissages</span
        >
        <span class="legend-item"
            ><span class="color-box departure"></span> Décollages</span
        >
        <span class="legend-item opacity-info">
            <span class="opacity-box"></span>
            <span>Lignes fines = Haute altitude</span>
        </span>
        <button
            class="animation-button"
            class:active={isAnimating}
            onclick={() => (isAnimating ? stopAnimation() : startAnimation())}
        >
            {isAnimating ? "⏸ Arrêter" : "▶ Démarrer"} animation
        </button>
    </div>
    <div class="map-wrapper">
        <div bind:this={mapContainer} class="map"></div>
        {#if flightInfoPanel?.flight && isAnimating}
            <div class="flight-info-panel">
                <div class="panel-header">
                    <span
                        class="type-badge"
                        class:arrival={flightInfoPanel.isArrival}
                    >
                        {flightInfoPanel.isArrival
                            ? "ATTERRISSAGE"
                            : "DÉCOLLAGE"}
                    </span>
                    <span class="time-badge">
                        {#if flightInfoPanel.isArrival}
                            {flightInfoPanel.flight.arrival_time?.toLocaleTimeString(
                                "fr-CH",
                                { hour: "2-digit", minute: "2-digit" },
                            )}
                        {:else}
                            {flightInfoPanel.flight.departure_time?.toLocaleTimeString(
                                "fr-CH",
                                { hour: "2-digit", minute: "2-digit" },
                            )}
                        {/if}
                    </span>
                </div>

                <div class="flight-main">
                    <div class="callsign">
                        {flightInfoPanel.flight?.call_sign &&
                        flightInfoPanel.flight.call_sign !== "NA"
                            ? flightInfoPanel.flight.call_sign
                            : "Inconnu"}
                    </div>
                    <div class="icao">
                        {flightInfoPanel.flight?.ICAO24 || "ICAO inconnu"}
                    </div>
                </div>

                <div class="panel-content">
                    {#if flightInfoPanel.flight}
                        {@const originCode =
                            flightInfoPanel.flight.departure_airport_ICAO}
                        {@const destCode =
                            flightInfoPanel.flight.destination_airport_ICAO}
                        {@const originInfo =
                            flightStore.getAirportInfo(originCode)}
                        {@const destInfo = flightStore.getAirportInfo(destCode)}

                        <div class="route-info">
                            <div class="route-row">
                                <span class="label"
                                    >{flightInfoPanel.isArrival
                                        ? "Provenance"
                                        : "Destination"}:</span
                                >
                                <span class="value">
                                    {#if flightInfoPanel.isArrival}
                                        {originCode === "LSGL"
                                            ? "Lausanne (LSGL)"
                                            : originInfo?.name &&
                                                originInfo.name !== "NA"
                                              ? `${originInfo.name} (${originCode})`
                                              : originCode}
                                    {:else}
                                        {destCode === "LSGL"
                                            ? "Lausanne (LSGL)"
                                            : destInfo?.name &&
                                                destInfo.name !== "NA"
                                              ? `${destInfo.name} (${destCode})`
                                              : destCode}
                                    {/if}
                                </span>
                            </div>
                            <div class="route-row">
                                <span class="label">Date:</span>
                                <span class="value">
                                    {new Intl.DateTimeFormat("fr-CH", {
                                        dateStyle: "full",
                                    }).format(
                                        flightInfoPanel.isArrival
                                            ? flightInfoPanel.flight
                                                  .arrival_date
                                            : flightInfoPanel.flight
                                                  .departure_date,
                                    )}
                                </span>
                            </div>
                            {#if flightInfoPanel.flight.arrival_time && flightInfoPanel.flight.departure_time}
                                {@const duration = Math.round(
                                    (flightInfoPanel.flight.arrival_time -
                                        flightInfoPanel.flight.departure_time) /
                                        60000,
                                )}
                                {#if duration > 0}
                                    <div class="route-row">
                                        <span class="label">Durée vol:</span>
                                        <span class="value">
                                            {#if duration >= 60}
                                                {Math.floor(duration / 60)}h {duration %
                                                    60}min
                                            {:else}
                                                {duration}min
                                            {/if}
                                        </span>
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    {/if}

                    {#if flightInfoPanel.metadata}
                        <div class="metadata-info">
                            <div class="model">
                                <strong>Modèle:</strong>
                                {isValidValue(flightInfoPanel.metadata.model) &&
                                flightInfoPanel.metadata.model !== "NA"
                                    ? flightInfoPanel.metadata.model
                                    : "Inconnu"}
                            </div>
                            <div class="registration">
                                <strong>Pays:</strong>
                                {isValidValue(
                                    flightInfoPanel.metadata.origin_country,
                                ) &&
                                flightInfoPanel.metadata.origin_country !== "NA"
                                    ? flightInfoPanel.metadata.origin_country
                                    : "Inconnu"}
                            </div>
                        </div>

                        {#if isValidValue(flightInfoPanel.metadata.photo_url) && flightInfoPanel.metadata.photo_url !== "NA"}
                            <div class="aircraft-img">
                                <img
                                    src={flightInfoPanel.metadata.photo_url}
                                    alt="Photo de l'aéronef"
                                    onerror={(e) => {
                                        e.target.style.display = "none";
                                        e.target.parentElement.style.display =
                                            "none";
                                    }}
                                />
                            </div>
                        {/if}
                    {/if}
                </div>
            </div>
        {/if}
    </div>
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

    @media (max-width: 600px) {
        .map-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
        }
        .controls {
            width: 100%;
            justify-content: space-between;
        }
        .date-selector {
            font-size: 13px;
            padding: 6px 12px;
        }
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
        transition:
            background 0.2s,
            border-color 0.2s;
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

    .map-wrapper {
        position: relative;
        display: flex;
        gap: 16px;
    }

    .map {
        flex: 1;
        height: 600px;
        border-radius: 8px;
        overflow: hidden;
    }

    @media (max-width: 900px) {
        .map-wrapper {
            flex-direction: column;
            gap: 16px;
        }
        .map {
            height: 450px;
        }
    }

    .animation-button {
        background: rgba(59, 130, 246, 0.2);
        color: #60a5fa;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        border: 1px solid rgba(59, 130, 246, 0.3);
        cursor: pointer;
        transition: all 0.2s;
        margin-left: auto;
    }

    .animation-button:hover {
        background: rgba(59, 130, 246, 0.3);
        border-color: rgba(59, 130, 246, 0.5);
    }

    .animation-button.active {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
        border-color: rgba(239, 68, 68, 0.3);
    }

    .flight-info-panel {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 320px;
        background: rgba(
            15,
            23,
            42,
            0.9
        ); /* Slightly more opaque for better visibility */
        border-radius: 12px;
        padding: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1); /* Back to subtle border */
        backdrop-filter: blur(12px);
        max-height: calc(100% - 40px);
        overflow-y: auto;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
        z-index: 5000; /* Ensure it stays above map controls and popups */
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: auto; /* Ensure interactions works */
    }

    @media (max-width: 900px) {
        .flight-info-panel {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            z-index: 10000;
            border-radius: 16px 16px 0 0;
            max-height: 50vh;
            border-left: none;
            border-right: none;
            border-bottom: none;
            background: rgba(15, 23, 42, 0.98);
            box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
            padding: 24px 20px;
        }
    }

    .panel-header {
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .type-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 4px 12px;
        border-radius: 4px;
        background: #f97316;
        color: white;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .type-badge.arrival {
        background: #3b82f6;
    }

    .panel-content {
        color: white;
    }

    .callsign {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 4px;
        letter-spacing: -0.5px;
    }

    .icao {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 16px;
        font-family: monospace;
    }

    .info-section {
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .info-section:last-of-type {
        border-bottom: none;
    }

    .section-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: rgba(255, 255, 255, 0.4);
        margin-bottom: 8px;
    }

    .info-item {
        margin-bottom: 6px;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.9);
        line-height: 1.5;
    }

    .info-item strong {
        color: rgba(255, 255, 255, 0.7);
        font-weight: 500;
        font-size: 13px;
    }

    .time-info {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 4px;
    }

    .sub-info {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 2px;
    }

    .metadata-section {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .photo-container {
        margin-top: 16px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .photo-container img {
        width: 100%;
        height: auto;
        display: block;
    }

    /* Refined styles to match scatter plot panel */
    .time-badge {
        font-size: 13px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.7);
    }

    .flight-main {
        margin-bottom: 20px;
    }

    .route-info {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
    }

    .route-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 13px;
    }

    .route-row:last-child {
        margin-bottom: 0;
    }

    .route-row .label {
        color: rgba(255, 255, 255, 0.4);
    }

    .route-row .value {
        color: rgba(255, 255, 255, 0.9);
        font-weight: 500;
        text-align: right;
        max-width: 160px;
    }

    .metadata-info {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
    }

    .metadata-info .model {
        font-size: 14px;
        color: white;
        margin-bottom: 4px;
    }

    .metadata-info .registration {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.6);
    }

    .aircraft-img {
        border-radius: 8px;
        overflow: hidden;
        margin-top: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .aircraft-img img {
        width: 100%;
        height: 160px;
        object-fit: cover;
        display: block;
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
