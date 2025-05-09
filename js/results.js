// js/results.js


document.getElementById("build-schedule-btn").addEventListener("click", async () => {
    const maxBlockInput = parseInt(document.getElementById("max-block").value, 10);
    const minBlockInput = parseInt(document.getElementById("min-block").value, 10);

    // Clamp to contractual max
    userRules.maxBlockSize = Math.min(maxBlockInput || 6, 6);
    userRules.minBlockSize = Math.max(minBlockInput || 1, 1);

    console.log("Contractual Rules:", contractualRules);
    console.log("User-defined Rules:", userRules);

    const selectedAlgo = document.querySelector('input[name="algo-choice"]:checked')?.value;

    if (selectedAlgo === "days-off") {
        await runDaysOffAlgorithm(explodedPairings);
    } else if (selectedAlgo === "layover") {
        await runLongLayoverAlgorithm(explodedPairings);
    } else if (selectedAlgo === "max-credit") {
        await runMaxCreditAlgorithm(explodedPairings);
    } else {
        alert("Please select a schedule algorithm.");
    }
});


document.querySelectorAll('input[name="algo-choice"]').forEach(radio => {
    radio.addEventListener("change", () => {
        const selected = document.querySelector('input[name="algo-choice"]:checked')?.value;
        const warning = document.getElementById("algo-warning");

        if (selected === "max-credit") {
            warning.textContent = "⚠️ Max Credit may take longer to compile. Please be patient, it is not frozen.";
            warning.style.display = "block";
        } else {
            warning.textContent = "";
            warning.style.display = "none";
        }
    });
});

