/********************************************************
Encryption
 ********************************************************/
async function checkID() {
    const idInput = document.getElementById("employee-id").value.trim();
    const errorEl = document.getElementById("error-message");

    if (!idInput) {
        errorEl.textContent = "Please enter an ID.";
        return;
    }

    // Hash the user’s input
    const hashed = sha256(idInput);

    // Check if this hash is in the monthRules object
    if (monthRules.hasOwnProperty(hashed)) {
        // If so, get the array of allowed months
        const allowedMonths = monthRules[hashed];

        // Get the current month (1=Jan, 2=Feb, ..., 12=Dec)
        const currentMonth = new Date().getMonth() + 1;

        // See if currentMonth is in the array
        if (allowedMonths.includes(currentMonth)) {
            // success
            grantAccess();
        } else {
            errorEl.textContent = "Access denied. Your ID is not valid for this month.";
        }
    } else {
        // If hash not in monthRules, either user is invalid
        // or you can handle "unlimited" IDs here if you like
        errorEl.textContent = "Invalid ID. Access denied.";
    }
}

function grantAccess() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-screen").classList.remove("hidden");
}


// On load, add event listener to the button
document.getElementById("login-btn").addEventListener("click", checkID);



/********************************************************
 * 1) UTILITY & HELPER FUNCTIONS
 ********************************************************/

// Convert a time string in "HH:mm" to total minutes
function hhmmToMinutes(hhmm) {
    if (!hhmm || hhmm === "Unknown") return 0;
    const [hours, minutes] = hhmm.split(":").map(n => parseInt(n, 10));
    return hours * 60 + minutes;
}

// Convert "Xh Ym" format (e.g., "5h 30m") to total minutes
function parseTimeToMinutes(timeStr) {
    if (!timeStr || timeStr === "Unknown") return 0;
    const hourMatch = timeStr.match(/(\d+)h/);
    const minMatch = timeStr.match(/(\d+)m/);
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    return hours * 60 + minutes;
}

// Convert "HHmmL" or "HHmm" to "HH:mm"
function formatTime(timeRaw) {
    if (timeRaw === "Unknown") return "Unknown";
    const time = timeRaw.replace("L", "").trim(); // remove any trailing "L"
    const hours = time.slice(0, 2);
    const minutes = time.slice(2);
    return `${hours}:${minutes}`;
}

// Format T.A.F.B. "####" to "Xh Ym"
function formatTAFB(tafbRaw) {
    if (tafbRaw === "Unknown") return "Unknown";
    const tafb = parseInt(tafbRaw, 10);
    if (isNaN(tafb)) return "Unknown";
    const hours = Math.floor(tafb / 100);
    const minutes = tafb % 100;
    return `${hours}h ${minutes}m`;
}

// Format credit "####" to "Xh Ym"
function formatCredit(creditRaw) {
    if (creditRaw === "Unknown") return "Unknown";
    const credit = parseInt(creditRaw, 10);
    if (isNaN(credit)) return "Unknown";
    const hours = Math.floor(credit / 100);
    const minutes = credit % 100;
    return `${hours}h ${minutes}m`;
}

// Detect if a section is a header block
function isHeader(section) {
    const headerIndicators = ["DPS-ARS", "DAY", "TBLK", "EQP"];
    return headerIndicators.some(indicator => section.includes(indicator));
}

// Check if a token is part of an invalid context (for day extraction)
function isInvalidContext(token, section, invalidIndicators) {
    const lowerSection = section.toLowerCase();
    // If token is 0, invalid
    if (token === "0") return true;
    // Check for invalid indicators near the number
    if (invalidIndicators.some(indicator => lowerSection.includes(`${indicator.toLowerCase()} ${token}`))) {
        return true;
    }
    return false;
}

// General-purpose string-to-minutes converter for filters (e.g., "HH:mm")
function convertToMinutes(timeStr) {
    const hours = parseInt(timeStr.slice(0, 2), 10);
    const minutes = parseInt(timeStr.slice(-2), 10);
    return hours * 60 + minutes;
}


