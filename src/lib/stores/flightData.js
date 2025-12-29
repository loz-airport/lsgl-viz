/**
 * Svelte store for managing flight data state
 */

import { writable, derived } from 'svelte/store';
import {
    fetchCSV,
    transformFlightData,
    transformStateVectors,
    filterByDateRange,
    combineFlights
} from '../utils/dataLoader.js';

// Store for raw data
export const arrivalsData = writable([]);
export const departuresData = writable([]);
export const arrivalStateVectors = writable([]);
export const departureStateVectors = writable([]);

// Store for loading state
export const isLoading = writable(false);
export const loadError = writable(null);

// Store for selected date range (in days)
export const dateRangeDays = writable(7);

// Derived store for combined flights
export const allFlights = derived(
    [arrivalsData, departuresData],
    ([$arrivalsData, $departuresData]) => {
        return combineFlights($arrivalsData, $departuresData);
    }
);

// Derived store for filtered flights by date range
export const filteredFlights = derived(
    [allFlights, dateRangeDays],
    ([$allFlights, $dateRangeDays]) => {
        if (!$allFlights.length) return [];

        const arrivals = $allFlights.filter(f => f.flight_type === 'arrival');
        const departures = $allFlights.filter(f => f.flight_type === 'departure');

        const filteredArrivals = filterByDateRange(arrivals, $dateRangeDays, 'arrival_date');
        const filteredDepartures = filterByDateRange(departures, $dateRangeDays, 'departure_date');

        return combineFlights(filteredArrivals, filteredDepartures);
    }
);

// Derived store for daily flight counts
export const dailyFlightCounts = derived(
    filteredFlights,
    ($filteredFlights) => {
        if (!$filteredFlights.length) return [];

        const counts = {};

        $filteredFlights.forEach(flight => {
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
    }
);

/**
 * Load all flight data from GitHub
 */
export async function loadFlightData() {
    isLoading.set(true);
    loadError.set(null);

    try {
        // Load all CSV files in parallel
        const [arrivalsRaw, departuresRaw, arrivalSVRaw, departureSVRaw] = await Promise.all([
            fetchCSV('bl_arr_all.csv'),
            fetchCSV('bl_dep_all.csv'),
            fetchCSV('bl_arr_SV_all.csv'),
            fetchCSV('bl_dep_SV_all.csv')
        ]);

        // Transform the data
        const arrivals = transformFlightData(arrivalsRaw, 'arrival');
        const departures = transformFlightData(departuresRaw, 'departure');
        const arrivalSV = transformStateVectors(arrivalSVRaw);
        const departureSV = transformStateVectors(departureSVRaw);

        // Update stores
        arrivalsData.set(arrivals);
        departuresData.set(departures);
        arrivalStateVectors.set(arrivalSV);
        departureStateVectors.set(departureSV);

        console.log(`Loaded ${arrivals.length} arrivals, ${departures.length} departures`);
        console.log(`Loaded ${arrivalSV.length} arrival state vectors, ${departureSV.length} departure state vectors`);

    } catch (error) {
        console.error('Error loading flight data:', error);
        loadError.set(error.message);
    } finally {
        isLoading.set(false);
    }
}