document.getElementById("back-btn")?.addEventListener("click", () => {
    window.history.back(); // or window.location.href = "filter.html";
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

window.addEventListener("DOMContentLoaded", () => {
    explodedPairings = JSON.parse(sessionStorage.getItem("filteredData") || "[]");
    if (explodedPairings.length === 0) {
        alert("No filtered data found. Please go back and apply filters first.");
        return;
    }

    console.log("Exploded pairings loaded from session:", explodedPairings);
});


const contractualRules = {
    maxBlockLengthDays: 6,
    maxDutyHoursPerDay: 13.5,
    monthlyCreditMax: 120,
    monthlyCreditMin: 60,
    minRestBetweenPairingsHrs: 10,
};

const userRules = {
    maxBlockSize: null, // max number of days (user-defined)
    minBlockSize: null, // min number of days (user-defined)
};








function displaySchedule(schedule) {
    const container = document.getElementById("schedule-output");
    container.innerHTML = "";

    if (!schedule || schedule.length === 0) {
        container.textContent = "No schedule generated.";
        return;
    }

    const calendar = document.createElement("div");
    calendar.className = "calendar-grid";

    // Step 1: Map of day → pairings affecting it
    const byDay = {};

    for (const p of schedule) {
        const startDay = parseInt(p.pairingDate, 10);
        const daysUsed = p.calendarDaysUsed;

        for (let offset = 0; offset < daysUsed; offset++) {
            const currentDay = startDay + offset;
            if (currentDay > 31) break; // clamp overflow

            if (!byDay[currentDay]) byDay[currentDay] = [];
            byDay[currentDay].push(p);
        }
    }

    // Step 2: Render full calendar
    for (let day = 1; day <= 31; day++) {
        const tile = document.createElement("div");
        tile.className = "calendar-day";

        const pairings = byDay[day] || [];

        tile.innerHTML = `
    <strong>Day ${day}</strong><br>
    ${pairings.length
                ? pairings.map(p => {
                    const isStartDay = parseInt(p.pairingDate) === day;
                    const label = isStartDay ? p.pairingNumber : `${p.pairingNumber} (cont)`;
                    return `<div class="pairing-tile" data-pid="${p.pairingNumber}" data-day="${p.pairingDate}">${label}</div>`;
                }).join("")
                : `<span style="color: #888;">No pairing</span>`
            }
`;


        calendar.appendChild(tile);
    }

    container.appendChild(calendar);

    // Modal hookup
    container.querySelectorAll(".pairing-tile").forEach(tile => {
        tile.addEventListener("click", () => {
            const pid = tile.dataset.pid;
            const startDate = tile.dataset.day;
            const match = schedule.find(p => p.pairingNumber === pid && p.pairingDate === startDate);
            if (match) openModal(match);
        });
    });
    // — Final stats summary —
    const uniqueWorkedDays = new Set();
    let totalCreditMins = 0;
    let totalTAFBMins = 0;

    for (const p of schedule) {
        const startDay = parseInt(p.pairingDate);
        for (let offset = 0; offset < p.calendarDaysUsed; offset++) {
            const day = startDay + offset;
            if (day <= 31) uniqueWorkedDays.add(day);
        }

        totalCreditMins += parseTimeToMinutes(p.credit);
        totalTAFBMins += parseTimeToMinutes(p.tafb);
    }

    const daysWorked = uniqueWorkedDays.size;
    const daysOff = 31 - daysWorked;

    const formatHM = mins => `${Math.floor(mins / 60)}h ${mins % 60}m`;

    document.getElementById("schedule-summary").innerHTML = `
    <p><strong>Total Credit:</strong> ${formatHM(totalCreditMins)}</p>
    <p><strong>Total TAFB:</strong> ${formatHM(totalTAFBMins)}</p>
    <p><strong>Days Worked:</strong> ${daysWorked}</p>
    <p><strong>Days Off:</strong> ${daysOff}</p>
`;
}

function displayInProgressSchedule(schedule, message = "") {
    document.getElementById("build-status").textContent = message;
    displaySchedule(schedule); // reuse your existing renderer
}



function openModal(pairing) {
    const modal = document.getElementById("pairing-modal");
    const body = document.getElementById("modal-body");
    const closeBtn = document.getElementById("modal-close");

    body.innerHTML = `
        <p><strong>Pairing Number:</strong> ${pairing.pairingNumber}</p>
        <p><strong>Date:</strong> ${pairing.pairingDate}</p>
        <p><strong>Base:</strong> ${pairing.baseAirport}</p>
        <p><strong>Route:</strong> ${pairing.travelRoute.join(", ")}</p>
        <p><strong>Start:</strong> ${pairing.shiftStartTime}</p>
        <p><strong>End:</strong> ${pairing.dayEndTime}</p>
        <p><strong>Credit:</strong> ${pairing.credit}</p>
        <p><strong>TAFB:</strong> ${pairing.tafb}</p>
    `;

    modal.classList.remove("hidden");

    closeBtn.onclick = () => modal.classList.add("hidden");
    modal.onclick = e => {
        if (e.target === modal) modal.classList.add("hidden");
    };
}








/*
/////////////DAYS OFF ALGO///////////////////
*/


async function runDaysOffAlgorithm(explodedList) {
    const filtered = explodedList.filter(entry => {
        const credit = parseTimeToMinutes(entry.credit);
        const tafb = parseTimeToMinutes(entry.tafb);
        const shiftStart = hhmmToMinutes(entry.shiftStartTime);
        const shiftEnd = hhmmToMinutes(entry.dayEndTime);
        const dutyTime = shiftEnd - shiftStart;
        const efficiency = credit === 0 ? 0 : tafb / credit;

        if (entry.calendarDaysUsed > 2 && efficiency < 0.6) return false;
        if (dutyTime > 810 || dutyTime < 0) return false;

        return true;
    });

    const sorted = [...filtered].sort((a, b) => {
        return parseTimeToMinutes(b.credit) - parseTimeToMinutes(a.credit);
    });
    const forward = tryBuildSchedule(sorted);
    const reverse = tryBuildScheduleReverse(sorted);

    function compareSchedules(a, b) {
        const days = schedule => {
            const s = new Set();
            schedule.forEach(p => {
                const d = parseInt(p.pairingDate);
                for (let i = 0; i < p.calendarDaysUsed; i++) s.add(d + i);
            });
            return s.size;
        };

        const credit = schedule => schedule.reduce((sum, p) => sum + parseTimeToMinutes(p.credit), 0);

        if (!a?.success) return b;
        if (!b?.success) return a;

        const aDays = days(a.schedule);
        const bDays = days(b.schedule);
        const aCredit = credit(a.schedule);
        const bCredit = credit(b.schedule);

        if (bDays < aDays) return b;
        if (aDays < bDays) return a;
        return bCredit > aCredit ? b : a;
    }

    const best = compareSchedules(forward, reverse);
    if (best?.success) {
        console.log("✅ Best direction chosen. Optimizing...");
        const optimized = optimizeScheduleForDaysOff(best.schedule, sorted);
        displaySchedule(optimized);
        return;
    }


    for (let i = 0; i < sorted.length; i++) {
        const rotated = [...sorted.slice(i), ...sorted.slice(0, i)];
        const forwardAttempt = tryBuildSchedule(rotated);
        const reverseAttempt = tryBuildScheduleReverse(rotated);


        const best = compareSchedules(forwardAttempt, reverseAttempt);

        if (i % 5 === 0) {
            const mem = performance?.memory?.usedJSHeapSize || 0;
            const domCount = document.querySelectorAll("*").length;
            console.log(`[Try ${i}] Heap: ${(mem / 1024 / 1024).toFixed(1)} MB, DOM Nodes: ${domCount}`);
        }

        if (i % 10 === 0) {
            console.log(`[Attempt ${i}] Best schedule length: ${best.schedule?.length || 0}`);
            console.log(`[Rotation ${i}] First pairing number: ${rotated[0]?.pairingNumber}`);
        }

        if (best?.success) {
            console.log("✅ Schedule found via fallback direction. Optimizing...");
            const optimized = optimizeScheduleForDaysOff(best.schedule, sorted);
            displaySchedule(optimized);
            return;
        }

        forwardAttempt.schedule = null;
        reverseAttempt.schedule = null;
    }


    document.getElementById("build-status").textContent =
        "❌ No valid schedule could be built after trying all options.";
}



function tryBuildSchedule(pairings) {
    const reverseBuild = false;
    const schedule = [];
    const usedDays = new Set();
    const usedStartDays = new Set();

    let totalCredit = 0;
    let lastDutyEnd = null;
    let lastStartDay = null;

    for (const p of pairings) {
        const startDay = parseInt(p.pairingDate);
        const startTime = hhmmToMinutes(p.shiftStartTime);
        const tafb = parseTimeToMinutes(p.tafb);
        const dutyEnd = startTime + tafb + 30;

        if (usedStartDays.has(p.pairingDate)) {
            console.log(`❌ [${p.pairingNumber}] Skipped – duplicate start day: ${p.pairingDate}`);
            continue;
        }

        if (lastDutyEnd !== null) {
            const dayDiff = startDay - lastStartDay;
            const rest = startTime + (dayDiff * 1440) - lastDutyEnd;

            if (rest < 600) {
                console.log(`❌ [${p.pairingNumber}] Rejected – insufficient rest (${rest} mins)`);
                continue;
            }
        }

        const simulatedDays = new Set([...usedDays]);
        for (let offset = 0; offset < p.calendarDaysUsed; offset++) {
            simulatedDays.add(startDay + offset);
        }

        // Block check
        const sortedDays = Array.from(simulatedDays).sort((a, b) => a - b);
        let maxBlock = 1;
        let block = 1;
        for (let i = 1; i < sortedDays.length; i++) {
            if (sortedDays[i] === sortedDays[i - 1] + 1) {
                block++;
                maxBlock = Math.max(maxBlock, block);
            } else {
                block = 1;
            }
        }

        if (maxBlock > userRules.maxBlockSize || maxBlock < userRules.minBlockSize) continue;


        // Accept pairing
        console.log(`✅ [${p.pairingNumber}] Accepted – starts day ${p.pairingDate}, spans ${p.calendarDaysUsed} days – Total Credit: ${Math.floor(totalCredit / 60)}h`);


        schedule.push(p);
        totalCredit += parseTimeToMinutes(p.credit);
        lastDutyEnd = dutyEnd;
        lastStartDay = startDay;
        usedStartDays.add(p.pairingDate);
        for (let offset = 0; offset < p.calendarDaysUsed; offset++) {
            usedDays.add(startDay + offset);
        }

        if (totalCredit >= 60 * 60) {
            console.log(`🎯 Schedule complete – reached ${Math.floor(totalCredit / 60)}h`);
            return { success: true, schedule };
        }
    }

    console.log("⚠️ No valid schedule built in this attempt.");
    console.log(`⚠️ Forward build failed. Reached ${Math.floor(totalCredit / 60)} credit hours.`);

    return { success: false };
}

function optimizeScheduleForDaysOff(originalSchedule, allCandidates) {
    let schedule = [...originalSchedule];
    let improved = true;
    let loopCount = 0;
    const MAX_LOOPS = 100;
    const MAX_COMBOS_PER_ROUND = 200;

    const totalCredit = () => schedule.reduce((sum, p) => sum + parseTimeToMinutes(p.credit), 0);

    const dayCount = days => {
        const arr = Array.from(days).sort((a, b) => a - b);
        return arr.length;
    };

    const countBlock = days => {
        const arr = Array.from(days).sort((a, b) => a - b);
        let maxBlock = 1;
        let block = 1;
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] === arr[i - 1] + 1) {
                block++;
                maxBlock = Math.max(maxBlock, block);
            } else {
                block = 1;
            }
        }
        return maxBlock;
    };

    while ((loopCount < 5 || improved) && loopCount < MAX_LOOPS) {
        improved = false;
        loopCount++;

        const usedStartDays = new Set(schedule.map(p => p.pairingDate));
        const usedDays = new Set();
        schedule.forEach(p => {
            const start = parseInt(p.pairingDate);
            for (let i = 0; i < p.calendarDaysUsed; i++) {
                usedDays.add(start + i);
            }
        });

        console.log(`🔄 Optimization round ${loopCount}`);

        for (let i = 0; i < schedule.length - 1; i++) {
            const originalBlock = schedule.slice(i, i + 2);
            const candidatePool = allCandidates.filter(p => !schedule.includes(p) && !originalBlock.includes(p));

            const combos = [];
            for (let a = 0; a < candidatePool.length; a++) {
                for (let b = a + 1; b < candidatePool.length && combos.length < MAX_COMBOS_PER_ROUND; b++) {
                    combos.push([candidatePool[a], candidatePool[b]]);
                    for (let c = b + 1; c < candidatePool.length && combos.length < MAX_COMBOS_PER_ROUND; c++) {
                        combos.push([candidatePool[a], candidatePool[b], candidatePool[c]]);
                    }
                }
                if (combos.length >= MAX_COMBOS_PER_ROUND) break;
            }

            combos.sort((a, b) => {
                const creditA = a.reduce((s, p) => s + parseTimeToMinutes(p.credit), 0);
                const creditB = b.reduce((s, p) => s + parseTimeToMinutes(p.credit), 0);
                return creditB - creditA;
            });

            for (const combo of combos) {
                const testSchedule = [...schedule];
                testSchedule.splice(i, 2, ...combo);

                const testCredit = testSchedule.reduce((sum, p) => sum + parseTimeToMinutes(p.credit), 0);
                if (testCredit < 60 * 60 || testCredit > 120 * 60) continue;

                const testDays = new Set();
                testSchedule.forEach(p => {
                    const d = parseInt(p.pairingDate);
                    for (let j = 0; j < p.calendarDaysUsed; j++) testDays.add(d + j);
                });

                const blockLength = countBlock(testDays);
                if (blockLength > userRules.maxBlockSize || blockLength < userRules.minBlockSize) continue;

                const restSafe = testSchedule.every((p, idx) => {
                    if (idx === 0) return true;
                    const prev = testSchedule[idx - 1];
                    const prevEnd = hhmmToMinutes(prev.shiftStartTime) + parseTimeToMinutes(prev.tafb) + 30;
                    const dayGap = parseInt(p.pairingDate) - parseInt(prev.pairingDate);
                    const rest = hhmmToMinutes(p.shiftStartTime) + dayGap * 1440 - prevEnd;
                    return rest >= 600;
                });

                if (!restSafe) continue;

                const oldDayCount = schedule.reduce((set, p) => {
                    const d = parseInt(p.pairingDate);
                    for (let j = 0; j < p.calendarDaysUsed; j++) set.add(d + j);
                    return set;
                }, new Set()).size;

                const newDayCount = testDays.size;

                if (newDayCount < oldDayCount) {
                    console.log(`🧠 Multi-swap success: replaced pairings at index ${i}–${i + 1} with ${combo.length} new ones. Days reduced.`);
                    schedule = testSchedule;
                    improved = true;
                    break;
                }
            }

            if (improved) break;
        }
    }

    console.log(`✅ Optimization complete after ${loopCount} rounds`);
    return schedule;
}


