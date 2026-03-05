// Scenario 4 - Weekend Skip
// Setup: 1 work order (WO-001, 180min) on one work center, Mon-Fri 8AM-5PM. Starts Friday 4PM.
// Disruption: Only 60min of shift left on Friday (4-5PM). Saturday and Sunday have no shifts.
// Expected: Works Fri 4-5PM (60min), skips weekend, resumes Mon 8-10AM (120min). Ends Mon 10AM.
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
        startDate: "2026-03-13T16:00:00.000Z", // Friday 4PM
        endDate: "2026-03-13T19:00:00.000Z",   // incorrect original (3h straight, ignores shift end)
        durationMinutes: 180,
        isMaintenance: false,
        dependsOnWorkOrderIds: [],
    },
};

const mo1: ManufacturingOrder = {
    docId: "mo-1",
    docType: "manufacturingOrder",
    data: {
        manufacturingOrderNumber: "MO-001",
        itemId: "PIPE-400",
        quantity: 200,
        dueDate: "2026-03-20T17:00:00.000Z",
    },
};

export const scenario4: ReflowInput = {
    workOrders: [wo1],
    workCenters: [workCenter],
    manufacturingOrders: [mo1],
};
