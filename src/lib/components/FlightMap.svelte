<script>
    import { onMount, onDestroy, untrack } from "svelte";
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
    let highlightedFlightLayer = $state(null);
    let flightInfoPanel = $state(null);

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
                    label: `7 derniers jours (${formatDateRange(startDate, endDate)})`,
                    startDate,
                    endDate,
                });
            }
        }
        return options;
    }

    const dateRangeOptions = $derived(getDateRangeOptions());

    /** @type {HTMLDivElement} */
    let mapContainer = $state();
    /** @type {any} */
    let map;
    /** @type {any} */
    let flightsLayerGroup; // Optimized layer management

    // LSGL coordinates
    const LSGL_LAT = 46.545;
    const LSGL_LON = 6.617;

    // Helper function to check if a value is valid (not NA, null, undefined, or empty)
    const isValidValue = (value) => {
        return (
            value &&
            value !== "NA" &&
            value !== "null" &&
            String(value).trim() !== ""
        );
    };

    // Derived value to force reactivity
    const shouldShowPanel = $derived(isAnimating && flightInfoPanel !== null);

    // Handle dropdown selection manually to avoid reactivity loops
    function handleDateChange(event) {
        const newValue = event.target.value;
        selectedDateRange = newValue; // Update bound state manually if needed, or just let the select do it

        const option = dateRangeOptions.find((opt) => opt.value === newValue);

        if (option) {
            console.log("Date range changed manually:", newValue);
            stopAnimation();

            // Update local state that updateFlightPaths depends on
            if (option.startDate && option.endDate) {
                mapDateRangeDays = null;
                mapDateRangeStart = option.startDate;
                mapDateRangeEnd = option.endDate;
            } else {
                mapDateRangeDays = option.days || 7;
                mapDateRangeStart = null;
                mapDateRangeEnd = null;
            }

            // Also call update mapping immediately to be sure
            if (map) {
                updateFlightPaths();
            }
        }
    }
    $effect(() => {
        // React ONLY to changes in state vectors (data updates)
        // Date range changes are now handled manually by handleDateChange
        if (
            map &&
            (arrivalStateVectors.length > 0 || departureStateVectors.length > 0)
        ) {
            // Debounce data updates
            clearTimeout(map._updateTimeout);
            map._updateTimeout = setTimeout(() => {
                // Only update if we haven't just done it manually (optional check, but good practice)
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
                preferCanvas: true, // Critical for performance with many paths
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

            // Initialize optimized layer group
            flightsLayerGroup = L.layerGroup().addTo(map);
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

        console.log(
            `FlightMap: Updating paths with ${arrivalsRaw.length} arrivals and ${departuresRaw.length} departures`,
        );

        // Don't return early - we still want to show the map even if there's no data

        // Clear existing paths using optimized LayerGroup
        if (flightsLayerGroup) {
            flightsLayerGroup.clearLayers();
        }

        // Calculate date range from local state (not store)
        let startDate, endDate;
        if (mapDateRangeStart && mapDateRangeEnd) {
            // Use provided date range
            startDate = new Date(mapDateRangeStart);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(mapDateRangeEnd);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Use number of days
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            startDate = new Date();
            startDate.setDate(startDate.getDate() - (mapDateRangeDays || 7));
            startDate.setHours(0, 0, 0, 0);
        }

        console.log(
            `FlightMap: Filter range: ${startDate.toISOString()} to ${endDate.toISOString()}`,
        );

        // Filter state vectors by date range
        const filteredArrivals = arrivalsRaw.filter((sv) => {
            if (
                !sv.arrival_date ||
                !(sv.arrival_date instanceof Date) ||
                isNaN(sv.arrival_date.getTime())
            ) {
                return false;
            }
            try {
                const date = new Date(sv.arrival_date);
                if (isNaN(date.getTime())) return false;

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
            if (
                !sv.departure_date ||
                !(sv.departure_date instanceof Date) ||
                isNaN(sv.departure_date.getTime())
            ) {
                return false;
            }
            try {
                const date = new Date(sv.departure_date);
                if (isNaN(date.getTime())) return false;

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
        console.log(
            `FlightMap: Filtered to ${filteredArrivals.length} arrival SVs and ${filteredDepartures.length} departure SVs`,
        );

        // Group by flight ID and limit points per flight for performance
        const arrivalPaths = groupByFlightId(filteredArrivals);
        const departurePaths = groupByFlightId(filteredDepartures);
        console.log(
            `FlightMap: Found ${Object.keys(arrivalPaths).length} arrival flights and ${Object.keys(departurePaths).length} departure flights`,
        );

        // Limit the number of points per flight path (Performance Optimized)
        const maxPointsPerFlight = 40;

        // HARD LIMIT on total visible flights to prevent browser freezing
        // Sort keys by some criteria if possible, or just limit arbitrarily but consistently
        // Realistically we want the LATEST flights.
        // The grouped objects are not sorted by date, they are just dicts.
        // We'll process them, verify dates, and take the top 500 newest.

        let flightsToDraw = [];

        // Helper to get flight info and metadata for a flight ID
        const getFlightInfo = (flightId, isArrival) => {
            const flights = isArrival
                ? flightStore.arrivalsData
                : flightStore.departuresData;
            const flight = flights.find(
                (f) =>
                    f.id === flightId ||
                    f.ICAO24 === flightId ||
                    String(f.flightId) === String(flightId),
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

        // Function to create popup content with early return for invalid data
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
        // Function to draw a single polyline
        // for the flight path (Performance Optimized)
        const drawPath = (pathPoints, baseColor, flightId, isArrival) => {
            if (pathPoints.length < 2) return;

            const flightInfo = getFlightInfo(flightId, isArrival);
            const popupContent = createPopupContent(flightInfo, isArrival);

            // Calculate average altitude for the whole path for styling
            let totalAlt = 0;
            let validAltPoints = 0;
            pathPoints.forEach((p) => {
                if (p.altitude !== null && !isNaN(p.altitude)) {
                    totalAlt += p.altitude;
                    validAltPoints++;
                }
            });
            const avgAlt =
                validAltPoints > 0 ? totalAlt / validAltPoints : 1000;
            const logAlt = Math.log10(Math.max(10, avgAlt));

            // Optimized thin style: higher altitude = thinner & more transparent
            const weight = Math.max(0.5, 3 - logAlt * 0.7);
            const opacity = Math.max(0.2, 0.8 - logAlt / 8);

            // Create KEY performance improvement: ONE polyline per flight
            const latLngs = pathPoints.map((p) => [p.latitude, p.longitude]);

            const polyline = L.polyline(latLngs, {
                color: baseColor,
                weight: weight,
                opacity: opacity,
                smoothFactor: 1.5, // Aggressive smoothing for performance
                flightId: flightId,
                flightId: flightId,
            }).addTo(flightsLayerGroup); // Add to optimized group

            // Store original style for animation reset
            polyline._originalWeight = weight;
            polyline._originalOpacity = opacity;
            polyline._flightId = flightId;

            // Efficient Hover Effect
            polyline.on("mouseover", function (e) {
                if (isAnimating) return;

                this.setStyle({
                    weight: Math.max(2, this._originalWeight * 2),
                    opacity: 1,
                });
                this.bringToFront();

                if (popupContent) {
                    L.popup({ maxWidth: 350, className: "flight-popup" })
                        .setLatLng(e.latlng)
                        .setContent(popupContent)
                        .openOn(map);
                }
            });

            polyline.on("mouseout", function () {
                if (isAnimating) return;

                this.setStyle({
                    weight: this._originalWeight,
                    opacity: this._originalOpacity,
                });
                map.closePopup();
            });

            // pathLayers.push(polyline); // Deprecated
        };

        Object.keys(arrivalPaths).forEach((flightId) => {
            if (arrivalPaths[flightId].length > 0) {
                // Downsample points
                if (arrivalPaths[flightId].length > maxPointsPerFlight) {
                    const points = arrivalPaths[flightId];
                    const sampled = [points[0]];
                    const step = (points.length - 2) / (maxPointsPerFlight - 2);
                    for (let i = 1; i < maxPointsPerFlight - 1; i++) {
                        const idx = Math.floor(i * step);
                        if (idx < points.length - 1) {
                            sampled.push(points[idx]);
                        }
                    }
                    sampled.push(points[points.length - 1]);
                    arrivalPaths[flightId] = sampled;
                }

                const points = arrivalPaths[flightId];
                // Get date for sorting
                const flightInfo = getFlightInfo(flightId, true);
                const date =
                    flightInfo?.flight?.arrival_date ||
                    flightInfo?.flight?.arrival_time ||
                    new Date(0);

                flightsToDraw.push({
                    id: flightId,
                    points: points,
                    isArrival: true,
                    date: date,
                });
            }
        });

        Object.keys(departurePaths).forEach((flightId) => {
            if (departurePaths[flightId].length > 0) {
                // Downsample points
                if (departurePaths[flightId].length > maxPointsPerFlight) {
                    const points = departurePaths[flightId];
                    const sampled = [points[0]];
                    const step = (points.length - 2) / (maxPointsPerFlight - 2);
                    for (let i = 1; i < maxPointsPerFlight - 1; i++) {
                        const idx = Math.floor(i * step);
                        if (idx < points.length - 1) {
                            sampled.push(points[idx]);
                        }
                    }
                    sampled.push(points[points.length - 1]);
                    departurePaths[flightId] = sampled;
                }

                const points = departurePaths[flightId];
                // Get sorting date
                const flightInfo = getFlightInfo(flightId, false);
                const date =
                    flightInfo?.flight?.departure_date ||
                    flightInfo?.flight?.departure_time ||
                    new Date(0);

                flightsToDraw.push({
                    id: flightId,
                    points: points,
                    isArrival: false,
                    date: date,
                });
            }
        });

        // Sort by date descending (newest first)
        flightsToDraw.sort((a, b) => {
            const tA = a.date instanceof Date ? a.date.getTime() : 0;
            const tB = b.date instanceof Date ? b.date.getTime() : 0;
            return tB - tA;
        });

        // LIMIT to 500
        const MAX_VISIBLE_FLIGHTS = 500;
        if (flightsToDraw.length > MAX_VISIBLE_FLIGHTS) {
            console.warn(
                `FlightMap: Capping visible flights to ${MAX_VISIBLE_FLIGHTS} (found ${flightsToDraw.length})`,
            );
            flightsToDraw = flightsToDraw.slice(0, MAX_VISIBLE_FLIGHTS);
        }

        console.log(`FlightMap: Drawing ${flightsToDraw.length} flights`);

        // Draw filtered flights
        flightsToDraw.forEach((f) => {
            drawPath(
                f.points,
                f.isArrival ? "#60a5fa" : "#fb923c",
                f.id,
                f.isArrival,
            );
        });

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

        //     Object.entries(arrivalPaths).forEach(([flightId, points]) => {
        //         drawPath(points, "#60a5fa", flightId, true);
        //     });
        //     Object.entries(departurePaths).forEach(([flightId, points]) => {
        //         drawPath(points, "#fb923c", flightId, false);
        //     });
        // }

        // Fit map bounds to paths if any exist
        if (
            flightsLayerGroup &&
            flightsLayerGroup.getLayers().length > 0 &&
            !isAnimating
        ) {
            try {
                // FeatureGroup can calculate bounds, LayerGroup cannot directly without helper
                // We can create a temporary FeatureGroup
                const group = L.featureGroup(flightsLayerGroup.getLayers());
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
        console.log("isAnimating set to:", isAnimating);
        currentFlightIndex = 0;

        // Start animation loop
        console.log("Showing first flight at index 0");
        showFlightInAnimation(currentFlightIndex);

        animationInterval = setInterval(() => {
            currentFlightIndex++;
            if (currentFlightIndex >= animatedFlights.length) {
                currentFlightIndex = 0;
            }
            console.log(
                "Animation step:",
                currentFlightIndex,
                "/",
                animatedFlights.length,
            );
            showFlightInAnimation(currentFlightIndex);
        }, 3500); // 3.5s per flight (2s longer than 1.5s)
    }

    function stopAnimation() {
        console.log("stopAnimation called");
        console_trace();
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
        isAnimating = false;
        currentFlightIndex = 0;
        flightInfoPanel = null;

        // Reset all layers to original style using LayerGroup
        if (flightsLayerGroup) {
            flightsLayerGroup.eachLayer((layer) => {
                if (layer.setStyle) {
                    layer.setStyle({
                        weight: layer._originalWeight || 0.5,
                        opacity: layer._originalOpacity || 0.5,
                    });
                }
            });

            // Fit bounds to all
            try {
                const group = L.featureGroup(flightsLayerGroup.getLayers());
                const bounds = group.getBounds();
                if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
            } catch (e) {}
        }
    }

    // Stack trace helper - simplified to avoid console clutter
    function console_trace() {
        // Just log the message to avoid the "Error" look in console
        console.log(
            "Trace: Animation stopping (dropdown change or manual stop)",
        );
    }

    function showFlightInAnimation(index) {
        console.log("showFlightInAnimation called with index:", index);
        if (index >= animatedFlights.length || !map) {
            console.warn(
                "Invalid index or no map:",
                index,
                animatedFlights.length,
                !!map,
            );
            return;
        }

        const flight = animatedFlights[index];
        if (!flight || !flight.flightId) {
            console.warn("Invalid flight at index", index, flight);
            return;
        }

        console.log(
            "Processing flight:",
            flight.flightId,
            "isArrival:",
            flight.isArrival,
        );
        const currentFlightId = String(flight.flightId); // Ensure string

        // Update all layers
        const currentSegments = [];
        let matchingLayers = 0;

        if (flightsLayerGroup) {
            flightsLayerGroup.eachLayer((layer) => {
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
        }

        console.log(
            "Matched",
            matchingLayers,
            "layers for flight",
            currentFlightId,
        );

        // Zoom to flight bounds
        if (currentSegments.length > 0) {
            try {
                const group = L.featureGroup(currentSegments);
                const bounds = group.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds.pad(0.2), {
                        animate: true,
                        duration: 1,
                    });
                }
            } catch (e) {
                console.warn("Error fitting bounds:", e);
            }
        }

        // Update info panel
        if (flight.flightInfo && flight.flightInfo.flight) {
            console.log("Setting flightInfoPanel with flight data");
            // Use snapshot to create plain objects instead of proxies
            flightInfoPanel = {
                flight: $state.snapshot(flight.flightInfo.flight),
                metadata: flight.flightInfo.metadata
                    ? $state.snapshot(flight.flightInfo.metadata)
                    : null,
                isArrival: flight.isArrival,
            };
            console.log("flightInfoPanel set:", flightInfoPanel);
        } else {
            console.warn(
                "No flight info for flight",
                currentFlightId,
                flight.flightInfo,
            );
            flightInfoPanel = null;
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
                    value={selectedDateRange}
                    onchange={handleDateChange}
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

        {#if shouldShowPanel}
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
                </div>
                <div class="panel-content">
                    <!-- Call Sign -->
                    {#if flightInfoPanel.flight?.call_sign && flightInfoPanel.flight.call_sign !== "NA"}
                        <div class="callsign">
                            {flightInfoPanel.flight.call_sign}
                        </div>
                    {/if}

                    <!-- ICAO24 -->
                    {#if flightInfoPanel.flight?.ICAO24 && flightInfoPanel.flight.ICAO24 !== "NA"}
                        <div class="icao">
                            ICAO24: {flightInfoPanel.flight.ICAO24}
                        </div>
                    {/if}

                    <!-- Airport Information -->
                    {#if flightInfoPanel.flight}
                        {@const originCode =
                            flightInfoPanel.flight.departure_airport_ICAO}
                        {@const destCode =
                            flightInfoPanel.flight.destination_airport_ICAO}
                        {@const originInfo =
                            flightStore.getAirportInfo(originCode)}
                        {@const destInfo = flightStore.getAirportInfo(destCode)}

                        <!-- Departure Airport -->
                        {#if originCode && originCode !== "NA"}
                            <div class="info-section">
                                <div class="section-title">Départ</div>
                                <div class="info-item">
                                    {#if originCode === "LSGL"}
                                        <strong
                                            >Lausanne-Blécherette (LSGL)</strong
                                        >
                                    {:else if originInfo?.name && originInfo.name !== "NA"}
                                        <strong>{originInfo.name}</strong>
                                        <div class="sub-info">
                                            {originCode}
                                            {#if originInfo?.country && originInfo.country !== "NA"}
                                                · {originInfo.country}
                                            {/if}
                                        </div>
                                    {:else}
                                        <strong>{originCode}</strong>
                                    {/if}
                                </div>
                                {#if flightInfoPanel.flight.departure_time}
                                    <div class="info-item time-info">
                                        {new Intl.DateTimeFormat("fr-CH", {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                        }).format(
                                            flightInfoPanel.flight
                                                .departure_time,
                                        )}
                                        à {flightInfoPanel.flight.departure_time.toLocaleTimeString(
                                            "fr-CH",
                                            {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            },
                                        )}
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        <!-- Arrival Airport -->
                        {#if destCode && destCode !== "NA"}
                            <div class="info-section">
                                <div class="section-title">Arrivée</div>
                                <div class="info-item">
                                    {#if destCode === "LSGL"}
                                        <strong
                                            >Lausanne-Blécherette (LSGL)</strong
                                        >
                                    {:else if destInfo?.name && destInfo.name !== "NA"}
                                        <strong>{destInfo.name}</strong>
                                        <div class="sub-info">
                                            {destCode}
                                            {#if destInfo?.country && destInfo.country !== "NA"}
                                                · {destInfo.country}
                                            {/if}
                                        </div>
                                    {:else}
                                        <strong>{destCode}</strong>
                                    {/if}
                                </div>
                                {#if flightInfoPanel.flight.arrival_time}
                                    <div class="info-item time-info">
                                        {new Intl.DateTimeFormat("fr-CH", {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                        }).format(
                                            flightInfoPanel.flight.arrival_time,
                                        )}
                                        à {flightInfoPanel.flight.arrival_time.toLocaleTimeString(
                                            "fr-CH",
                                            {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            },
                                        )}
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        <!-- Flight Duration -->
                        {#if flightInfoPanel.flight.arrival_time && flightInfoPanel.flight.departure_time}
                            {@const duration = Math.round(
                                (flightInfoPanel.flight.arrival_time -
                                    flightInfoPanel.flight.departure_time) /
                                    60000,
                            )}
                            {#if duration > 0}
                                <div class="info-section">
                                    <div class="info-item">
                                        <strong>Temps de vol:</strong>
                                        {#if duration >= 60}
                                            {Math.floor(duration / 60)}h {duration %
                                                60}min
                                        {:else}
                                            {duration}min
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        {/if}
                    {/if}

                    <!-- Aircraft Metadata -->
                    {#if flightInfoPanel.metadata}
                        <div class="metadata-section">
                            <div class="section-title">Aéronef</div>
                            {#if isValidValue(flightInfoPanel.metadata.model) && flightInfoPanel.metadata.model !== "NA"}
                                <div class="info-item">
                                    <strong>Modèle:</strong>
                                    {flightInfoPanel.metadata.model}
                                </div>
                            {/if}
                            {#if isValidValue(flightInfoPanel.metadata.origin_country) && flightInfoPanel.metadata.origin_country !== "NA"}
                                <div class="info-item">
                                    <strong>Pays d'immatriculation:</strong>
                                    {flightInfoPanel.metadata.origin_country}
                                </div>
                            {/if}
                        </div>

                        <!-- Aircraft Photo -->
                        {#if isValidValue(flightInfoPanel.metadata.photo_url) && flightInfoPanel.metadata.photo_url !== "NA"}
                            <div class="photo-container">
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
        width: 280px;
        background: rgba(15, 23, 42, 0.95);
        border-radius: 12px;
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        max-height: 600px;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    @media (max-width: 1024px) {
        .map-wrapper {
            flex-direction: column;
        }

        .map {
            height: 400px;
            order: 1;
        }

        .flight-info-panel {
            width: 100%;
            max-height: 400px;
            order: 2;
        }

        .animation-button {
            margin-left: 0;
            width: 100%;
        }

        .map-header {
            flex-direction: column;
            align-items: flex-start;
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
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        margin-bottom: 12px;
        font-family: monospace;
    }

    .info-section {
        margin-bottom: 12px;
        padding-bottom: 8px;
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
