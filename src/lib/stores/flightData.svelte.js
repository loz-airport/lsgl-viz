/**
 * Svelte store for managing flight data state using Svelte 5 runes
 */

import {
    fetchCSV,
    transformFlightData,
    transformStateVectors,
    filterByDateRange,
    combineFlights,
    fetchAircraftMetadata
} from '../utils/dataLoader.js';

class FlightStore {
    arrivalsData = $state([]);
    departuresData = $state([]);
    arrivalStateVectors = $state([]);
    departureStateVectors = $state([]);
    aircraftMetadata = $state([]);
    airportMetadata = $state([]);

    isLoading = $state(false);
    loadError = $state(null);
    isProcessing = $state(false);
    dateRangeDays = $state(7);
    dateRangeStart = $state(null); // null means use dateRangeDays, otherwise use start/end dates
    dateRangeEnd = $state(null);

    allFlights = $derived.by(() => {
        return combineFlights(this.arrivalsData, this.departuresData);
    });

    // Memoized filtered flights to avoid recalculation
    #filteredFlightsCache = new Map();

    // Helper to get airport info
    getAirportInfo(icao) {
        if (!icao) return null;

        // Normalize ICAO code
        const code = String(icao).toUpperCase().trim();

        // Find in metadata
        const metadata = this.airportMetadata.find(
            m => {
                const mCode = m.icao || m.ICAO || m.ident || m.gps_code || '';
                return String(mCode).toUpperCase() === code;
            }
        );

        if (metadata) {
            return {
                name: metadata.airport_name || metadata.name || code,
                country: metadata.country_code || metadata.iso_country || metadata.country || null,
                city: metadata.city || metadata.municipality || null
            };
        }

        return null;
    }

    // Helper to get aircraft info
    getAircraftInfo(icao24) {
        if (!icao24) return null;
        const code = String(icao24).toLowerCase();
        return this.aircraftMetadata.find(m => {
            const metaIcao = (m.ICAO24 || m.icao24);
            return metaIcao && String(metaIcao).toLowerCase() === code;
        }) || null;
    }

    // Helper to get flights filtered by days or date range with caching
    getFilteredFlights(days, startDate = null, endDate = null) {
        // Create cache key
        const cacheKey = `${days}-${startDate?.getTime() || 'null'}-${endDate?.getTime() || 'null'}`;

        // Return cached result if available
        if (this.#filteredFlightsCache.has(cacheKey)) {
            this.isProcessing = false;
            return this.#filteredFlightsCache.get(cacheKey);
        }

        // Show processing indicator for expensive operations
        this.isProcessing = true;

        // Check if we have data to process
        if (!this.arrivalsData.length && !this.departuresData.length) {
            this.isProcessing = false;
            return [];
        }

        let fArrivals, fDepartures;

        if (startDate && endDate) {
            // Filter by date range
            fArrivals = this.arrivalsData.filter(f => {
                const date = f.arrival_date;
                if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
                return date >= startDate && date <= endDate;
            });
            fDepartures = this.departuresData.filter(f => {
                const date = f.departure_date;
                if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
                return date >= startDate && date <= endDate;
            });
        } else {
            // Filter by number of days
            fArrivals = filterByDateRange(this.arrivalsData, days, 'arrival_date');
            fDepartures = filterByDateRange(this.departuresData, days, 'departure_date');
        }

        // Limit the number of flights for performance (keep most recent)
        const maxFlights = 1000;
        const limitedArrivals = fArrivals.slice(-Math.ceil(maxFlights / 2));
        const limitedDepartures = fDepartures.slice(-Math.ceil(maxFlights / 2));

        // Join with metadata (only for filtered results to improve performance)
        const joined = combineFlights(limitedArrivals, limitedDepartures).map(flight => {
            // Convert ICAO24 to string and normalize for comparison
            const flightIcao = flight.ICAO24 ? String(flight.ICAO24).toLowerCase() : null;
            const metadata = this.aircraftMetadata.find(m => {
                // Check both uppercase and lowercase versions
                const metaIcao = (m.ICAO24 || m.icao24) ? String(m.ICAO24 || m.icao24).toLowerCase() : null;
                return metaIcao && flightIcao && metaIcao === flightIcao;
            });
            const airportCode = flight.flight_type === 'arrival'
                ? flight.departure_airport_ICAO
                : flight.destination_airport_ICAO;

            return {
                ...flight,
                metadata: metadata || null,
                airportInfo: this.getAirportInfo(airportCode)
            };
        });

        // Cache the result
        this.#filteredFlightsCache.set(cacheKey, joined);

        // Limit cache size to prevent memory leaks
        if (this.#filteredFlightsCache.size > 10) {
            const firstKey = this.#filteredFlightsCache.keys().next().value;
            this.#filteredFlightsCache.delete(firstKey);
        }

        // Hide processing indicator
        this.isProcessing = false;

        return joined;
    }

    getFilteredArrivals(days) {
        return filterByDateRange(this.arrivalsData, days, 'arrival_date');
    }

    getFilteredDepartures(days) {
        return filterByDateRange(this.departuresData, days, 'departure_date');
    }

    filteredFlights = $derived.by(() => {
        return this.getFilteredFlights(this.dateRangeDays, this.dateRangeStart, this.dateRangeEnd);
    });

    // Cache for daily counts
    #dailyCountsCache = new Map();

