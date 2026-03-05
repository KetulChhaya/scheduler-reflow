// Scenario 3 - Multi-Constraint
// Setup: 2 work centers (WC-1: 8AM-5PM, WC-2: 7AM-4PM). Maintenance on WC-1 Wed 9-11AM.
//   WO-001 on WC-2 (180min), WO-002 on WC-1 (300min, depends on WO-001), WO-003 on WC-1 (600min, depends on WO-002).
// Expected: WO-001 unchanged (Mon 1-4PM). WO-002 unchanged (Tue 8AM-1PM).
//   WO-003 starts Tue 1PM, works Tue 1-5PM (240min), Wed 8-9AM (60min), skips 9-11AM maintenance,
//   resumes Wed 11AM-4PM (300min). Ends Wed 4PM.
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
        name: "Extrusion Line 1",
        shifts: [1, 2, 3, 4, 5].map((day) => ({
            dayOfWeek: day,
            startHour: 8,
            endHour: 17,
        })),
        maintenanceWindows: [
            {
                startDate: "2026-03-11T09:00:00.000Z",
                endDate: "2026-03-11T11:00:00.000Z",
                reason: "Weekly die cleaning",
            },
        ],
    },
};

const wc2: WorkCenter = {
    docId: "wc-2",
    docType: "workCenter",
    data: {
        name: "Extrusion Line 2",
        shifts: [1, 2, 3, 4, 5].map((day) => ({
            dayOfWeek: day,
            startHour: 7,
            endHour: 16,
        })),
        maintenanceWindows: [],
    },
};

const wo1: WorkOrder = {
    docId: "wo-1",
    docType: "workOrder",
    data: {
        workOrderNumber: "WO-001",
        manufacturingOrderId: "mo-1",
        workCenterId: "wc-2",
        startDate: "2026-03-09T13:00:00.000Z",
        endDate: "2026-03-09T16:00:00.000Z",
        durationMinutes: 180,
        isMaintenance: false,
        dependsOnWorkOrderIds: [],
    },
};

const wo2: WorkOrder = {
    docId: "wo-2",
    docType: "workOrder",
    data: {
        workOrderNumber: "WO-002",
        manufacturingOrderId: "mo-1",
        workCenterId: "wc-1",
        startDate: "2026-03-10T08:00:00.000Z",
        endDate: "2026-03-10T13:00:00.000Z",
        durationMinutes: 300,
        isMaintenance: false,
        dependsOnWorkOrderIds: ["wo-1"],
    },
};

// 600min starting Tue 1PM. Tue 1-5PM (240), Wed 8-9AM (60), skip 9-11AM maintenance, Wed 11AM-4PM (300). Done Wed 4PM.
const wo3: WorkOrder = {
    docId: "wo-3",
    docType: "workOrder",
    data: {
        workOrderNumber: "WO-003",
        manufacturingOrderId: "mo-1",
        workCenterId: "wc-1",
        startDate: "2026-03-10T13:00:00.000Z",
        endDate: "2026-03-10T23:00:00.000Z", // incorrect original
        durationMinutes: 600,
        isMaintenance: false,
        dependsOnWorkOrderIds: ["wo-2"],
    },
};

const mo1: ManufacturingOrder = {
    docId: "mo-1",
    docType: "manufacturingOrder",
    data: {
        manufacturingOrderNumber: "MO-001",
        itemId: "PIPE-300",
        quantity: 800,
        dueDate: "2026-03-14T17:00:00.000Z",
    },
};

export const scenario3: ReflowInput = {
    workOrders: [wo1, wo2, wo3],
    workCenters: [wc1, wc2],
    manufacturingOrders: [mo1],
};