////////////////////////////////////////////////////////////////////////////////////////////////////////// Reverse Build
function tryBuildScheduleReverse(pairings) {
    const reverseBuild = true;
    const schedule = [];
    const usedDays = new Set();
    const usedStartDays = new Set();

    let totalCredit = 0;
    let lastDutyEnd = null;
    let lastStartDay = null;

    for (let i = pairings.length - 1; i >= 0; i--) {
        const p = pairings[i];
        const startDay = parseInt(p.pairingDate);
        const startTime = hhmmToMinutes(p.shiftStartTime);
        const tafb = parseTimeToMinutes(p.tafb);
        const dutyEnd = startTime + tafb + 30;

        if (usedStartDays.has(p.pairingDate)) continue;

        if (lastDutyEnd !== null) {
            const dayDiff = lastStartDay - startDay;
            const rest = lastDutyEnd - (startTime + dayDiff * 1440);
            if (rest < 600) continue;
        }

        const simulatedDays = new Set([...usedDays]);
        for (let offset = 0; offset < p.calendarDaysUsed; offset++) {
            simulatedDays.add(startDay + offset);
        }

        const sortedDays = Array.from(simulatedDays).sort((a, b) => a - b);
        let maxBlock = 1;
        let block = 1;
        for (let i = 1; i < sortedDays.length; i++) {
            if (sortedDays[i] === sortedDays[i - 1] + 1) {
                block++;
                maxBlock = Math.max(maxBlock, block);
            } else {
                block = 1;
            }
        }

        if (maxBlock > userRules.maxBlockSize || maxBlock < userRules.minBlockSize) continue;
        console.log(`✅ [${p.pairingNumber}] Accepted – starts day ${p.pairingDate}, spans ${p.calendarDaysUsed} days – Total Credit: ${Math.floor(totalCredit / 60)}h`);


        schedule.push(p);
        totalCredit += parseTimeToMinutes(p.credit);
        lastDutyEnd = dutyEnd;
        lastStartDay = startDay;
        usedStartDays.add(p.pairingDate);
        for (let offset = 0; offset < p.calendarDaysUsed; offset++) {
            usedDays.add(startDay + offset);
        }

        if (totalCredit >= 60 * 60) return { success: true, schedule };
    }

    console.log(`⚠️ ${reverseBuild ? "Reverse" : "Forward"} build failed.`);
    console.log(` • Pairing Instances Checked: ${pairings.length}`);
    console.log(` • Total Pairings Accepted: ${schedule.length}`);
    console.log(` • Final Credit: ${Math.floor(totalCredit / 60)}h (${totalCredit} mins)`);
    console.log(` • Days Worked: ${Array.from(usedDays).sort((a, b) => a - b).join(', ') || "None"}`);


    return { success: false };

}




