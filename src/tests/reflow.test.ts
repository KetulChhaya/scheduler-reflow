import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { ReflowService } from "../reflow/reflow.service.js";
import { ConstraintChecker } from "../reflow/constraint-checker.js";
import { calculateEndDateWithShifts, advancePastMaintenance } from "../utils/date-utils.js";
import { scenario1 } from "../data/scenario-1.js";
import { scenario2 } from "../data/scenario-2.js";
import { scenario3 } from "../data/scenario-3.js";
import { scenario4 } from "../data/scenario-4.js";
import { scenario5 } from "../data/scenario-5.js";
import type { WorkOrder, WorkCenter, ReflowInput } from "../reflow/types.js";

const reflow = new ReflowService();
const checker = new ConstraintChecker();

// helper to build a minimal work center with Mon-Fri 8-5 shifts
function makeWorkCenter(id: string, maintenance: WorkCenter["data"]["maintenanceWindows"] = []): WorkCenter {
    return {
        docId: id,
        docType: "workCenter",
        data: {
            name: `WC ${id}`,
            shifts: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startHour: 8, endHour: 17 })),
            maintenanceWindows: maintenance,
        },
    };
}

// helper to build a work order
function makeOrder(
    id: string,
    centerId: string,
    start: string,
    end: string,
    duration: number,
    deps: string[] = []
): WorkOrder {
    return {
        docId: id,
        docType: "workOrder",
        data: {
            workOrderNumber: id.toUpperCase(),
            manufacturingOrderId: "mo-1",
            workCenterId: centerId,
            startDate: start,
            endDate: end,
            durationMinutes: duration,
            isMaintenance: false,
            dependsOnWorkOrderIds: deps,
        },
    };
}

// ---- Scenario tests ----

describe("scenario tests", () => {
    it("scenario 1: delay cascade pushes dependent orders forward", () => {
        const result = reflow.reflow(scenario1);
        const violations = checker.validate(result.updatedWorkOrders, scenario1.workCenters);

        expect(violations).toHaveLength(0);
        expect(result.changes.length).toBeGreaterThan(0);

        // WO-002 should start at noon since WO-001 ends at noon
        const wo2 = result.updatedWorkOrders.find((w) => w.docId === "wo-2")!;
        expect(wo2.data.startDate).toBe("2026-03-09T12:00:00.000Z");
        expect(wo2.data.endDate).toBe("2026-03-09T13:30:00.000Z");

        // WO-003 should start right after WO-002
        const wo3 = result.updatedWorkOrders.find((w) => w.docId === "wo-3")!;
        expect(wo3.data.startDate).toBe("2026-03-09T13:30:00.000Z");
        expect(wo3.data.endDate).toBe("2026-03-09T14:30:00.000Z");
    });

    it("scenario 2: order spans shift boundary and avoids maintenance", () => {
        const result = reflow.reflow(scenario2);
        const violations = checker.validate(result.updatedWorkOrders, scenario2.workCenters);

        expect(violations).toHaveLength(0);

        // WO-001 starts Mon 3PM, works until 5PM (120min), resumes Tue 8AM, finishes Tue 10AM
        const wo = result.updatedWorkOrders.find((w) => w.docId === "wo-1")!;
        expect(wo.data.startDate).toBe("2026-03-09T15:00:00.000Z");
        expect(wo.data.endDate).toBe("2026-03-10T10:00:00.000Z");
    });

    it("scenario 3: cross-center deps with maintenance avoidance", () => {
        const result = reflow.reflow(scenario3);
        const violations = checker.validate(result.updatedWorkOrders, scenario3.workCenters);

        expect(violations).toHaveLength(0);

        // WO-003 should end Wed 4PM after skipping Wed 9-11AM maintenance
        const wo3 = result.updatedWorkOrders.find((w) => w.docId === "wo-3")!;
        expect(wo3.data.endDate).toBe("2026-03-11T16:00:00.000Z");
    });

    it("scenario 4: weekend skip pauses work until Monday", () => {
        const result = reflow.reflow(scenario4);
        const violations = checker.validate(result.updatedWorkOrders, scenario4.workCenters);

        expect(violations).toHaveLength(0);

        // WO-001: Fri 4-5PM (60min), skip Sat/Sun, Mon 8-10AM (120min)
        const wo = result.updatedWorkOrders.find((w) => w.docId === "wo-1")!;
        expect(wo.data.startDate).toBe("2026-03-13T16:00:00.000Z");
        expect(wo.data.endDate).toBe("2026-03-16T10:00:00.000Z");
    });

    it("scenario 5: delay cascades through maintenance and weekend across 3 centers", () => {
        const result = reflow.reflow(scenario5);
        const violations = checker.validate(result.updatedWorkOrders, scenario5.workCenters);

        expect(violations).toHaveLength(0);

        // WO-002: pushed to Thu 3PM, hits Fri maintenance, ends Fri 1PM
        const wo2 = result.updatedWorkOrders.find((w) => w.docId === "wo-2")!;
        expect(wo2.data.startDate).toBe("2026-03-12T15:00:00.000Z");
        expect(wo2.data.endDate).toBe("2026-03-13T13:00:00.000Z");

        // WO-003: pushed to Fri 1PM, hits weekend, ends Mon 12PM
        const wo3 = result.updatedWorkOrders.find((w) => w.docId === "wo-3")!;
        expect(wo3.data.startDate).toBe("2026-03-13T13:00:00.000Z");
        expect(wo3.data.endDate).toBe("2026-03-16T12:00:00.000Z");
    });
});

