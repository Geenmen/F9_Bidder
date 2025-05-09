// js/upload.js

// -------- UTILITY FUNCTIONS ---------

/**
 * Split the raw text by divider and return each pairing block.
 */
function extractEntries(content) {
    const divider = "========================================================================";
    const sections = content.split(divider);
    return sections.slice(1)
        .map(section => section.trim())
        .filter(entry => entry.length > 0);
}

/**
 * Skip over header blocks that aren’t real pairings.
 */
function isHeader(section) {
    const headerIndicators = ["DPS-ARS", "DAY", "TBLK", "EQP"];
    return headerIndicators.some(indicator => section.includes(indicator));
}

/**
 * Heuristically grab the “days” string after the Base…(…) segment.
 */
function extractCalendarDaysHeuristically(entry) {
    const baseLineIndex = entry.indexOf("Base :");
    if (baseLineIndex === -1) return "";
    const baseCloseParenIndex = entry.indexOf(")", baseLineIndex);
    if (baseCloseParenIndex === -1) return "";
    let calendarSection = entry.substring(baseCloseParenIndex + 1);
    const stopPatterns = [
        /^[A-Z]{2}\s+\d{4}\b/m,  // e.g. "SU 3679"
        /^D-END:/m,
        /^TOTALS/m,
        /LDGS:/,
        /TRIP RIG:/,
    ];
    for (const pattern of stopPatterns) {
        const match = calendarSection.search(pattern);
        if (match !== -1) calendarSection = calendarSection.substring(0, match);
    }
    return calendarSection.replace(/\n/g, " ").trim();
}

/**
 * Ignore tokens like “0” or ones preceded by invalid markers.
 */
function isInvalidContext(token, section, invalidIndicators) {
    const lower = section.toLowerCase();
    if (token === "0") return true;
    return invalidIndicators.some(ind => lower.includes(`${ind.toLowerCase()} ${token}`));
}

/**
 * Parse that days-string into an array of day-numbers.
 */
function extractActiveDays(daysSection) {
    const invalidIndicators = ["LDGS:", "TRIP", "RIG:", "DHD", "TBD"];
    const tokens = daysSection.split(/\s+/);
    const validDays = [];
    let seenFirst = false;
    for (const t of tokens) {
        if (t === "--") continue;
        if (isInvalidContext(t, daysSection, invalidIndicators)) continue;
        const n = parseInt(t, 10);
        if (!isNaN(n)) {
            if (n === 1) {
                if (!seenFirst) { seenFirst = true; validDays.push("1"); }
            } else if (n >= 2 && n <= 31) {
                seenFirst = true;
                validDays.push(String(n));
            }
        }
    }
    return [...new Set(validDays)];
}

/**  
 * Helpers to format raw times/credits/TAFB into “HH:mm” or “Xh Ym”  
 */
function formatTime(timeRaw) {
    if (timeRaw === "Unknown") return "Unknown";
    const t = timeRaw.replace("L", "").trim();
    return `${t.slice(0, 2)}:${t.slice(2)}`;
}
function formatCredit(raw) {
    if (raw === "Unknown") return "Unknown";
    const c = parseInt(raw, 10);
    if (isNaN(c)) return "Unknown";
    return `${Math.floor(c / 100)}h ${c % 100}m`;
}
function formatTAFB(raw) {
    if (raw === "Unknown") return "Unknown";
    const t = parseInt(raw, 10);
    if (isNaN(t)) return "Unknown";
    return `${Math.floor(t / 100)}h ${t % 100}m`;
}

/**
 * Take each raw entry and build a clean JS object.
 */
function organizeEntryData(entries) {
    return entries
        .filter(e => !isHeader(e))
        .map(entry => {
            const pnM = entry.match(/^O[A-Z0-9]+/);
            const pairingNumber = pnM ? pnM[0] : "Unknown";

            const ssM = entry.match(/BASE REPT: (\d{4}L)/);
            const shiftStartTime = formatTime(ssM ? ssM[1] : "Unknown");

            const deM = entry.match(/D-END: (\d{4}L)/);
            const dayEndTime = formatTime(deM ? deM[1] : "Unknown");

            const baseM = entry.match(/Base : (\w{3})/);
            const baseAirport = baseM ? baseM[1] : "Unknown";

            const routes = [...entry.matchAll(/\b([A-Z]{3}-[A-Z]{3})\b/g)]
                .map(m => m[1]);

            const daysSect = extractCalendarDaysHeuristically(entry);
            const pairingDates = extractActiveDays(daysSect);

            const cM = entry.match(/CDT (\d{3,4}) T\.A\.F\.B\./);
            const credit = formatCredit(cM ? cM[1] : "Unknown");

            const tM = entry.match(/T\.A\.F\.B\. (\d+)/);
            const tafb = formatTAFB(tM ? tM[1] : "Unknown");

            return { pairingNumber, shiftStartTime, dayEndTime, baseAirport, travelRoute: routes, pairingDates, credit, tafb };
        });
}

// -------- UPLOAD STAGE LOGIC --------

document.getElementById("file-input").addEventListener("change", evt => {
    const file = evt.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const text = e.target.result;
        const rawEntries = extractEntries(text);
        const totalRaw = rawEntries.length;
        const organized = organizeEntryData(rawEntries);
        const loadedCount = organized.length;
        const skippedCount = totalRaw - loadedCount;

        sessionStorage.setItem("organizedData", JSON.stringify(organized));
        console.log("Stored", organized.length, "entries:", sessionStorage.getItem("organizedData"));


        document.getElementById("processed-preview").textContent =
            `${loadedCount} pairings loaded.` +
            (skippedCount > 0 ? ` (${skippedCount} skipped due to headers/errors)` : "");
        document.getElementById("next-btn").disabled = false;
    };
    reader.readAsText(file);
});

document.getElementById("next-btn").addEventListener("click", () => {
    window.location.href = "filter.html";
});