/*
///////////// END OF DAYS OFF ALGO///////////////////
*/


/*
/////////////LONG LAYOVER ALGO///////////////////
*/
async function runLongLayoverAlgorithm(explodedList) {
    // Step 1: Filter out invalid pairings
    const filtered = explodedList.filter(entry => {
        const credit = parseTimeToMinutes(entry.credit);
        const tafb = parseTimeToMinutes(entry.tafb);
        const shiftStart = hhmmToMinutes(entry.shiftStartTime);
        const shiftEnd = hhmmToMinutes(entry.dayEndTime);
        const dutyTime = shiftEnd - shiftStart;
        const efficiency = credit === 0 ? 0 : tafb / credit;

        if (entry.calendarDaysUsed > 2 && efficiency < 0.6) return false;
        if (dutyTime > 810 || dutyTime < 0) return false;

        return true;
    });

    // Step 2: Sort by layover per day descending
    const sorted = [...filtered].sort((a, b) => {
        const aLayoverPerDay = parseTimeToMinutes(a.tafb) / a.calendarDaysUsed;
        const bLayoverPerDay = parseTimeToMinutes(b.tafb) / b.calendarDaysUsed;
        return bLayoverPerDay - aLayoverPerDay;
    });

    for (let i = 0; i < sorted.length; i++) {
        const rotated = [...sorted.slice(i), ...sorted.slice(0, i)];
        const forwardAttempt = tryBuildSchedule(rotated);
        const reverseAttempt = tryBuildScheduleReverse(rotated);

        function avgLayover(schedule) {
            if (!schedule?.schedule || schedule.schedule.length === 0) return 0;
            const totalTAFB = schedule.schedule.reduce((sum, p) => sum + parseTimeToMinutes(p.tafb), 0);
            const totalDays = schedule.schedule.reduce((sum, p) => sum + p.calendarDaysUsed, 0);
            return totalTAFB / totalDays;
        }

        const best = (() => {
            if (forwardAttempt.success && !reverseAttempt.success) return forwardAttempt;
            if (reverseAttempt.success && !forwardAttempt.success) return reverseAttempt;
            if (!forwardAttempt.success && !reverseAttempt.success) return null;

            const fAvg = avgLayover(forwardAttempt);
            const rAvg = avgLayover(reverseAttempt);
            return rAvg > fAvg ? reverseAttempt : forwardAttempt;
        })();

        if (best?.success) {
            console.log("✅ Long Layover schedule built. Running optimizer...");
            const optimized = optimizeScheduleForLongLayovers(best.schedule, sorted);
            displaySchedule(optimized);
            return;
        }

        forwardAttempt.schedule = null;
        reverseAttempt.schedule = null;
    }


    document.getElementById("build-status").textContent =
        "❌ No valid long layover schedule could be built.";
}


