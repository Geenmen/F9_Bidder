// -------- HELPER FUNCTIONS --------
document.getElementById("back-btn")?.addEventListener("click", () => {
    window.history.back();
});

function hhmmToMinutes(hhmm) {
    if (!hhmm || hhmm === "Unknown") return 0;
    const [h, m] = hhmm.split(":").map(n => parseInt(n, 10));
    return h * 60 + m;
}

function parseTimeToMinutes(timeStr) {
    if (!timeStr || timeStr === "Unknown") return 0;
    const hourMatch = timeStr.match(/(\d+)h/);
    const minMatch = timeStr.match(/(\d+)m/);
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    return hours * 60 + minutes;
}

function parseHHMMStrToMinutes(str) {
    if (!str) return 0;
    const digits = str.replace(/:/g, "").replace(/\D/g, "");
    if (digits.length < 3) return 0;
    const h = parseInt(digits.slice(0, -2), 10);
    const m = parseInt(digits.slice(-2), 10);
    return h * 60 + m;
}

// -------- MAIN FILTER LOGIC --------
const data = JSON.parse(sessionStorage.getItem("organizedData") || "[]");
console.log("Loaded into filter:", data.length, "entries");

document.getElementById("apply-filters-btn").addEventListener("click", () => {
    const minCreditMins = parseHHMMStrToMinutes(document.getElementById("credit-min").value.trim()) || 0;
    const maxCreditMins = parseHHMMStrToMinutes(document.getElementById("credit-max").value.trim()) || Infinity;
    const maxTAFBMins = parseHHMMStrToMinutes(document.getElementById("tafb-max").value.trim()) || Infinity;

    const earliestOnMins = hhmmToMinutes(document.getElementById("duty-on-earliest").value) || 0;
    const latestOffMins = hhmmToMinutes(document.getElementById("duty-off-latest").value) || Infinity;

    const maxLegs = parseInt(document.getElementById("max-legs").value, 10) || Infinity;

    const daysOff = (document.getElementById("days-off").value || "")
        .split(",").map(s => s.trim()).filter(Boolean);
    const removeRoutes = (document.getElementById("remove-routes").value || "")
        .split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    const allowRoutes = (document.getElementById("allow-routes").value || "")
        .split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

    // Step 1: Explode pairings into daily instances
    const exploded = data.flatMap(pairing =>
        pairing.pairingDates.map(date => {
            const startMins = hhmmToMinutes(pairing.shiftStartTime);
            const tafbMins = parseTimeToMinutes(pairing.tafb);
            const totalDuration = startMins + tafbMins;
            const calendarDaysUsed = Math.min(Math.max(Math.ceil(totalDuration / 1440), 1), 6);

            return {
                ...pairing,
                pairingDate: date,
                calendarDaysUsed
            };
        })
    );

    console.log("Exploded pairings:", exploded.length);

    // Step 2: Apply filters to each instance
    const filtered = exploded.filter(entry => {
        const creditMins = parseTimeToMinutes(entry.credit);
        const tafbMins = parseTimeToMinutes(entry.tafb);
        const onMins = hhmmToMinutes(entry.shiftStartTime);
        const offMins = hhmmToMinutes(entry.dayEndTime);

        if (creditMins < minCreditMins || creditMins > maxCreditMins) return false;
        if (tafbMins > maxTAFBMins) return false;
        if (onMins < earliestOnMins || offMins > latestOffMins) return false;
        if (entry.travelRoute.length > maxLegs) return false;
        if (daysOff.includes(entry.pairingDate)) return false;
        if (removeRoutes.some(r => entry.travelRoute.includes(r))) return false;
        if (allowRoutes.length && !allowRoutes.some(r => entry.travelRoute.includes(r))) return false;

        return true;
    });

    console.log("Filtered pairings:", filtered.length);

    sessionStorage.setItem("filteredData", JSON.stringify(filtered));
    document.getElementById("filter-summary").textContent =
        `${filtered.length} pairings match your filters.`;

    window.location.href = "results.html";
});