/********************************************************
 * 2) DATA EXTRACTION & ORGANIZATION
 ********************************************************/

// Extract schedule entries from file content using the known divider
function extractEntries(content) {
    const divider = "========================================================================";
    const sections = content.split(divider);
    // Ignore the first section (header) and return all valid entries
    return sections.slice(1)
        .map(section => section.trim())
        .filter(entry => entry.length > 0);
}

// Display raw extracted entries (for debugging)
function displayEntries(entries) {
    const dataExtractionSection = document.getElementById("data-extraction");
    const outputDiv = document.createElement("div");
    outputDiv.id = "extracted-data";
    outputDiv.style.border = "1px solid #ccc";
    outputDiv.style.marginTop = "20px";
    outputDiv.style.padding = "10px";
    outputDiv.style.backgroundColor = "#f9f9f9";
    outputDiv.innerHTML = `<h3>Extracted Entries</h3>`;

    entries.forEach((entry, index) => {
        const entryDiv = document.createElement("div");
        entryDiv.style.marginBottom = "10px";
        entryDiv.innerHTML = `<strong>Entry ${index + 1}:</strong><pre>${entry}</pre>`;
        outputDiv.appendChild(entryDiv);
    });

    // Remove old data if present and append the new
    const existingData = document.getElementById("extracted-data");
    if (existingData) existingData.remove();
    dataExtractionSection.appendChild(outputDiv);
}

// Organize each entry into a structured data object
function organizeEntryData(entries) {
    return entries
        .filter(entry => !isHeader(entry))
        .map(entry => {
            const pairingMatch = entry.match(/^O[A-Z0-9]+/);
            const pairingNumber = pairingMatch ? pairingMatch[0] : "Unknown";

            const shiftStartMatch = entry.match(/BASE REPT: (\d{4}L)/);
            const shiftStartRaw = shiftStartMatch ? shiftStartMatch[1] : "Unknown";
            const shiftStartTime = formatTime(shiftStartRaw);

            const dEndMatch = entry.match(/D-END: (\d{4}L)/);
            const dayEndTimeRaw = dEndMatch ? dEndMatch[1] : "Unknown";
            const dayEndTimeFormatted = formatTime(dayEndTimeRaw);

            const baseMatch = entry.match(/Base : (\w{3})/);
            const baseAirport = baseMatch ? baseMatch[1] : "Unknown";

            const routeMatches = [...entry.matchAll(/\b([A-Z]{3}-[A-Z]{3})\b/g)];
            const travelRoute = routeMatches.map(match => match[1]);

            const daysSection = extractCalendarDaysHeuristically(entry);
            const pairingDates = extractActiveDays(daysSection);
            // renamed 'activeDays' => 'pairingDates'

            // Extract and format credit
            const creditMatch = entry.match(/CDT (\d{3,4}) T\.A\.F\.B\./);
            const creditRaw = creditMatch ? creditMatch[1] : "Unknown";
            const creditFormatted = formatCredit(creditRaw);

            // Extract and format T.A.F.B.
            const tafbMatch = entry.match(/T\.A\.F\.B\. (\d+)/);
            const tafbRaw = tafbMatch ? tafbMatch[1] : "Unknown";
            const tafbFormatted = formatTAFB(tafbRaw);

            return {
                pairingNumber,
                shiftStartTime,
                dayEndTime: dayEndTimeFormatted,
                baseAirport,
                travelRoute,
                // we store them as 'pairingDates' in the object, 
                // but the old code references .activeDays => we'll rename references below
                pairingDates,
                credit: creditFormatted,
                tafb: tafbFormatted,
            };
        });
}