function optimizeScheduleForLongLayovers(originalSchedule, allCandidates) {
    let schedule = [...originalSchedule];
    let improved = true;
    let loopCount = 0;
    const MAX_LOOPS = 100;

    const totalCredit = () => schedule.reduce((sum, p) => sum + parseTimeToMinutes(p.credit), 0);
    const avgLayoverPerDay = (list) =>
        list.reduce((sum, p) => sum + parseTimeToMinutes(p.tafb), 0) /
        list.reduce((sum, p) => sum + p.calendarDaysUsed, 0);

    const countBlock = days => {
        const arr = Array.from(days).sort((a, b) => a - b);
        let maxBlock = 1;
        let block = 1;
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] === arr[i - 1] + 1) {
                block++;
                maxBlock = Math.max(maxBlock, block);
            } else {
                block = 1;
            }
        }
        return maxBlock;
    };

    while (improved && loopCount < MAX_LOOPS) {
        improved = false;
        loopCount++;

        const usedStartDays = new Set(schedule.map(p => p.pairingDate));
        const usedDays = new Set();
        schedule.forEach(p => {
            const start = parseInt(p.pairingDate);
            for (let i = 0; i < p.calendarDaysUsed; i++) {
                usedDays.add(start + i);
            }
        });

        console.log(`🔄 Layover Optimizer Round ${loopCount}`);

        for (let i = 0; i < schedule.length; i++) {
            const current = schedule[i];
            const currentLayPerDay = parseTimeToMinutes(current.tafb) / current.calendarDaysUsed;

            for (const candidate of allCandidates) {
                if (schedule.includes(candidate)) continue;
                if (candidate.pairingDate === current.pairingDate) continue;

                const newSchedule = [...schedule];
                newSchedule[i] = candidate;

                const newCredit = totalCredit()
                    - parseTimeToMinutes(current.credit)
                    + parseTimeToMinutes(candidate.credit);
                if (newCredit < 60 * 60) continue;

                const restSafe = newSchedule.every((p, idx) => {
                    if (idx === 0) return true;
                    const prev = newSchedule[idx - 1];
                    const prevEnd = hhmmToMinutes(prev.shiftStartTime) + parseTimeToMinutes(prev.tafb) + 30;
                    const dayGap = parseInt(p.pairingDate) - parseInt(prev.pairingDate);
                    const rest = hhmmToMinutes(p.shiftStartTime) + dayGap * 1440 - prevEnd;
                    return rest >= 600;
                });

                if (!restSafe) continue;

                const daysTest = new Set();
                newSchedule.forEach(p => {
                    const start = parseInt(p.pairingDate);
                    for (let i = 0; i < p.calendarDaysUsed; i++) {
                        daysTest.add(start + i);
                    }
                });

                const blockLength = countBlock(daysTest);
                if (blockLength > userRules.maxBlockSize || blockLength < userRules.minBlockSize) continue;


                const oldAvg = avgLayoverPerDay(schedule);
                const newAvg = avgLayoverPerDay(newSchedule);

                if (newAvg > oldAvg) {
                    schedule[i] = candidate;
                    improved = true;
                    break;
                }
            }

            if (improved) break;
        }
    }

    console.log(`✅ Optimization complete after ${loopCount} rounds`);
    return schedule;
}








