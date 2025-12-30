/**
 * Utility functions for loading and transforming flight data from GitHub
 */

import Papa from 'papaparse';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/loz-airport/LSGL_tracker/master/data_raw';
const FETCH_TIMEOUT = 30000; // 30 seconds

/**
 * Fetch with timeout
 * @param {string} url - URL to fetch
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(url, timeout = FETCH_TIMEOUT) {
	return Promise.race([
		fetch(url),
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
		)
	]);
}

/**
 * Fetch and parse a CSV file from GitHub
 * @param {string} filename - Name of the CSV file to fetch
 * @returns {Promise<Array>} Parsed CSV data as array of objects
 */
export async function fetchCSV(filename) {
	const url = `${GITHUB_RAW_BASE}/${filename}`;

	try {
		console.log(`Fetching ${filename}...`);
		const response = await fetchWithTimeout(url);
		
		if (!response.ok) {
			throw new Error(`Failed to fetch ${filename}: ${response.status} ${response.statusText}`);
		}

		const csvText = await response.text();

		return new Promise((resolve, reject) => {
			Papa.parse(csvText, {
				header: true,
				dynamicTyping: true,
				skipEmptyLines: true,
				complete: (results) => {
					console.log(`Successfully parsed ${filename}: ${results.data.length} rows`);
					resolve(results.data);
				},
				error: (error) => {
					reject(new Error(`Failed to parse CSV ${filename}: ${error.message}`));
				}
			});
		});
	} catch (error) {
		console.error(`Error fetching CSV ${filename}:`, error);
		throw error;
	}
}

/**
 * Transform flight data by parsing dates and times
 * @param {Array} data - Raw flight data from CSV
 * @param {string} type - 'arrival' or 'departure'
 * @returns {Array} Transformed flight data
 */
export function transformFlightData(data, type) {
	return data.map(row => ({
		...row,
		departure_time: row.departure_time ? new Date(row.departure_time) : null,
		arrival_time: row.arrival_time ? new Date(row.arrival_time) : null,
		departure_date: row.departure_date ? new Date(row.departure_date) : null,
		arrival_date: row.arrival_date ? new Date(row.arrival_date) : null,
		flight_type: type
	}));
}

/**
 * Transform state vector data by parsing timestamps
 * @param {Array} data - Raw state vector data from CSV
 * @returns {Array} Transformed state vector data
 */
export function transformStateVectors(data) {
	return data.map(row => ({
		...row,
		requested_time: row.requested_time ? new Date(row.requested_time * 1000) : null,
		arrival_date: row.arrival_date ? new Date(row.arrival_date) : null,
		departure_date: row.departure_date ? new Date(row.departure_date) : null
	}));
}

/**
 * Filter data by date range (last N days)
 * @param {Array} data - Flight data to filter
 * @param {number} days - Number of days to include
 * @param {string} dateField - Field name to filter by ('departure_date' or 'arrival_date')
 * @returns {Array} Filtered data
 */
export function filterByDateRange(data, days = 7, dateField = 'departure_date') {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - days);
	cutoffDate.setHours(0, 0, 0, 0);

	return data.filter(row => {
		const date = row[dateField];
		// Check if date is valid
		if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
			return false;
		}
		return date >= cutoffDate;
	});
}

/**
 * Combined flight data
 * @param {Array} arrivals - Arrival flight data
 * @param {Array} departures - Departure flight data
 * @returns {Array} Combined flight data
 */
export function combineFlights(arrivals, departures) {
	return [...arrivals, ...departures].sort((a, b) => {
		const dateA = a.departure_date || a.arrival_date;
		const dateB = b.departure_date || b.arrival_date;
		return dateA - dateB;
	});
}

/**
 * Fetch aircraft metadata from GitHub
 * @returns {Promise<Array>} Parsed CSV data
 */
export async function fetchAircraftMetadata() {
	const url = 'https://raw.githubusercontent.com/loz-airport/LSGL_tracker/refs/heads/master/data_raw/aircraft_metadata.csv';

	try {
		console.log('Fetching aircraft metadata...');
		const response = await fetchWithTimeout(url);
		
		if (!response.ok) {
			throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
		}

		const csvText = await response.text();

		return new Promise((resolve, reject) => {
			Papa.parse(csvText, {
				header: true,
				dynamicTyping: true,
				skipEmptyLines: true,
				complete: (results) => {
					console.log(`Successfully parsed metadata: ${results.data.length} rows`);
					resolve(results.data);
				},
				error: (error) => {
					reject(new Error(`Failed to parse metadata CSV: ${error.message}`));
				}
			});
		});
	} catch (error) {
		console.error(`Error fetching aircraft metadata:`, error);
		return []; // Return empty if failed
	}
}
