import { ReflowService } from "./reflow/reflow.service.js";
import { ConstraintChecker } from "./reflow/constraint-checker.js";
import { scenario1 } from "./data/scenario-1.js";
import { scenario2 } from "./data/scenario-2.js";
import { scenario3 } from "./data/scenario-3.js";
import type { ReflowInput } from "./reflow/types.js";

const reflowService = new ReflowService();
const constraintChecker = new ConstraintChecker();

const scenarios: Array<{ name: string; input: ReflowInput }> = [
    { name: "Delay Cascade", input: scenario1 },
    { name: "Maintenance Conflict", input: scenario2 },
    { name: "Multi-Constraint", input: scenario3 },
];

for (const { name, input } of scenarios) {
    console.log(`\n--- ${name} ---\n`);

    try {
        const result = reflowService.reflow(input);

        if (result.changes.length === 0) {
            console.log("No changes needed.");
        } else {
            for (const c of result.changes) {
                const wo = input.workOrders.find((w) => w.docId === c.workOrderId);
                console.log(`${wo?.data.workOrderNumber ?? c.workOrderId} | ${c.field} | ${c.oldValue} -> ${c.newValue} | ${c.reason}`);
            }
        }

        const violations = constraintChecker.validate(result.updatedWorkOrders, input.workCenters);
        console.log(`\nConstraint check: ${violations.length === 0 ? "PASSED" : "FAILED (" + violations.length + " violations)"}`);
        for (const v of violations) {
            console.log(`  [${v.type}] ${v.message}`);
        }
    } catch (err) {
        console.log(`ERROR: ${(err as Error).message}`);
    }
}