// ---- Edge case tests ----

describe("edge cases", () => {
    it("throws on circular dependencies", () => {
        const wc = makeWorkCenter("wc-1");
        const a = makeOrder("wo-1", "wc-1", "2026-03-09T08:00:00.000Z", "2026-03-09T09:00:00.000Z", 60, ["wo-2"]);
        const b = makeOrder("wo-2", "wc-1", "2026-03-09T09:00:00.000Z", "2026-03-09T10:00:00.000Z", 60, ["wo-1"]);

        const input: ReflowInput = {
            workOrders: [a, b],
            workCenters: [wc],
            manufacturingOrders: [],
        };

        expect(() => reflow.reflow(input)).toThrow("Circular dependency");
    });

    it("throws when work center is missing", () => {
        const order = makeOrder("wo-1", "wc-missing", "2026-03-09T08:00:00.000Z", "2026-03-09T09:00:00.000Z", 60);

        const input: ReflowInput = {
            workOrders: [order],
            workCenters: [], // no centers at all
            manufacturingOrders: [],
        };

        expect(() => reflow.reflow(input)).toThrow("Work center not found");
    });

    it("handles an already-valid schedule with no changes", () => {
        const wc = makeWorkCenter("wc-1");
        const order = makeOrder("wo-1", "wc-1", "2026-03-09T08:00:00.000Z", "2026-03-09T09:00:00.000Z", 60);

        const input: ReflowInput = {
            workOrders: [order],
            workCenters: [wc],
            manufacturingOrders: [],
        };

        const result = reflow.reflow(input);
        expect(result.changes).toHaveLength(0);
    });
});

// ---- Constraint validation tests ----

