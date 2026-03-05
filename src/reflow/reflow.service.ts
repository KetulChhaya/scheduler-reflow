import { DateTime } from "luxon";
import type {
    ReflowInput,
    ReflowResult,
    WorkOrder,
    WorkCenter,
    ScheduleChange,
    Shift,
    MaintenanceWindow,
} from "./types.js";
import {
    advanceToNextShiftStart,
    advancePastMaintenance,
    calculateEndDateWithShifts,
} from "../utils/date-utils.js";
import { ConstraintChecker } from "./constraint-checker.js";

// Topological sort via Kahn's algorithm. Returns ordered IDs or throws on cycle.
function topologicalSort(workOrders: WorkOrder[]): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const wo of workOrders) {
        inDegree.set(wo.docId, inDegree.get(wo.docId) ?? 0);
        adjacency.set(wo.docId, adjacency.get(wo.docId) ?? []);
        for (const parentId of wo.data.dependsOnWorkOrderIds) {
            if (!adjacency.has(parentId)) adjacency.set(parentId, []);
            adjacency.get(parentId)!.push(wo.docId);
            inDegree.set(wo.docId, (inDegree.get(wo.docId) ?? 0) + 1);
        }
    }

    // @upgrade use a priority queue instead of array shift for better performance on large graphs
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
        const current = queue.shift()!;
        sorted.push(current);
        for (const child of adjacency.get(current) ?? []) {
            const newDeg = (inDegree.get(child) ?? 1) - 1;
            inDegree.set(child, newDeg);
            if (newDeg === 0) queue.push(child);
        }
    }

    if (sorted.length !== workOrders.length) {
        const missing = workOrders
            .filter((wo) => !sorted.includes(wo.docId))
            .map((wo) => wo.data.workOrderNumber);
        throw new Error(
            `Circular dependency detected involving: ${missing.join(", ")}`
        );
    }

    return sorted;
}

// Looks up shifts and maintenance windows for a given work center ID.
function getWorkCenterConfig(
    workCenterId: string,
    workCenters: WorkCenter[]
): { shifts: Shift[]; maintenanceWindows: MaintenanceWindow[] } {
    const wc = workCenters.find((c) => c.docId === workCenterId);
    if (!wc) throw new Error(`Work center not found: ${workCenterId}`);
    return {
        shifts: wc.data.shifts,
        maintenanceWindows: wc.data.maintenanceWindows,
    };
}

