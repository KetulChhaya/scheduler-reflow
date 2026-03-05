import { DateTime } from "luxon";
import type { Shift, MaintenanceWindow } from "../reflow/types.js";

// Returns shift window for a given date's weekday, or null if no shift that day.
// @upgrade support multiple shift windows per day natively (currently achievable via maintenance windows as gaps)
export function getShiftForDay(
    date: DateTime,
    shifts: Shift[]
): { start: DateTime; end: DateTime } | null {
    const dow = date.weekday % 7; // Luxon: Mon=1..Sun=7; spec: Sun=0..Sat=6
    const match = shifts.find((s) => s.dayOfWeek === dow);
    if (!match) return null;

    const start = date.set({
        hour: match.startHour,
        minute: 0,
        second: 0,
        millisecond: 0,
    });
    const end = date.set({
        hour: match.endHour,
        minute: 0,
        second: 0,
        millisecond: 0,
    });
    return { start, end };
}

// Advances to the next valid shift start. Returns unchanged if already inside a shift.
export function advanceToNextShiftStart(
    date: DateTime,
    shifts: Shift[]
): DateTime {
    const shiftWindow = getShiftForDay(date, shifts);
    if (shiftWindow && date >= shiftWindow.start && date < shiftWindow.end) {
        return date;
    }
    if (shiftWindow && date < shiftWindow.start) {
        return shiftWindow.start;
    }

    // Scan forward up to 7 days to find next shift day
    for (let i = 1; i <= 7; i++) {
        const next = date.plus({ days: i });
        const nextShift = getShiftForDay(next, shifts);
        if (nextShift) return nextShift.start;
    }

    throw new Error("[SHIFT] No valid shift found within 7 days from " + date.toISO());
}

// Subtracts maintenance windows from a single interval, returning available sub-intervals.
function subtractMaintenance(
    start: DateTime,
    end: DateTime,
    windows: MaintenanceWindow[]
): Array<{ start: DateTime; end: DateTime }> {
    let intervals: Array<{ start: DateTime; end: DateTime }> = [{ start, end }];

    for (const mw of windows) {
        const mwStart = DateTime.fromISO(mw.startDate, { zone: "utc" });
        const mwEnd = DateTime.fromISO(mw.endDate, { zone: "utc" });
        const next: Array<{ start: DateTime; end: DateTime }> = [];

        for (const iv of intervals) {
            if (mwEnd <= iv.start || mwStart >= iv.end) {
                // No overlap
                next.push(iv);
            } else {
                // Split around maintenance window
                if (mwStart > iv.start) {
                    next.push({ start: iv.start, end: mwStart });
                }
                if (mwEnd < iv.end) {
                    next.push({ start: mwEnd, end: iv.end });
                }
            }
        }
        intervals = next;
    }

    return intervals;
}

// Calculates end date by consuming durationMinutes of working time (shift hours minus maintenance).
// @upgrade add setupTimeMinutes support - consume setup time before production time
export function calculateEndDateWithShifts(
    startDate: DateTime,
    durationMinutes: number,
    shifts: Shift[],
    maintenanceWindows: MaintenanceWindow[]
): DateTime {
    let cursor = advanceToNextShiftStart(startDate, shifts);
    let remaining = durationMinutes;

    // Safety limit to prevent infinite loops
    const maxDays = 365;
    let daysScanned = 0;

    while (remaining > 0) {
        if (daysScanned++ > maxDays) {
            throw new Error(
                `[SHIFT] Cannot schedule ${durationMinutes} min of work within ${maxDays} days as no sufficient shift windows available from ${startDate.toISO()}`
            );
        }

        const shiftWindow = getShiftForDay(cursor, shifts);
        if (!shiftWindow) {
            cursor = advanceToNextShiftStart(cursor, shifts);
            continue;
        }

        // Clamp to current position within the shift
        const blockStart = cursor > shiftWindow.start ? cursor : shiftWindow.start;
        const blockEnd = shiftWindow.end;

        if (blockStart >= blockEnd) {
            cursor = advanceToNextShiftStart(
                cursor.plus({ days: 1 }).startOf("day"),
                shifts
            );
            continue;
        }

        // Get available sub-intervals after removing maintenance windows
        const available = subtractMaintenance(
            blockStart,
            blockEnd,
            maintenanceWindows
        );

        for (const iv of available) {
            if (remaining <= 0) break;
            const ivMinutes = iv.end.diff(iv.start, "minutes").minutes;
            if (ivMinutes <= 0) continue;

            if (remaining <= ivMinutes) {
                cursor = iv.start.plus({ minutes: remaining });
                remaining = 0;
            } else {
                remaining -= ivMinutes;
                cursor = iv.end;
            }
        }

        if (remaining > 0) {
            cursor = advanceToNextShiftStart(
                cursor.plus({ days: 1 }).startOf("day"),
                shifts
            );
        }
    }

    return cursor;
}

// Checks if a point in time falls inside any maintenance window.
export function isWithinMaintenanceWindow(
    date: DateTime,
    maintenanceWindows: MaintenanceWindow[]
): boolean {
    for (const mw of maintenanceWindows) {
        const mwStart = DateTime.fromISO(mw.startDate, { zone: "utc" });
        const mwEnd = DateTime.fromISO(mw.endDate, { zone: "utc" });
        if (date >= mwStart && date < mwEnd) return true;
    }
    return false;
}

// Advances past any overlapping maintenance window, then re-snaps to shift.
export function advancePastMaintenance(
    date: DateTime,
    shifts: Shift[],
    maintenanceWindows: MaintenanceWindow[]
): DateTime {
    let cursor = date;
    for (const mw of maintenanceWindows) {
        const mwStart = DateTime.fromISO(mw.startDate, { zone: "utc" });
        const mwEnd = DateTime.fromISO(mw.endDate, { zone: "utc" });
        if (cursor >= mwStart && cursor < mwEnd) {
            cursor = mwEnd;
        }
    }
    return cursor > date ? advanceToNextShiftStart(cursor, shifts) : date;
}