describe("constraint checker", () => {
    it("catches overlapping orders on the same center", () => {
        const wc = makeWorkCenter("wc-1");
        // two orders that overlap: 8-10AM and 9-11AM
        const a = makeOrder("wo-1", "wc-1", "2026-03-09T08:00:00.000Z", "2026-03-09T10:00:00.000Z", 120);
        const b = makeOrder("wo-2", "wc-1", "2026-03-09T09:00:00.000Z", "2026-03-09T11:00:00.000Z", 120);

        const violations = checker.validate([a, b], [wc]);
        const overlaps = violations.filter((v) => v.type === "OVERLAP");
        expect(overlaps.length).toBeGreaterThan(0);
    });

    it("catches dependency violation when child starts before parent ends", () => {
        const wc = makeWorkCenter("wc-1");
        const parent = makeOrder("wo-1", "wc-1", "2026-03-09T08:00:00.000Z", "2026-03-09T12:00:00.000Z", 240);
        // child starts at 10AM but parent ends at 12PM
        const child = makeOrder("wo-2", "wc-1", "2026-03-09T10:00:00.000Z", "2026-03-09T11:00:00.000Z", 60, ["wo-1"]);

        const violations = checker.validate([parent, child], [wc]);
        const depViolations = violations.filter((v) => v.type === "DEPENDENCY");
        expect(depViolations.length).toBeGreaterThan(0);
    });

    it("catches order starting outside shift hours", () => {
        const wc = makeWorkCenter("wc-1"); // shifts 8-17
        // starts at 6AM, before shift
        const order = makeOrder("wo-1", "wc-1", "2026-03-09T06:00:00.000Z", "2026-03-09T07:00:00.000Z", 60);

        const violations = checker.validate([order], [wc]);
        const shiftViolations = violations.filter((v) => v.type === "SHIFT");
        expect(shiftViolations.length).toBeGreaterThan(0);
    });

    it("catches order starting during maintenance window", () => {
        const wc = makeWorkCenter("wc-1", [
            { startDate: "2026-03-09T10:00:00.000Z", endDate: "2026-03-09T12:00:00.000Z", reason: "PM" },
        ]);
        // starts at 10:30AM, inside maintenance
        const order = makeOrder("wo-1", "wc-1", "2026-03-09T10:30:00.000Z", "2026-03-09T11:30:00.000Z", 60);

        const violations = checker.validate([order], [wc]);
        const maint = violations.filter((v) => v.type === "MAINTENANCE");
        expect(maint.length).toBeGreaterThan(0);
    });
});

// ---- Date utility tests ----

describe("date utilities", () => {
    const shifts = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startHour: 8, endHour: 17 }));

    it("calculates end date within a single shift", () => {
        const start = DateTime.fromISO("2026-03-09T08:00:00.000Z", { zone: "utc" });
        const end = calculateEndDateWithShifts(start, 120, shifts, []);
        expect(end.toISO()).toBe("2026-03-09T10:00:00.000Z");
    });

    it("spans across shifts when duration exceeds remaining time", () => {
        // start at 4PM, only 60min left in shift, need 120min total
        const start = DateTime.fromISO("2026-03-09T16:00:00.000Z", { zone: "utc" });
        const end = calculateEndDateWithShifts(start, 120, shifts, []);
        // 60min Mon 4-5PM + 60min Tue 8-9AM
        expect(end.toISO()).toBe("2026-03-10T09:00:00.000Z");
    });

    it("skips maintenance window when calculating end date", () => {
        const start = DateTime.fromISO("2026-03-09T09:00:00.000Z", { zone: "utc" });
        const maint = [{ startDate: "2026-03-09T10:00:00.000Z", endDate: "2026-03-09T12:00:00.000Z", reason: "PM" }];
        // 180min: 9-10AM (60min), skip 10-12, 12-2:30PM (120min) = done at 2PM
        const end = calculateEndDateWithShifts(start, 180, shifts, maint);
        expect(end.toISO()).toBe("2026-03-09T14:00:00.000Z");
    });

    it("advancePastMaintenance moves cursor past a window", () => {
        const dt = DateTime.fromISO("2026-03-09T10:30:00.000Z", { zone: "utc" });
        const maint = [{ startDate: "2026-03-09T10:00:00.000Z", endDate: "2026-03-09T12:00:00.000Z", reason: "PM" }];
        const result = advancePastMaintenance(dt, shifts, maint);
        // should jump to 12PM (end of maintenance), which is still in shift
        expect(result.toISO()).toBe("2026-03-09T12:00:00.000Z");
    });
});