/*
/////////////END OF LONG LAYOVER ALGO///////////////////
*/


/*
/////////////MAX CREDIT ALGO///////////////////
*/
async function runMaxCreditAlgorithm(explodedList) {
    const efficiencyTiers = [0.8, 0.65, 0.5, 0.4];

    for (let tier of efficiencyTiers) {
        console.log(`🔍 Trying efficiency tier ≥ ${tier}`);

        const filtered = explodedList.filter(entry => {
            const credit = parseTimeToMinutes(entry.credit);
            const tafb = parseTimeToMinutes(entry.tafb);
            const shiftStart = hhmmToMinutes(entry.shiftStartTime);
            const shiftEnd = hhmmToMinutes(entry.dayEndTime);
            const dutyTime = shiftEnd - shiftStart;
            const efficiency = credit === 0 ? 0 : credit / tafb;

            if (efficiency < tier) return false;
            if (dutyTime > 810 || dutyTime < 0) return false;

            return true;
        });

        const sorted = [...filtered].sort((a, b) => {
            const aEff = parseTimeToMinutes(a.credit) / parseTimeToMinutes(a.tafb);
            const bEff = parseTimeToMinutes(b.credit) / parseTimeToMinutes(b.tafb);
            return bEff - aEff;
        });

        for (let i = 0; i < sorted.length; i++) {
            const rotated = [...sorted.slice(i), ...sorted.slice(0, i)];
            const forwardAttempt = tryBuildMaxCreditSchedule(rotated);
            const reverseAttempt = tryBuildMaxCreditScheduleReverse(rotated);

            const credit = sched => sched?.schedule?.reduce((sum, p) => sum + parseTimeToMinutes(p.credit), 0) || 0;

            const best = (() => {
                if (forwardAttempt.success && !reverseAttempt.success) return forwardAttempt;
                if (reverseAttempt.success && !forwardAttempt.success) return reverseAttempt;
                if (!forwardAttempt.success && !reverseAttempt.success) return null;

                return credit(forwardAttempt) >= credit(reverseAttempt) ? forwardAttempt : reverseAttempt;
            })();

            if (best?.success) {
                console.log(`✅ Max Credit base schedule built at tier ${tier}. Optimizing...`);
                const optimized = optimizeScheduleForMaxCredit(best.schedule, sorted);
                console.log("✅ Optimized Max Credit schedule ready. Rendering...");
                displaySchedule(optimized);
                return;
            }

            forwardAttempt.schedule = null;
            reverseAttempt.schedule = null;
        }

    }

    document.getElementById("build-status").textContent =
        "❌ Could not generate a valid max-credit schedule within constraints.";
}




