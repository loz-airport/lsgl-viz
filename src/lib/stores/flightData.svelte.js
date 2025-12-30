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

    isLoading = $state(false);
    loadError = $state(null);
    dateRangeDays = $state(7);
    dateRangeStart = $state(null); // null means use dateRangeDays, otherwise use start/end dates
    dateRangeEnd = $state(null);

    allFlights = $derived.by(() => {
        return combineFlights(this.arrivalsData, this.departuresData);
    });

    // Helper to get flights filtered by days or date range
    getFilteredFlights(days, startDate = null, endDate = null) {
        if (!this.allFlights.length) return [];

        const arrivals = this.allFlights.filter(f => f.flight_type === 'arrival');
        const departures = this.allFlights.filter(f => f.flight_type === 'departure');

        let fArrivals, fDepartures;
        
        if (startDate && endDate) {
            // Filter by date range
            fArrivals = arrivals.filter(f => {
                const date = f.arrival_date;
                if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
                return date >= startDate && date <= endDate;
            });
            fDepartures = departures.filter(f => {
                const date = f.departure_date;
                if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
                return date >= startDate && date <= endDate;
            });
        } else {
            // Filter by number of days
            fArrivals = filterByDateRange(arrivals, days, 'arrival_date');
            fDepartures = filterByDateRange(departures, days, 'departure_date');
        }

        // Join with metadata
        const joined = combineFlights(fArrivals, fDepartures).map(flight => {
            // Convert ICAO24 to string and normalize for comparison
            const flightIcao = flight.ICAO24 ? String(flight.ICAO24).toLowerCase() : null;
            const metadata = this.aircraftMetadata.find(m => {
                // CSV uses ICAO24 (uppercase), but check both cases
                const metaIcao = (m.ICAO24 || m.icao24) ? String(m.ICAO24 || m.icao24).toLowerCase() : null;
                return metaIcao && flightIcao && metaIcao === flightIcao;
            });
            return {
                ...flight,
                metadata: metadata || null
            };
        });

        return joined;
    }

    filteredFlights = $derived.by(() => {
        return this.getFilteredFlights(this.dateRangeDays, this.dateRangeStart, this.dateRangeEnd);
    });

    getDailyCounts(days, startDate = null, endDate = null) {
        const flights = this.getFilteredFlights(days, startDate, endDate);
        if (!flights.length) return [];

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

        // Filter out any entries with invalid dates before returning
        return Object.values(counts)
            .filter(d => d.date instanceof Date && !isNaN(d.date.getTime()))
            .sort((a, b) => a.date - b.date);
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
                fetchAircraftMetadata()
            ]);

            const [arrivalsResult, departuresResult, arrivalSVResult, departureSVResult, metadataResult] = results;

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

            console.log(`Loaded ${this.arrivalsData.length} arrivals, ${this.departuresData.length} departures, ${this.aircraftMetadata.length} metadata records`);

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
        }
    }
}

export const flightStore = new FlightStore();