// Display the organized data in the UI
function displayOrganizedData(entries) {
    const organizedData = organizeEntryData(entries);
    const dataExtractionSection = document.getElementById("data-extraction");

    const outputDiv = document.createElement("div");
    outputDiv.id = "organized-data";
    outputDiv.style.border = "1px solid #ccc";
    outputDiv.style.marginTop = "20px";
    outputDiv.style.padding = "10px";
    outputDiv.style.backgroundColor = "#e8f7f9";
    outputDiv.innerHTML = `<h3>Organized Data</h3>`;

    organizedData.forEach((data, index) => {
        const dataDiv = document.createElement("div");
        dataDiv.style.marginBottom = "10px";
        dataDiv.innerHTML = `
            <strong>Entry ${index + 1}:</strong>
            <ul>
                <li><strong>Pairing Number:</strong> ${data.pairingNumber}</li>
                <li><strong>Shift Start Time:</strong> ${data.shiftStartTime}</li>
                <li><strong>Day End Time:</strong> ${data.dayEndTime}</li>
                <li><strong>Base Airport:</strong> ${data.baseAirport}</li>
                <li><strong>Travel Route:</strong> ${data.travelRoute.join(", ")}</li>
                <li><strong>Dates of Pairing:</strong> ${data.pairingDates.join(", ")}</li>
                <li><strong>Credit:</strong> ${data.credit}</li>
                <li><strong>T.A.F.B.:</strong> ${data.tafb}</li>
            </ul>`;
        outputDiv.appendChild(dataDiv);
    });

    const existingData = document.getElementById("organized-data");
    if (existingData) existingData.remove();
    dataExtractionSection.appendChild(outputDiv);
}

/**
 * Below are additional helpers specifically for day extraction
 */

// Heuristic approach to extract calendar days
function extractCalendarDaysHeuristically(entry) {
    // 1. Find the line containing "Base :" and the first closing parenthesis
    const baseLineIndex = entry.indexOf("Base :");
    if (baseLineIndex === -1) return "";

    const baseCloseParenIndex = entry.indexOf(")", baseLineIndex);
    if (baseCloseParenIndex === -1) return "";

    // Extract everything after the closing parenthesis
    let calendarSection = entry.substring(baseCloseParenIndex + 1);

    // Known end patterns (stop points)
    const stopPatterns = [
        /^[A-Z]{2}\s+\d{4}\b/m,  // e.g. "SU 3679"
        /^D-END:/m,
        /^TOTALS/m,
        /LDGS:/,
        /TRIP RIG:/,
    ];
    for (const pattern of stopPatterns) {
        const match = calendarSection.search(pattern);
        if (match !== -1 && match >= 0) {
            calendarSection = calendarSection.substring(0, match);
        }
    }

    // Normalize newlines
    calendarSection = calendarSection.replace(/\n/g, " ");
    return calendarSection.trim();
}

// We rename from 'extractActiveDays' to 'extractActiveDays' => 'extractPairingDates'
// but we'll just keep the function name for minimal changes, 
// and rename the returned data in the final object
function extractActiveDays(daysSection) {
    const invalidIndicators = ["LDGS:", "TRIP", "RIG:", "DHD", "TBD"];
    const tokens = daysSection.split(/\s+/);

    const validDays = [];
    let firstNumberFound = false;

    for (const token of tokens) {
        if (token === "--") continue;
        if (isInvalidContext(token, daysSection, invalidIndicators)) continue;

        const dayNum = parseInt(token, 10);
        if (!isNaN(dayNum)) {
            // Special case for day "1"
            if (dayNum === 1) {
                if (!firstNumberFound) {
                    firstNumberFound = true;
                    validDays.push(String(dayNum));
                }
                continue;
            }
            // For other days
            if (dayNum >= 2 && dayNum <= 31) {
                firstNumberFound = true;
                validDays.push(String(dayNum));
            }
        }
    }
    // Remove duplicates
    return [...new Set(validDays)];
}


/********************************************************
 * 3) FILTERING & DISPLAY
 ********************************************************/

