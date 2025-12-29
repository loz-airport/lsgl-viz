/**
 * Svelte store for managing flight data state using Svelte 5 runes
 */

import {
    fetchCSV,
    transformFlightData,
    transformStateVectors,
    filterByDateRange,
    combineFlights
} from '../utils/dataLoader.js';

class FlightStore {
    arrivalsData = $state([]);
    departuresData = $state([]);
    arrivalStateVectors = $state([]);
    departureStateVectors = $state([]);

    isLoading = $state(false);
    loadError = $state(null);
    dateRangeDays = $state(7);

    allFlights = $derived.by(() => {
        return combineFlights(this.arrivalsData, this.departuresData);
    });

    filteredFlights = $derived.by(() => {
        if (!this.allFlights.length) return [];

        const arrivals = this.allFlights.filter(f => f.flight_type === 'arrival');
        const departures = this.allFlights.filter(f => f.flight_type === 'departure');

        const fArrivals = filterByDateRange(arrivals, this.dateRangeDays, 'arrival_date');
        const fDepartures = filterByDateRange(departures, this.dateRangeDays, 'departure_date');

        return combineFlights(fArrivals, fDepartures);
    });

    dailyFlightCounts = $derived.by(() => {
        if (!this.filteredFlights.length) return [];

        const counts = {};

        this.filteredFlights.forEach(flight => {
            const date = flight.flight_type === 'arrival'
                ? flight.arrival_date?.toISOString().split('T')[0]
                : flight.departure_date?.toISOString().split('T')[0];

            if (!date) return;

            if (!counts[date]) {
                counts[date] = { date: new Date(date), arrivals: 0, departures: 0 };
            }

            if (flight.flight_type === 'arrival') {
                counts[date].arrivals++;
            } else {
                counts[date].departures++;
            }
        });

        return Object.values(counts).sort((a, b) => a.date - b.date);
    });

    async loadData() {
        this.isLoading = true;
        this.loadError = null;

        try {
            console.log("Loading flight data from GitHub...");
            const [arrivalsRaw, departuresRaw, arrivalSVRaw, departureSVRaw] = await Promise.all([
                fetchCSV('bl_arr_all.csv'),
                fetchCSV('bl_dep_all.csv'),
                fetchCSV('bl_arr_SV_all.csv'),
                fetchCSV('bl_dep_SV_all.csv')
            ]);

            this.arrivalsData = transformFlightData(arrivalsRaw, 'arrival');
            this.departuresData = transformFlightData(departuresRaw, 'departure');
            this.arrivalStateVectors = transformStateVectors(arrivalSVRaw);
            this.departureStateVectors = transformStateVectors(departureSVRaw);

            console.log(`Loaded ${this.arrivalsData.length} arrivals, ${this.departuresData.length} departures`);
        } catch (error) {
            console.error('Error loading flight data:', error);
            this.loadError = error.message;
        } finally {
            this.isLoading = false;
        }
    }
}

export const flightStore = new FlightStore();