export class ReflowService {
    reflow(input: ReflowInput): ReflowResult {
        const { workOrders, workCenters } = input;
        const changes: ScheduleChange[] = [];
        const reasons: string[] = [];

        // Index for quick lookup
        const orderMap = new Map<string, WorkOrder>();
        for (const wo of workOrders) {
            orderMap.set(wo.docId, wo);
        }

        // Separate maintenance (immovable) from movable orders
        const movable = workOrders.filter((wo) => !wo.data.isMaintenance);
        const immovable = workOrders.filter((wo) => wo.data.isMaintenance);

        // Sort movable orders by dependency order
        // @upgrade sort movable orders by priority/due date before topological sort
        const sortedIds = topologicalSort(movable);

        // Track scheduled end dates per work center for conflict resolution
        const workCenterTimeline = new Map<string, DateTime[]>();

        // Pre-populate timelines with immovable orders
        for (const wo of immovable) {
            const endDt = DateTime.fromISO(wo.data.endDate, { zone: "utc" });
            const centerId = wo.data.workCenterId;
            if (!workCenterTimeline.has(centerId)) {
                workCenterTimeline.set(centerId, []);
            }
            workCenterTimeline.get(centerId)!.push(endDt);
        }

        // Deep clone for output
        const updatedOrders = new Map<string, WorkOrder>();
        for (const wo of immovable) {
            updatedOrders.set(wo.docId, structuredClone(wo));
        }

        // Process each movable order in topological order
        for (const orderId of sortedIds) {
            const wo = orderMap.get(orderId)!;
            const clone = structuredClone(wo);
            const { shifts, maintenanceWindows } = getWorkCenterConfig(
                wo.data.workCenterId,
                workCenters
            );

            // Earliest start from dependencies
            let earliest = DateTime.fromISO(wo.data.startDate, { zone: "utc" });
            for (const parentId of wo.data.dependsOnWorkOrderIds) {
                const parent = updatedOrders.get(parentId);
                if (!parent) {
                    throw new Error(
                        `Dependency ${parentId} not found for ${wo.data.workOrderNumber}`
                    );
                }
                const parentEnd = DateTime.fromISO(parent.data.endDate, {
                    zone: "utc",
                });
                if (parentEnd > earliest) {
                    earliest = parentEnd;
                }
            }

            // Earliest start from work center availability (no overlaps)
            const timeline = workCenterTimeline.get(wo.data.workCenterId) ?? [];
            for (const existingEnd of timeline) {
                if (existingEnd > earliest) {
                    earliest = existingEnd;
                }
            }

            // Snap to next valid shift start, then past any maintenance window
            let effectiveStart = advanceToNextShiftStart(earliest, shifts);
            effectiveStart = advancePastMaintenance(effectiveStart, shifts, maintenanceWindows);

            // Calculate end date respecting shifts and maintenance
            const effectiveEnd = calculateEndDateWithShifts(
                effectiveStart,
                wo.data.durationMinutes,
                shifts,
                maintenanceWindows
            );

            // Record changes
            const origStart = wo.data.startDate;
            const origEnd = wo.data.endDate;
            const newStart = effectiveStart.toISO()!;
            const newEnd = effectiveEnd.toISO()!;

            if (newStart !== origStart) {
                const reason = buildStartReason(wo, earliest, effectiveStart);
                changes.push({
                    workOrderId: wo.docId,
                    field: "startDate",
                    oldValue: origStart,
                    newValue: newStart,
                    reason,
                });
                reasons.push(
                    `${wo.data.workOrderNumber}: start moved (${reason})`
                );
            }

            if (newEnd !== origEnd) {
                changes.push({
                    workOrderId: wo.docId,
                    field: "endDate",
                    oldValue: origEnd,
                    newValue: newEnd,
                    reason: "Recalculated from new start + shift/maintenance constraints",
                });
                reasons.push(
                    `${wo.data.workOrderNumber}: end moved to ${newEnd}`
                );
            }

            clone.data.startDate = newStart;
            clone.data.endDate = newEnd;
            updatedOrders.set(orderId, clone);

            // Update timeline
            if (!workCenterTimeline.has(wo.data.workCenterId)) {
                workCenterTimeline.set(wo.data.workCenterId, []);
            }
            workCenterTimeline.get(wo.data.workCenterId)!.push(effectiveEnd);
        }

        const allUpdated = workOrders.map((wo) => updatedOrders.get(wo.docId)!);

        // Post-reflow validation: throw if constraints can't be satisfied
        const checker = new ConstraintChecker();
        const violations = checker.validate(allUpdated, workCenters);
        if (violations.length > 0) {
            const details = violations
                .map((v) => `[${v.type}] ${v.message}`)
                .join("\n");
            throw new Error(
                `No valid schedule found. ${violations.length} constraint(s) unsatisfied:\n${details}`
            );
        }

        const explanation =
            changes.length === 0
                ? "No changes required. Schedule is already valid."
                : `${changes.length} change(s) applied:\n${reasons.join("\n")}`;

        return { updatedWorkOrders: allUpdated, changes, explanation };
    }
}

// Builds a human-readable reason for why a start date moved.
function buildStartReason(
    wo: WorkOrder,
    earliest: DateTime,
    effectiveStart: DateTime
): string {
    const parts: string[] = [];
    const origStart = DateTime.fromISO(wo.data.startDate, { zone: "utc" });

    if (wo.data.dependsOnWorkOrderIds.length > 0 && earliest > origStart) {
        parts.push("dependency not yet complete");
    }
    if (effectiveStart > earliest) {
        parts.push("shifted to next available shift window");
    }
    if (parts.length === 0) {
        parts.push("work center conflict");
    }
    return parts.join("; ");
}
