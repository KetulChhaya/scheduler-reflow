// Scenario 2 - Maintenance Conflict
// Setup: 1 work order (WO-001, 240min) on one work center, Mon-Fri 8AM-5PM. Maintenance Tue 10AM-12PM.
// Disruption: WO-001 starts Mon 3PM with an incorrect end date (Mon 7PM, ignoring shift end at 5PM).
// Expected: Works Mon 3-5PM (120min), resumes Tue 8-10AM (120min). Ends Tue 10AM, right before maintenance.
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
        maintenanceWindows: [
            {
                startDate: "2026-03-10T10:00:00.000Z",
                endDate: "2026-03-10T12:00:00.000Z",
                reason: "Scheduled roller replacement",
            },
        ],
    },
};

// 240min starting Mon 3PM. Works Mon 3-5PM (120min), resumes Tue 8-10AM (120min). Done at Tue 10AM.
const wo1: WorkOrder = {
    docId: "wo-1",
    docType: "workOrder",
    data: {
        workOrderNumber: "WO-001",
        manufacturingOrderId: "mo-1",
        workCenterId: "wc-1",
        startDate: "2026-03-09T15:00:00.000Z",
        endDate: "2026-03-09T19:00:00.000Z", // incorrect original
        durationMinutes: 240,
        isMaintenance: false,
        dependsOnWorkOrderIds: [],
    },
};

const mo1: ManufacturingOrder = {
    docId: "mo-1",
    docType: "manufacturingOrder",
    data: {
        manufacturingOrderNumber: "MO-001",
        itemId: "PIPE-200",
        quantity: 300,
        dueDate: "2026-03-13T17:00:00.000Z",
    },
};

export const scenario2: ReflowInput = {
    workOrders: [wo1],
    workCenters: [workCenter],
    manufacturingOrders: [mo1],
};
