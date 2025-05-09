// js/filter.js

// -------- HELPER FUNCTIONS --------

document.getElementById("back-btn")?.addEventListener("click", () => {
    window.history.back(); // or window.location.href = "filter.html";
});




/**
 * Convert "HH:mm" (from a time-type input) into total minutes.
 */
function hhmmToMinutes(hhmm) {
    if (!hhmm || hhmm === "Unknown") return 0;
    const [h, m] = hhmm.split(":").map(n => parseInt(n, 10));
    return h * 60 + m;
}

/**
 * Convert "Xh Ym" (e.g. "5h 30m") into total minutes.
 */
function parseTimeToMinutes(timeStr) {
    if (!timeStr || timeStr === "Unknown") return 0;
    const hourMatch = timeStr.match(/(\d+)h/);
    const minMatch = timeStr.match(/(\d+)m/);
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    return hours * 60 + minutes;
}

/**
 * Parse an hhmm string (e.g. "0530" or "05:30") into total minutes.
 */
function parseHHMMStrToMinutes(str) {
    if (!str) return 0;
    const digits = str.replace(/:/g, "").replace(/\D/g, "");
    if (digits.length < 3) return 0;
    const h = parseInt(digits.slice(0, -2), 10);
    const m = parseInt(digits.slice(-2), 10);
    return h * 60 + m;
}

// -------- MAIN FILTER LOGIC --------

// Load parsed pairings
const data = JSON.parse(sessionStorage.getItem("organizedData") || "[]");

// Show how many carried over
console.log("Loaded into filter:", data.length, "entries");

document.getElementById("apply-filters-btn").addEventListener("click", () => {
    // — Daily Filters —
    const minCreditInput = document.getElementById("credit-min").value.trim();
    const maxCreditInput = document.getElementById("credit-max").value.trim();
    const tafbMaxInput = document.getElementById("tafb-max").value.trim();

    const minCreditMins = minCreditInput
        ? parseHHMMStrToMinutes(minCreditInput)
        : 0;
    const maxCreditMins = maxCreditInput
        ? parseHHMMStrToMinutes(maxCreditInput)
        : Infinity;
    const maxTAFBMins = tafbMaxInput
        ? parseHHMMStrToMinutes(tafbMaxInput)
        : Infinity;

    const earliestOnVal = document.getElementById("duty-on-earliest").value;
    const latestOffVal = document.getElementById("duty-off-latest").value;
    const maxLegs = parseInt(document.getElementById("max-legs").value, 10) || Infinity;

    const earliestOnMins = earliestOnVal ? hhmmToMinutes(earliestOnVal) : 0;
    const latestOffMins = latestOffVal ? hhmmToMinutes(latestOffVal) : Infinity;

    // — Monthly Filters —
    const daysOff = (document.getElementById("days-off").value || "")
        .split(",").map(s => s.trim()).filter(Boolean);
    const removeRoutes = (document.getElementById("remove-routes").value || "")
        .split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    const allowRoutes = (document.getElementById("allow-routes").value || "")
        .split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

    // Filter entries
    const filtered = data.filter(entry => {
        // Daily: Credit
        const creditMins = parseTimeToMinutes(entry.credit);
        if (creditMins < minCreditMins || creditMins > maxCreditMins) return false;

        // Daily: TAFB
        const tafbMins = parseTimeToMinutes(entry.tafb);
        if (tafbMins > maxTAFBMins) return false;

        // Daily: On/Off times
        const onMins = hhmmToMinutes(entry.shiftStartTime);
        const offMins = hhmmToMinutes(entry.dayEndTime);
        if (onMins < earliestOnMins || offMins > latestOffMins) return false;

        // Daily: Max legs
        if (entry.travelRoute.length > maxLegs) return false;

        // Monthly: Days Off
        if (daysOff.some(d => entry.pairingDates.includes(d))) return false;

        // Monthly: Remove routes
        if (removeRoutes.some(r => entry.travelRoute.includes(r))) return false;

        // Monthly: Allow only routes
        if (allowRoutes.length && !allowRoutes.some(r => entry.travelRoute.includes(r))) return false;

        return true;
    });

    // Store & navigate
    sessionStorage.setItem("filteredData", JSON.stringify(filtered));
    document.getElementById("filter-summary").textContent =
        `${filtered.length} pairings match your filters.`;
    window.location.href = "results.html";
});