// Apply filters directly and display the results
function applyFilters() {
    const file = document.getElementById("file-input").files[0];
    if (!file) {
        alert("Please upload a file before applying filters.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const fileContent = e.target.result;

        // Extract and organize
        const entries = extractEntries(fileContent);
        const organizedData = organizeEntryData(entries);

        // Read user filter inputs
        const creditMin = parseInt(document.getElementById("credit-min").value, 10) || 0;
        const creditMax = parseInt(document.getElementById("credit-max").value, 10) || Infinity;
        const tafbMax = parseInt(document.getElementById("tafb-max").value, 10) || Infinity;

        // We remove the "omit-bases" from the filters
        // So the code referencing it is removed
        // Also no "avoid base" logic

        const omitDays = (document.getElementById("omit-days").value || "")
            .split(",").map(day => day.trim());
        const omitRoutes = (document.getElementById("omit-routes").value || "")
            .split(",").map(route => route.trim().toUpperCase());

        const earliestStartTime = document.getElementById("start-time").value || null;

        // Filter the pairings
        const filteredData = organizedData.filter(entry => {
            // Convert "Xh Ym" to hours => compare
            const creditHours = parseInt(entry.credit.split("h")[0], 10);
            if (creditHours < creditMin || creditHours > creditMax) return false;

            // T.A.F.B. => minutes => compare
            const tafbParts = entry.tafb.split(/[hm]/).map(part => part.trim());
            const tafbHours = parseInt(tafbParts[0], 10) || 0;
            const tafbMinutes = parseInt(tafbParts[1] || "0", 10);
            const totalTafbMinutes = tafbHours * 60 + tafbMinutes;
            if (totalTafbMinutes > tafbMax * 60) return false;

            // Earliest start time
            if (earliestStartTime) {
                const filterTime = convertToMinutes(earliestStartTime.replace(":", ""));
                const entryTime = convertToMinutes(entry.shiftStartTime.replace(":", ""));
                if (entryTime < filterTime) return false;
            }

            // Filter by "Dates of Pairing"
            // (which was "activeDays" before)
            if (omitDays.some(day => entry.pairingDates.includes(day))) return false;

            // Filter by travel routes
            if (omitRoutes.some(route => entry.travelRoute.includes(route))) return false;

            return true;
        });

        displayFilteredData(filteredData);
    };

    reader.readAsText(file);
}

// Display filtered data on the UI
function displayFilteredData(filteredData) {
    const filtersSection = document.getElementById("filters");
    const outputDiv = document.createElement("div");
    outputDiv.id = "filtered-data";
    outputDiv.style.border = "1px solid #ccc";
    outputDiv.style.marginTop = "20px";
    outputDiv.style.padding = "10px";
    outputDiv.style.backgroundColor = "#f1f1f1";
    outputDiv.innerHTML = `<h3>Filtered Data</h3>`;

    if (filteredData.length === 0) {
        outputDiv.innerHTML += `<p>No pairings match the filter criteria.</p>`;
    } else {
        filteredData.forEach((data, index) => {
            const dataDiv = document.createElement("div");
            dataDiv.style.marginBottom = "10px";
            dataDiv.innerHTML = `
                <strong>Entry ${index + 1}:</strong>
                <ul>
                    <li><strong>Pairing Number:</strong> ${data.pairingNumber}</li>
                    <li><strong>Shift Start Time:</strong> ${data.shiftStartTime}</li>
                    <li><strong>Base Airport:</strong> ${data.baseAirport}</li>
                    <li><strong>Travel Route:</strong> ${data.travelRoute.join(", ")}</li>
                    <li><strong>Dates of Pairing:</strong> ${data.pairingDates.join(", ")}</li>
                    <li><strong>Credit:</strong> ${data.credit}</li>
                    <li><strong>T.A.F.B.:</strong> ${data.tafb}</li>
                </ul>`;
            outputDiv.appendChild(dataDiv);
        });
    }

    const existingData = document.getElementById("filtered-data");
    if (existingData) existingData.remove();
    filtersSection.appendChild(outputDiv);
}

// Get filtered schedule data as a Promise (used by schedule compilation)
function getFilteredSchedule() {
    return new Promise((resolve, reject) => {
        const file = document.getElementById("file-input").files[0];
        if (!file) {
            alert("Please upload a file before filtering.");
            reject("No file uploaded");
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const fileContent = e.target.result;

            // Extract + organize
            const entries = extractEntries(fileContent);
            const organizedData = organizeEntryData(entries);

            // same filter fields
            const creditMin = parseInt(document.getElementById("credit-min").value, 10) || 0;
            const creditMax = parseInt(document.getElementById("credit-max").value, 10) || Infinity;
            const tafbMax = parseInt(document.getElementById("tafb-max").value, 10) || Infinity;

            const omitDays = (document.getElementById("omit-days").value || "")
                .split(",").map(day => day.trim());
            const omitRoutes = (document.getElementById("omit-routes").value || "")
                .split(",").map(route => route.trim().toUpperCase());

            const earliestStartTime = document.getElementById("start-time").value || null;

            // Filter logic
            const filteredData = organizedData.filter(entry => {
                // Credit
                const creditMinutes = parseTimeToMinutes(entry.credit);
                if (creditMinutes < creditMin * 60 || creditMinutes > creditMax * 60) return false;

                // T.A.F.B.
                const tafbMinutes = parseTimeToMinutes(entry.tafb);
                if (tafbMinutes > tafbMax * 60) return false;

                // Earliest Start
                if (earliestStartTime) {
                    const filterStart = hhmmToMinutes(earliestStartTime);
                    const entryStart = hhmmToMinutes(entry.shiftStartTime);
                    if (entryStart < filterStart) return false;
                }

                // Dates of Pairing (was activeDays)
                if (omitDays.some(day => entry.pairingDates.includes(day))) return false;

                // Routes
                if (omitRoutes.some(route => entry.travelRoute.includes(route))) return false;

                return true;
            });

            // Add unified time data
            const unifiedFilteredData = filteredData.map(entry => ({
                ...entry,
                startMinutes: hhmmToMinutes(entry.shiftStartTime),
                endMinutes: hhmmToMinutes(entry.dayEndTime),
                creditMinutes: parseTimeToMinutes(entry.credit),
                tafbMinutes: parseTimeToMinutes(entry.tafb),
            }));

            resolve(unifiedFilteredData);
        };

        reader.onerror = () => reject("Failed to read file");
        reader.readAsText(file);
    });
}


/********************************************************
 * 4) SCHEDULING LOGIC
 ********************************************************/

/**
 * Unused overlap check
 */
function canAssignWithoutOverlap(oldPairing, newPairing) {
    const oldAvail = computeNextAvailableStart(oldPairing);
    const oldAvailDay = oldAvail.day;
    const oldAvailMinutes = oldAvail.totalMinutes;

    // 'pairingDates' was 'activeDays'
    const newStartDay = Math.min(...newPairing.pairingDates);
    const newStartMinutes = hhmmToMinutes(newPairing.shiftStartTime);

    if (newStartDay < oldAvailDay) return false;
    if (newStartDay === oldAvailDay && newStartMinutes < oldAvailMinutes) return false;
    return true;
}

// Button event to compile the schedule
document.getElementById("compile-schedule-btn").addEventListener("click", async function () {
    // Where we'll place the final schedule (day-by-day)
    const compiledScheduleDiv = document.getElementById("compiled-schedule");
    compiledScheduleDiv.innerHTML = ""; // Clear old results

    // Where we place the summary (right column, "Compiled Schedule Info")
    const scheduleSummaryDiv = document.getElementById("schedule-summary");
    scheduleSummaryDiv.innerHTML = ""; // Clear old summary

    try {
        /****************************************
         * 1) GATHER USER INPUTS
         ****************************************/
        let userMaxCreditHours = parseInt(document.getElementById("max-monthly-credit").value, 10);
        if (isNaN(userMaxCreditHours) || userMaxCreditHours < 1) {
            userMaxCreditHours = 60; // fallback
        }
        if (userMaxCreditHours > 120) {
            userMaxCreditHours = 120;
        }

        let userMaxTAFBHours = parseInt(document.getElementById("max-monthly-tafb").value, 10);
        if (isNaN(userMaxTAFBHours) || userMaxTAFBHours < 1) {
            userMaxTAFBHours = 120;
        }
        if (userMaxTAFBHours > 800) {
            userMaxTAFBHours = 800;
        }

        let userMaxBlockSize = parseInt(document.getElementById("max-block-size").value, 10);
        if (isNaN(userMaxBlockSize) || userMaxBlockSize < 1) {
            userMaxBlockSize = 6;
        }
        if (userMaxBlockSize > 20) {
            userMaxBlockSize = 20;
        }

        const maximizeCredits = document.getElementById("maximize-credits").checked;

        /****************************************
         * 2) GET FILTERED SCHEDULE
         ****************************************/
        const schedule = await getFilteredSchedule();
        if (!Array.isArray(schedule) || schedule.length === 0) {
            alert("No pairings match the filter criteria.");
            return;
        }

        /****************************************
         * 3) PREPARE DATA STRUCTURES
         ****************************************/
        const calendar = Array.from({ length: 31 }, () => []);
        const occupiedDays = new Set();  // TAFB + rest
        const workingDays = Array(31).fill(false); // TAFB days specifically

        let totalCreditMinutes = 0;
        let totalTafbMinutes = 0;
        const targetCreditHours = maximizeCredits ? userMaxCreditHours : 60;

        /****************************************
         * 4) SORT SCHEDULE (Descending by credit)
         ****************************************/
        schedule.sort((a, b) => b.creditMinutes - a.creditMinutes);

        /****************************************
         * 5) ASSIGNMENT LOOP
         ****************************************/
        outerLoop: for (const pairing of schedule) {
            const pairingCreditMinutes = pairing.creditMinutes;
            const pairingTafbMinutes = pairing.tafbMinutes;

            // Check user max credit / TAFB
            if (totalCreditMinutes + pairingCreditMinutes > userMaxCreditHours * 60) {
                continue;
            }
            if (totalTafbMinutes + pairingTafbMinutes > userMaxTAFBHours * 60) {
                continue;
            }

            // Try each possible start day
            for (const startDay of pairing.pairingDates) {
                const { TAFB_days, rest_days } = getDaysCoverage(pairing, startDay);

                // If conflict, skip
                if ([...TAFB_days, ...rest_days].some(d => occupiedDays.has(d))) {
                    continue;
                }

                // Temporarily mark
                const oldWorkingStatus = [];
                const oldOccupiedStatus = [];

                for (const d of TAFB_days) {
                    oldWorkingStatus.push({ day: d, wasWorking: workingDays[d - 1] });
                    oldOccupiedStatus.push({ day: d, wasOccupied: occupiedDays.has(d) });
                    workingDays[d - 1] = true;
                    occupiedDays.add(d);
                }
                for (const d of rest_days) {
                    oldOccupiedStatus.push({ day: d, wasOccupied: occupiedDays.has(d) });
                    occupiedDays.add(d);
                }

                // Check consecutive days
                if (exceedsConsecutiveWorkingDays(workingDays, userMaxBlockSize)) {
                    // revert changes
                    for (const s of oldWorkingStatus) {
                        workingDays[s.day - 1] = s.wasWorking;
                    }
                    for (const s of oldOccupiedStatus) {
                        if (!s.wasOccupied) {
                            occupiedDays.delete(s.day);
                        }
                    }
                    continue;
                }

                // success
                calendar[startDay - 1].push({ ...pairing, assignedDay: startDay });
                totalCreditMinutes += pairingCreditMinutes;
                totalTafbMinutes += pairingTafbMinutes;

                // Reached target or limits?
                if (totalCreditMinutes >= targetCreditHours * 60) {
                    break outerLoop;
                }
                if (totalCreditMinutes >= userMaxCreditHours * 60) {
                    break outerLoop;
                }
                if (totalTafbMinutes >= userMaxTAFBHours * 60) {
                    break outerLoop;
                }
                break;
            }
        }

        /****************************************
         * 6) CHECK IF FINAL SCHEDULE >= 60h
         ****************************************/
        const totalCreditHours = totalCreditMinutes / 60;
        const totalTafbHours = totalTafbMinutes / 60;
        if (totalCreditHours < 60) {
            compiledScheduleDiv.innerHTML = `
                <p>Failed to compile at least 60 credit hours.
                Final credit: ${totalCreditHours.toFixed(2)}h. 
                T.A.F.B.: ${totalTafbHours.toFixed(2)}h</p>`;
            return;
        }

        /****************************************
         * 7) RENDER THE DAY-BY-DAY CALENDAR
         ****************************************/
        // We'll build the entire day-by-day display 
        // in compiledScheduleDiv. Then we can figure out 
        // how many days are truly "Off."

        // We'll store the "dayBoxesHTML" in a string 
        // so we can parse it for "Not used." Or 
        // we can do an inline approach counting days off 
        // as we build.

        let dayBoxesHTML = `<div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
            <input type="checkbox" id="toggle-view" />
            <label for="toggle-view" class="toggle-view-label" style="margin-left: 8px;">
                <span class="calendar-icon">📅</span>
                <span class="list-icon">📋</span>
            </label>
            <span style="font-size: 0.9rem; margin-left: 8px;">
                Toggle Calendar / List View
            </span>
        </div>
        <div id="calendar-container" class="calendar-view">`;

        // We'll track daysOffCount by literally seeing if 
        // the day is "Not used" at the end
        let daysOffCount = 0;

        for (let day = 1; day <= 31; day++) {
            // We'll accumulate the final HTML for dayBox 
            // in a local variable, 
            // so we can see if it ends up "Not used"
            let dayHTML = `<div class="calendar-box"><strong>Day ${day}</strong>`;

            if (calendar[day - 1].length > 0) {
                // day has assigned pairing
                calendar[day - 1].forEach(pairing => {
                    dayHTML += `
                        <div>
                            <ul style="list-style: none; padding: 0; margin: 5px 0;">
                                <li><strong>Pairing:</strong> ${pairing.pairingNumber}</li>
                                <li><strong>Start Time:</strong> ${pairing.shiftStartTime}</li>
                                <li><strong>End Time:</strong> ${pairing.dayEndTime}</li>
                                <li><strong>Dates of Pairing:</strong> ${pairing.assignedDay}</li>
                                <li><strong>Credit:</strong> ${pairing.credit}</li>
                                <li><strong>T.A.F.B.:</strong> ${pairing.tafb}</li>
                                <li><strong>Route:</strong> ${pairing.travelRoute.join(", ")}</li>
                            </ul>
                        </div>`;
                });
            } else {
                // No direct assigned pairings
                if (workingDays[day - 1]) {
                    // This day is TAFB coverage day for multi-day
                    dayHTML += `<p>Part of Multiday Pairing</p>`;
                } else if (occupiedDays.has(day)) {
                    // Possibly rest day
                    dayHTML += `<p>Not used</p>`;
                } else {
                    // Day truly "Off"
                    dayHTML += `<p>Not used</p>`;
                    daysOffCount++;
                }
            }
            dayHTML += `</div>`; // close .calendar-box

            dayBoxesHTML += dayHTML;
        }

        dayBoxesHTML += `</div>`; // close #calendar-container

        // We'll place the final dayBoxes in compiledScheduleDiv
        compiledScheduleDiv.innerHTML = dayBoxesHTML;

        // Re-bind the toggle event
        const toggleViewCheckbox = document.getElementById("toggle-view");
        const calendarContainer = document.getElementById("calendar-container");
        toggleViewCheckbox.addEventListener("change", function (e) {
            if (!calendarContainer) return;
            if (e.target.checked) {
                calendarContainer.classList.remove("calendar-view");
                calendarContainer.classList.add("list-view");
            } else {
                calendarContainer.classList.remove("list-view");
                calendarContainer.classList.add("calendar-view");
            }
        });

        /****************************************
         * 8) BUILD SCHEDULE SUMMARY => #schedule-summary
         ****************************************/
        // daysOffCount is the number of days that ended up 
        // truly "Not used" in the final day rendering.
        // Now we can place that in the summary as well.
        const summaryHTML = `
            <div style="background-color: #E0F3FF;
                        padding: 15px;
                        margin-bottom: 20px;">
                <h4 style="margin-top: 0; color: #048B54;">Schedule Summary</h4>
                <ul style="list-style-type: none; padding: 0; margin: 0; text-align: left;">
                    <li><strong>Total Credit Hours:</strong> ${(totalCreditHours).toFixed(2)}h
                        (Goal: ${targetCreditHours}h, Cap: ${userMaxCreditHours}h)</li>
                    <li><strong>Total T.A.F.B.:</strong> ${(totalTafbHours).toFixed(2)}h
                        (Limit: ${userMaxTAFBHours}h)</li>
                    <li><strong>Max Consecutive Days:</strong> ${userMaxBlockSize}</li>
                    <li><strong>Number of Days Off:</strong> ${daysOffCount}</li>
                </ul>
            </div>
        `;
        scheduleSummaryDiv.innerHTML = summaryHTML;

    } catch (error) {
        console.error(error);
        alert("An error occurred while compiling the schedule. Please try again.");
    }
});



/**
 * Compute TAFB and rest coverage days
 */
function getDaysCoverage(pairing, startDay) {
    const startMinutes = hhmmToMinutes(pairing.shiftStartTime);
    const tafbMinutes = parseTimeToMinutes(pairing.tafb);
    const totalAfterTAFB = startMinutes + tafbMinutes;
    const totalAfterRest = totalAfterTAFB + 660; // 11 hours rest

    const TAFB_days = new Set();
    const rest_days = new Set();

    // TAFB coverage
    let currentDay = startDay;
    let remainingTAFB = totalAfterTAFB;
    while (remainingTAFB > 0) {
        TAFB_days.add(currentDay);
        remainingTAFB -= 1440;
        currentDay++;
    }

    // rest coverage
    let remainingRest = totalAfterRest - (totalAfterTAFB > 0 ? totalAfterTAFB : 0);
    let restDayStart = currentDay;
    while (remainingRest > 0) {
        rest_days.add(restDayStart);
        remainingRest -= 1440;
        restDayStart++;
    }

    return { TAFB_days: Array.from(TAFB_days), rest_days: Array.from(rest_days) };
}

// Compute next available start day/time after TAFB + rest
function computeNextAvailableStart(pairing) {
    const startMinutes = hhmmToMinutes(pairing.shiftStartTime);
    const tafbMinutes = parseTimeToMinutes(pairing.tafb);
    const totalAfterTAFB = startMinutes + tafbMinutes;
    const totalAfterRest = totalAfterTAFB + 660; // 11 hrs rest

    const additionalDays = Math.floor(totalAfterRest / 1440);
    const remainderMinutes = totalAfterRest % 1440;

    // 'pairingDates' was 'activeDays'
    const nextAvailableDay = Math.min(...pairing.pairingDates) + additionalDays;
    const nextAvailableHH = Math.floor(remainderMinutes / 60).toString().padStart(2, '0');
    const nextAvailableMM = (remainderMinutes % 60).toString().padStart(2, '0');
    const nextAvailableTime = `${nextAvailableHH}:${nextAvailableMM}`;

    return { day: nextAvailableDay, time: nextAvailableTime, totalMinutes: remainderMinutes };
}

function exceedsConsecutiveWorkingDays(isWorkingDay, limit) {
    let consecutive = 0;
    for (let i = 0; i < isWorkingDay.length; i++) {
        if (isWorkingDay[i]) {
            consecutive++;
            if (consecutive > limit) return true;
        } else {
            consecutive = 0;
        }
    }
    return false;
}


/********************************************************
 * 5) UI & EVENT LISTENERS
 ********************************************************/

// Switch between UI sections
function showSection(sectionId) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.add('hidden'));
    const targetSection = document.getElementById(sectionId);
    targetSection.classList.remove('hidden');
}

// Handle file upload to extract and display raw entries (debugging)
document.getElementById("file-input").addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const fileContent = e.target.result;
        const entries = extractEntries(fileContent);
        console.log(entries);  // For debugging
        displayEntries(entries);
    };
    reader.readAsText(file);
});

// Also handle file upload for organized data display
document.getElementById("file-input").addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const fileContent = e.target.result;
        const entries = extractEntries(fileContent);
        displayOrganizedData(entries);
    };
    reader.readAsText(file);
});