function tryBuildMaxCreditSchedule(pairings) {
    const schedule = [];
    const usedDays = new Set();
    const usedStartDays = new Set();

    let totalCredit = 0;
    let lastDutyEnd = null;
    let lastStartDay = null;

    for (const p of pairings) {
        const startDay = parseInt(p.pairingDate);
        const startTime = hhmmToMinutes(p.shiftStartTime);
        const tafb = parseTimeToMinutes(p.tafb);
        const dutyEnd = startTime + tafb + 30;

        const pairingKey = `${p.pairingNumber}-${p.pairingDate}`;
        if (usedStartDays.has(pairingKey)) continue;



        if (lastDutyEnd !== null) {
            const dayDiff = startDay - lastStartDay;
            const rest = startTime + (dayDiff * 1440) - lastDutyEnd;
            if (rest < 600) continue;
        }

        const simulatedDays = new Set([...usedDays]);
        for (let offset = 0; offset < p.calendarDaysUsed; offset++) {
            simulatedDays.add(startDay + offset);
        }

        const sortedDays = Array.from(simulatedDays).sort((a, b) => a - b);
        let maxBlock = 1;
        let block = 1;
        for (let i = 1; i < sortedDays.length; i++) {
            if (sortedDays[i] === sortedDays[i - 1] + 1) {
                block++;
                maxBlock = Math.max(maxBlock, block);
            } else {
                block = 1;
            }
        }

        if (maxBlock > userRules.maxBlockSize || maxBlock < userRules.minBlockSize) continue;


        const pairingCredit = parseTimeToMinutes(p.credit);
        if (totalCredit + pairingCredit > contractualRules.monthlyCreditMax * 60) {
            continue;
        }

        schedule.push(p);
        totalCredit += pairingCredit;

        lastDutyEnd = dutyEnd;
        lastStartDay = startDay;
        usedStartDays.add(pairingKey);

        for (let offset = 0; offset < p.calendarDaysUsed; offset++) {
            usedDays.add(startDay + offset);
        }

        if (totalCredit >= 120 * 60) {
            console.log(`🎯 Max Credit cap hit: ${Math.floor(totalCredit / 60)}h`);
            return { success: true, schedule };
        }
    }

    if (totalCredit >= 60 * 60) {
        console.log(`🎯 Max Credit base complete: ${Math.floor(totalCredit / 60)}h`);
        return { success: true, schedule };
    }

    console.log("⚠️ Forward build failed.");
    console.log(` • Pairing Instances Checked: ${pairings.length}`);
    console.log(` • Total Pairings Accepted: ${schedule.length}`);
    console.log(` • Final Credit: ${Math.floor(totalCredit / 60)}h (${totalCredit} mins)`);
    console.log(` • Days Worked: ${Array.from(usedDays).sort((a, b) => a - b).join(', ') || "None"}`);

    return { success: false };
}

function optimizeScheduleForMaxCredit(originalSchedule, allCandidates) {
    let schedule = [...originalSchedule];
    let improved = true;
    let loopCount = 0;
    const MAX_LOOPS = 100;

    const totalCredit = (list) => list.reduce((sum, p) => sum + parseTimeToMinutes(p.credit), 0);

    const countBlock = days => {
        const arr = Array.from(days).sort((a, b) => a - b);
        let maxBlock = 1;
        let block = 1;
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] === arr[i - 1] + 1) {
                block++;
                maxBlock = Math.max(maxBlock, block);
            } else {
                block = 1;
            }
        }
        return maxBlock;
    };

    const getDaysUsed = (sched) => {
        const set = new Set();
        sched.forEach(p => {
            const d = parseInt(p.pairingDate);
            for (let i = 0; i < p.calendarDaysUsed; i++) {
                set.add(d + i);
            }
        });
        return set;
    };

    while (improved && loopCount < MAX_LOOPS) {
        improved = false;
        loopCount++;

        console.log(`🔄 Max Credit Optimizer Loop ${loopCount}`);

        for (let i = 0; i < schedule.length; i++) {
            // Try replacing blocks of 1, 2, or 3 pairings
            for (let blockSize = 1; blockSize <= 3 && i + blockSize <= schedule.length; blockSize++) {
                const block = schedule.slice(i, i + blockSize);
                const blockCredit = totalCredit(block);
                const blockDays = getDaysUsed(block);
                const blockStartDay = parseInt(block[0].pairingDate);

                // Build candidate pool
                const candidates = allCandidates.filter(p => {
                    return (
                        !schedule.includes(p) &&
                        !block.some(bp => bp.pairingDate === p.pairingDate) &&
                        parseInt(p.pairingDate) >= blockStartDay - 1 &&
                        parseInt(p.pairingDate) <= blockStartDay + 4
                    );
                });

                // Try combinations of candidate pairings up to 3 at a time
                for (let c1 of candidates) {
                    for (let c2 of [null, ...candidates]) {
                        for (let c3 of [null, ...candidates]) {
                            const combo = [c1, c2, c3].filter(Boolean);
                            const comboCredit = totalCredit(combo);
                            if (comboCredit <= blockCredit) continue;

                            // Try substitution
                            const testSchedule = [...schedule];
                            testSchedule.splice(i, blockSize, ...combo);

                            const usedDays = getDaysUsed(testSchedule);
                            const blockLength = countBlock(usedDays);
                            if (blockLength > userRules.maxBlockSize || blockLength < userRules.minBlockSize) continue;

                            const testCredit = totalCredit(testSchedule);
                            if (testCredit > 120 * 60) continue;

                            const restSafe = testSchedule.every((p, idx) => {
                                if (idx === 0) return true;
                                const prev = testSchedule[idx - 1];
                                const prevEnd = hhmmToMinutes(prev.shiftStartTime) + parseTimeToMinutes(prev.tafb) + 30;
                                const dayGap = parseInt(p.pairingDate) - parseInt(prev.pairingDate);
                                const rest = hhmmToMinutes(p.shiftStartTime) + dayGap * 1440 - prevEnd;
                                return rest >= 600;
                            });

                            if (!restSafe) continue;

                            console.log(`🟢 Swapped block at index ${i} (size ${blockSize}) for +${Math.round((comboCredit - blockCredit) / 60)}h credit`);
                            schedule = testSchedule;
                            improved = true;
                            break;
                        }
                        if (improved) break;
                    }
                    if (improved) break;
                }

                if (improved) break;
            }
            if (improved) break;
        }
    }

    console.log(`✅ Max Credit Optimization complete after ${loopCount} rounds`);
    return schedule;
}



