// Scenario 1 - Delay Cascade
// Setup: 3 work orders (WO-001 -> WO-002 -> WO-003) on one work center, Mon-Fri 8AM-5PM.
// Disruption: WO-001 ran 2 hours late, ending at 12PM instead of 10AM.
// Expected: WO-002 shifts from 10AM to 12PM (ends 1:30PM). WO-003 shifts from 11:30AM to 1:30PM (ends 2:30PM).
import type {
    WorkOrder,
    WorkCenter,
    ManufacturingOrder,
    ReflowInput,
} from "../reflow/types.js";

const workCenter: WorkCenter = {
    docId: "wc-1",
    docType: "workCenter",
    data: {
        name: "Extrusion Line 1",
        shifts: [1, 2, 3, 4, 5].map((day) => ({
            dayOfWeek: day,
            startHour: 8,
            endHour: 17,
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
        workCenterId: "wc-1",
        startDate: "2026-03-09T08:00:00.000Z",
        endDate: "2026-03-09T12:00:00.000Z", // delayed 2h from original 10:00
        durationMinutes: 240,
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
        startDate: "2026-03-09T10:00:00.000Z", // original, before delay
        endDate: "2026-03-09T11:30:00.000Z",
        durationMinutes: 90,
        isMaintenance: false,
        dependsOnWorkOrderIds: ["wo-1"],
    },
};

const wo3: WorkOrder = {
    docId: "wo-3",
    docType: "workOrder",
    data: {
        workOrderNumber: "WO-003",
        manufacturingOrderId: "mo-1",
        workCenterId: "wc-1",
        startDate: "2026-03-09T11:30:00.000Z",
        endDate: "2026-03-09T12:30:00.000Z",
        durationMinutes: 60,
        isMaintenance: false,
        dependsOnWorkOrderIds: ["wo-2"],
    },
};

const mo1: ManufacturingOrder = {
    docId: "mo-1",
    docType: "manufacturingOrder",
    data: {
        manufacturingOrderNumber: "MO-001",
        itemId: "PIPE-100",
        quantity: 500,
        dueDate: "2026-03-13T17:00:00.000Z",
    },
};

export const scenario1: ReflowInput = {
    workOrders: [wo1, wo2, wo3],
    workCenters: [workCenter],
    manufacturingOrders: [mo1],
};