    getDailyCounts(days, startDate = null, endDate = null) {
        // Create cache key
        const cacheKey = `counts-${days}-${startDate?.getTime() || 'null'}-${endDate?.getTime() || 'null'}`;

        // Return cached result if available
        if (this.#dailyCountsCache.has(cacheKey)) {
            this.isProcessing = false;
            return this.#dailyCountsCache.get(cacheKey);
        }

        // Get flights data for processing
        const flights = this.getFilteredFlights(days, startDate, endDate);
        if (!flights.length) {
            this.isProcessing = false;
            return [];
        }

        const counts = {};

        flights.forEach(flight => {
            // Get the appropriate date based on flight type
            const dateObj = flight.flight_type === 'arrival'
                ? flight.arrival_date
                : flight.departure_date;

            // Check if date is valid
            if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
                return; // Skip invalid dates
            }

            // Convert to ISO string and extract date part
            let dateStr;
            try {
                dateStr = dateObj.toISOString().split('T')[0];
            } catch (e) {
                return; // Skip if toISOString fails
            }

            if (!dateStr) return;

            // Create date object for the chart
            const dateForChart = new Date(dateStr);
            if (isNaN(dateForChart.getTime())) {
                return; // Skip if date creation fails
            }

            if (!counts[dateStr]) {
                counts[dateStr] = { date: dateForChart, arrivals: 0, departures: 0 };
            }

            if (flight.flight_type === 'arrival') {
                counts[dateStr].arrivals++;
            } else {
                counts[dateStr].departures++;
            }
        });

        const result = Object.values(counts)
            .filter(d => d.date instanceof Date && !isNaN(d.date.getTime()))
            .sort((a, b) => a.date - b.date);

        // Cache the result
        this.#dailyCountsCache.set(cacheKey, result);

        // Limit cache size
        if (this.#dailyCountsCache.size > 5) {
            const firstKey = this.#dailyCountsCache.keys().next().value;
            this.#dailyCountsCache.delete(firstKey);
        }

        this.isProcessing = false;
        return result;
    }

    dailyFlightCounts = $derived.by(() => {
        return this.getDailyCounts(this.dateRangeDays, this.dateRangeStart, this.dateRangeEnd);
    });

    // Helper method to set date range
    setDateRange(days = null, startDate = null, endDate = null) {
        this.dateRangeDays = days || 7;
        this.dateRangeStart = startDate;
        this.dateRangeEnd = endDate;
    }

    async loadData() {
        this.isLoading = true;
        this.loadError = null;

        try {
            console.log("Loading flight data and metadata from GitHub...");

            // Use Promise.allSettled to handle partial failures gracefully
            const results = await Promise.allSettled([
                fetchCSV('bl_arr_all.csv'),
                fetchCSV('bl_dep_all.csv'),
                fetchCSV('bl_arr_SV_all.csv'),
                fetchCSV('bl_dep_SV_all.csv'),
                fetchAircraftMetadata(),
                fetchCSV('airport_metadata.csv')
            ]);

            const [arrivalsResult, departuresResult, arrivalSVResult, departureSVResult, metadataResult, airportMetadataResult] = results;

            // Process results and collect errors
            const errors = [];

            if (arrivalsResult.status === 'fulfilled') {
                this.arrivalsData = transformFlightData(arrivalsResult.value, 'arrival');
            } else {
                errors.push(`Arrivals: ${arrivalsResult.reason?.message || 'Unknown error'}`);
                this.arrivalsData = [];
            }

            if (departuresResult.status === 'fulfilled') {
                this.departuresData = transformFlightData(departuresResult.value, 'departure');
            } else {
                errors.push(`Departures: ${departuresResult.reason?.message || 'Unknown error'}`);
                this.departuresData = [];
            }

            if (arrivalSVResult.status === 'fulfilled') {
                this.arrivalStateVectors = transformStateVectors(arrivalSVResult.value);
            } else {
                errors.push(`Arrival state vectors: ${arrivalSVResult.reason?.message || 'Unknown error'}`);
                this.arrivalStateVectors = [];
            }

            if (departureSVResult.status === 'fulfilled') {
                this.departureStateVectors = transformStateVectors(departureSVResult.value);
            } else {
                errors.push(`Departure state vectors: ${departureSVResult.reason?.message || 'Unknown error'}`);
                this.departureStateVectors = [];
            }

            if (metadataResult.status === 'fulfilled') {
                this.aircraftMetadata = metadataResult.value;
            } else {
                errors.push(`Metadata: ${metadataResult.reason?.message || 'Unknown error'}`);
                this.aircraftMetadata = [];
            }

            if (airportMetadataResult.status === 'fulfilled') {
                this.airportMetadata = airportMetadataResult.value;
            } else {
                errors.push(`Airport Metadata: ${airportMetadataResult.reason?.message || 'Unknown error'}`);
                this.airportMetadata = [];
            }

            console.log(`Loaded ${this.arrivalsData.length} arrivals, ${this.departuresData.length} departures, ${this.aircraftMetadata.length} aircraft metadata, ${this.airportMetadata.length} airport metadata records`);

            // If all requests failed, set a general error
            if (errors.length === results.length) {
                this.loadError = `All data sources failed: ${errors.join('; ')}`;
            } else if (errors.length > 0) {
                // Some succeeded, some failed - log warnings but don't block the UI
                console.warn('Some data sources failed:', errors);
            }
        } catch (error) {
            console.error('Error loading flight data:', error);
            this.loadError = error.message || 'Unknown error occurred while loading data';
        } finally {
            this.isLoading = false;
            this.isProcessing = false;
        }
    }
}

export const flightStore = new FlightStore();