////////////////////////////////////////////////////////////////////////////////////////////////////////// Reverse Build

function tryBuildMaxCreditScheduleReverse(pairings) {
    const schedule = [];
    const usedDays = new Set();
    const usedStartDays = new Set();

    let totalCredit = 0;
    let lastDutyEnd = null;
    let lastStartDay = null;

    for (let i = pairings.length - 1; i >= 0; i--) {
        const p = pairings[i];
        const startDay = parseInt(p.pairingDate);
        const startTime = hhmmToMinutes(p.shiftStartTime);
        const tafb = parseTimeToMinutes(p.tafb);
        const dutyEnd = startTime + tafb + 30;

        const pairingKey = `${p.pairingNumber}-${p.pairingDate}`;
        if (usedStartDays.has(pairingKey)) continue;



        if (lastDutyEnd !== null) {
            const dayDiff = lastStartDay - startDay;
            const rest = lastDutyEnd - (startTime + dayDiff * 1440);
            if (rest < 600) continue;
        }

        const simulatedDays = new Set([...usedDays]);
        for (let offset = 0; offset < p.calendarDaysUsed; offset++) {
            simulatedDays.add(startDay + offset);
        }

        const sortedDays = Array.from(simulatedDays).sort((a, b) => a - b);
        let maxBlock = 1;
        let block = 1;
        for (let j = 1; j < sortedDays.length; j++) {
            if (sortedDays[j] === sortedDays[j - 1] + 1) {
                block++;
                maxBlock = Math.max(maxBlock, block);
            } else {
                block = 1;
            }
        }

        if (maxBlock > userRules.maxBlockSize || maxBlock < userRules.minBlockSize) continue;

        const pairingCredit = parseTimeToMinutes(p.credit);
        if (totalCredit + pairingCredit > contractualRules.monthlyCreditMax * 60) continue;

        schedule.push(p);
        totalCredit += pairingCredit;

        lastDutyEnd = dutyEnd;
        lastStartDay = startDay;
        usedStartDays.add(pairingKey);

        for (let offset = 0; offset < p.calendarDaysUsed; offset++) {
            usedDays.add(startDay + offset);
        }

        if (totalCredit >= 120 * 60) {
            console.log(`🎯 Max Credit cap hit (Reverse): ${Math.floor(totalCredit / 60)}h`);
            return { success: true, schedule };
        }
    }

    if (totalCredit >= 60 * 60) {
        console.log(`🎯 Max Credit base complete (Reverse): ${Math.floor(totalCredit / 60)}h`);
        return { success: true, schedule };
    }
    console.log("⚠️ Reverse build failed.");
    console.log(` • Pairing Instances Checked: ${pairings.length}`);
    console.log(` • Total Pairings Accepted: ${schedule.length}`);
    console.log(` • Final Credit: ${Math.floor(totalCredit / 60)}h (${totalCredit} mins)`);
    console.log(` • Days Worked: ${Array.from(usedDays).sort((a, b) => a - b).join(', ') || "None"}`);

    return { success: false };
}


/*
/////////////END OF MAX CREDIT ALGO///////////////////
*/