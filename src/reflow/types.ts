// -- Shared document wrapper --
export interface Doc<T extends string, D> {
    docId: string;
    docType: T;
    data: D;
}

// -- Shift --
export interface Shift {
    dayOfWeek: number; // 0-6, Sunday = 0
    startHour: number; // 0-23
    endHour: number;   // 0-23
}

// -- Maintenance window --
export interface MaintenanceWindow {
    startDate: string;
    endDate: string;
    reason?: string;
}

// -- Work center --
export interface WorkCenterData {
    name: string;
    shifts: Shift[];
    maintenanceWindows: MaintenanceWindow[];
}

export type WorkCenter = Doc<"workCenter", WorkCenterData>;

// -- Work order --
export interface WorkOrderData {
    workOrderNumber: string;
    manufacturingOrderId: string;
    workCenterId: string;
    startDate: string;
    endDate: string;
    durationMinutes: number;
    isMaintenance: boolean;
    dependsOnWorkOrderIds: string[];
}

export type WorkOrder = Doc<"workOrder", WorkOrderData>;

// -- Manufacturing order --
export interface ManufacturingOrderData {
    manufacturingOrderNumber: string;
    itemId: string;
    quantity: number;
    dueDate: string;
}

export type ManufacturingOrder = Doc<"manufacturingOrder", ManufacturingOrderData>;

// -- Reflow I/O --
export interface ReflowInput {
    workOrders: WorkOrder[];
    workCenters: WorkCenter[];
    manufacturingOrders: ManufacturingOrder[];
}

export interface ScheduleChange {
    workOrderId: string;
    field: "startDate" | "endDate";
    oldValue: string;
    newValue: string;
    reason: string;
}

export interface ReflowResult {
    updatedWorkOrders: WorkOrder[];
    changes: ScheduleChange[];
    explanation: string;
}

// -- Constraint checker --
export type ViolationType =
    | "OVERLAP"
    | "DEPENDENCY"
    | "SHIFT"
    | "MAINTENANCE";

export interface ConstraintViolation {
    type: ViolationType;
    workOrderId: string;
    message: string;
}
