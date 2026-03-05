// Scenario 5 - Mixed (delay + maintenance + weekend)
// Setup: 3 work centers. WC-2 has maintenance Fri 10AM-12PM. Chain: WO-001 -> WO-002 -> WO-003.
//   WO-001 on WC-1 (240min): delayed 3h, starts Thu 11AM instead of 8AM. Ends Thu 3PM.
//   WO-002 on WC-2 (300min): depends on WO-001, original start Thu 12PM (now stale).
//   WO-003 on WC-3 (480min): depends on WO-002, original start Thu 5PM (now stale).
// Expected:
//   WO-001: unchanged (Thu 11AM-3PM, already correct).
//   WO-002: starts Thu 3PM. Thu 3-5PM (120), Fri 8-10AM (120), skip maint 10-12, Fri 12-1PM (60). Ends Fri 1PM.
//   WO-003: starts Fri 1PM. Fri 1-5PM (240), skip weekend, Mon 8AM-12PM (240). Ends Mon 12PM.
import type {
    WorkOrder,
    WorkCenter,
    ManufacturingOrder,
    ReflowInput,
} from "../reflow/types.js";

const wc1: WorkCenter = {
    docId: "wc-1",
    docType: "workCenter",
    data: {
        name: "Cutting Station",
        shifts: [1, 2, 3, 4, 5].map((day) => ({
            dayOfWeek: day,
            startHour: 8,
            endHour: 17,
        })),
        maintenanceWindows: [],
    },
};

const wc2: WorkCenter = {
    docId: "wc-2",
    docType: "workCenter",
    data: {
        name: "Welding Bay",
        shifts: [1, 2, 3, 4, 5].map((day) => ({
            dayOfWeek: day,
            startHour: 8,
            endHour: 17,
        })),
        maintenanceWindows: [
            {
                startDate: "2026-03-13T10:00:00.000Z", // Fri 10AM
                endDate: "2026-03-13T12:00:00.000Z",   // Fri 12PM
                reason: "Weekly equipment inspection",
            },
        ],
    },
};

const wc3: WorkCenter = {
    docId: "wc-3",
    docType: "workCenter",
    data: {
        name: "Assembly Line",
        shifts: [1, 2, 3, 4, 5].map((day) => ({
            dayOfWeek: day,
            startHour: 8,
            endHour: 17,
        })),
        maintenanceWindows: [],
    },
};

// delayed 3h: was supposed to start Thu 8AM, now starts Thu 11AM
const wo1: WorkOrder = {
    docId: "wo-1",
    docType: "workOrder",
    data: {
        workOrderNumber: "WO-001",
        manufacturingOrderId: "mo-1",
        workCenterId: "wc-1",
        startDate: "2026-03-12T11:00:00.000Z", // Thu 11AM (3h late)
        endDate: "2026-03-12T15:00:00.000Z",   // Thu 3PM
        durationMinutes: 240,
        isMaintenance: false,
        dependsOnWorkOrderIds: [],
    },
};

// depends on WO-001, original schedule is stale
const wo2: WorkOrder = {
    docId: "wo-2",
    docType: "workOrder",
    data: {
        workOrderNumber: "WO-002",
        manufacturingOrderId: "mo-1",
        workCenterId: "wc-2",
        startDate: "2026-03-12T12:00:00.000Z", // stale: assumed WO-001 done at noon
        endDate: "2026-03-12T17:00:00.000Z",   // stale
        durationMinutes: 300,
        isMaintenance: false,
        dependsOnWorkOrderIds: ["wo-1"],
    },
};

// depends on WO-002, should spill into next week
const wo3: WorkOrder = {
    docId: "wo-3",
    docType: "workOrder",
    data: {
        workOrderNumber: "WO-003",
        manufacturingOrderId: "mo-1",
        workCenterId: "wc-3",
        startDate: "2026-03-12T17:00:00.000Z", // stale
        endDate: "2026-03-13T09:00:00.000Z",   // stale
        durationMinutes: 480,
        isMaintenance: false,
        dependsOnWorkOrderIds: ["wo-2"],
    },
};

const mo1: ManufacturingOrder = {
    docId: "mo-1",
    docType: "manufacturingOrder",
    data: {
        manufacturingOrderNumber: "MO-001",
        itemId: "PIPE-500",
        quantity: 600,
        dueDate: "2026-03-20T17:00:00.000Z",
    },
};

export const scenario5: ReflowInput = {
    workOrders: [wo1, wo2, wo3],
    workCenters: [wc1, wc2, wc3],
    manufacturingOrders: [mo1],
};
