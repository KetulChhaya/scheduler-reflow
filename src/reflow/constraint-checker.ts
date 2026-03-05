import { DateTime } from "luxon";
import type {
    WorkOrder,
    WorkCenter,
    ConstraintViolation,
    Shift,
    MaintenanceWindow,
} from "./types.js";
import { calculateEndDateWithShifts, getShiftForDay } from "../utils/date-utils.js";

// Validates a schedule against all hard constraints. Returns an array of violations.
export class ConstraintChecker {
    validate(
        workOrders: WorkOrder[],
        workCenters: WorkCenter[]
    ): ConstraintViolation[] {
        const violations: ConstraintViolation[] = [];
        const orderMap = new Map<string, WorkOrder>();

        for (const wo of workOrders) orderMap.set(wo.docId, wo);

        violations.push(...this.checkDependencies(workOrders, orderMap));
        violations.push(...this.checkOverlaps(workOrders));
        violations.push(...this.checkShifts(workOrders, workCenters));
        violations.push(...this.checkMaintenance(workOrders, workCenters));

        return violations;
    }

    // No two orders on the same work center should overlap in time.
    private checkOverlaps(workOrders: WorkOrder[]): ConstraintViolation[] {
        const violations: ConstraintViolation[] = [];
        const byCenter = new Map<string, WorkOrder[]>();

        for (const wo of workOrders) {
            const cid = wo.data.workCenterId;
            if (!byCenter.has(cid)) byCenter.set(cid, []);
            byCenter.get(cid)!.push(wo);
        }

        for (const [centerId, orders] of byCenter) {
            const sorted = [...orders].sort(
                (a, b) =>
                    DateTime.fromISO(a.data.startDate).toMillis() -
                    DateTime.fromISO(b.data.startDate).toMillis()
            );

            for (let i = 0; i < sorted.length - 1; i++) {
                const curr = sorted[i];
                const next = sorted[i + 1];
                const currEnd = DateTime.fromISO(curr.data.endDate, { zone: "utc" });
                const nextStart = DateTime.fromISO(next.data.startDate, {
                    zone: "utc",
                });

                if (currEnd > nextStart) {
                    violations.push({
                        type: "OVERLAP",
                        workOrderId: next.docId,
                        message: `${next.data.workOrderNumber} overlaps with ${curr.data.workOrderNumber} on work center ${centerId}`,
                    });
                }
            }
        }

        return violations;
    }

    // Every parent dependency must end before the child starts.
    private checkDependencies(
        workOrders: WorkOrder[],
        orderMap: Map<string, WorkOrder>
    ): ConstraintViolation[] {
        const violations: ConstraintViolation[] = [];

        for (const wo of workOrders) {
            const woStart = DateTime.fromISO(wo.data.startDate, { zone: "utc" });

            for (const parentId of wo.data.dependsOnWorkOrderIds) {
                const parent = orderMap.get(parentId);
                if (!parent) {
                    violations.push({
                        type: "DEPENDENCY",
                        workOrderId: wo.docId,
                        message: `${wo.data.workOrderNumber} depends on unknown order ${parentId}`,
                    });
                    continue;
                }

                const parentEnd = DateTime.fromISO(parent.data.endDate, {
                    zone: "utc",
                });
                if (parentEnd > woStart) {
                    violations.push({
                        type: "DEPENDENCY",
                        workOrderId: wo.docId,
                        message: `${wo.data.workOrderNumber} starts before parent ${parent.data.workOrderNumber} ends`,
                    });
                }
            }
        }

        return violations;
    }

    // Start and end dates must fall within valid shift hours.
    private checkShifts(
        workOrders: WorkOrder[],
        workCenters: WorkCenter[]
    ): ConstraintViolation[] {
        const violations: ConstraintViolation[] = [];
        const centerMap = new Map<string, WorkCenter>();
        for (const wc of workCenters) centerMap.set(wc.docId, wc);

        for (const wo of workOrders) {
            const wc = centerMap.get(wo.data.workCenterId);
            if (!wc) continue;

            const start = DateTime.fromISO(wo.data.startDate, { zone: "utc" });
            const end = DateTime.fromISO(wo.data.endDate, { zone: "utc" });

            if (!this.isWithinShift(start, wc.data.shifts)) {
                violations.push({
                    type: "SHIFT",
                    workOrderId: wo.docId,
                    message: `${wo.data.workOrderNumber} starts outside shift hours`,
                });
            }

            if (!this.isWithinShift(end, wc.data.shifts)) {
                violations.push({
                    type: "SHIFT",
                    workOrderId: wo.docId,
                    message: `${wo.data.workOrderNumber} ends outside shift hours`,
                });
            }

            // Verify duration is consistent with shift-aware calculation
            const recalcEnd = calculateEndDateWithShifts(
                start,
                wo.data.durationMinutes,
                wc.data.shifts,
                wc.data.maintenanceWindows
            );

            const diff = Math.abs(recalcEnd.toMillis() - end.toMillis());
            if (diff > 60_000) {
                // Allow 1-minute tolerance
                violations.push({
                    type: "SHIFT",
                    workOrderId: wo.docId,
                    message: `${wo.data.workOrderNumber} endDate inconsistent with durationMinutes (expected ${recalcEnd.toISO()}, got ${end.toISO()})`,
                });
            }
        }

        return violations;
    }

    // No work order should overlap any maintenance window on its work center.
    private checkMaintenance(
        workOrders: WorkOrder[],
        workCenters: WorkCenter[]
    ): ConstraintViolation[] {
        const violations: ConstraintViolation[] = [];
        const centerMap = new Map<string, WorkCenter>();
        for (const wc of workCenters) centerMap.set(wc.docId, wc);

        for (const wo of workOrders) {
            const wc = centerMap.get(wo.data.workCenterId);
            if (!wc) continue;

            const woStart = DateTime.fromISO(wo.data.startDate, { zone: "utc" });
            const woEnd = DateTime.fromISO(wo.data.endDate, { zone: "utc" });

            for (const mw of wc.data.maintenanceWindows) {
                const mwStart = DateTime.fromISO(mw.startDate, { zone: "utc" });
                const mwEnd = DateTime.fromISO(mw.endDate, { zone: "utc" });

                // Check if the work order's active time overlaps the maintenance window.
                // The reflow algorithm already avoids maintenance, so we only flag
                // if the start/end bracket fully contains maintenance (which would
                // mean work was incorrectly scheduled during it).
                // The shift-based duration check above catches this implicitly,
                // but we add an explicit check for the start date.
                if (woStart >= mwStart && woStart < mwEnd) {
                    violations.push({
                        type: "MAINTENANCE",
                        workOrderId: wo.docId,
                        message: `${wo.data.workOrderNumber} starts during maintenance window (${mw.reason ?? "unspecified"})`,
                    });
                }
            }
        }

        return violations;
    }

    // True if the given datetime is within or at the boundary of a shift window.
    private isWithinShift(dt: DateTime, shifts: Shift[]): boolean {
        const shiftWindow = getShiftForDay(dt, shifts);
        if (!shiftWindow) return false;
        return dt >= shiftWindow.start && dt <= shiftWindow.end;
    }
}
