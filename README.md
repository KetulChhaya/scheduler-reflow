# Production Schedule Reflow

A scheduling algorithm that reschedules manufacturing work orders when disruptions happen (delays, machine breakdowns). It looks for and respects dependencies between orders, prevents work center conflicts, handles shift boundaries, and avoids maintenance windows.

### Loom Video Link:
https://www.loom.com/share/09c0111cb2dd442ea39377db6d81f65a

## Setup

```bash
npm install
```

## Running

```bash
# Run all 5 scenarios
npm run start

# Run the test suite (16 tests)
npm run test
```

## How it works

The algorithm takes in an array of work orders, an array of work centers with shifts and maintenance windows, and produces a valid schedule.

**Steps:**

At first, orders are sorted by their dependency graph using Kahn's algorithm. This guarantees every parent is scheduled before its children. Cycles are detected and rejected.

Then, each order is processed in topological order. For each one:
   - Find the earliest possible start: the latest of (original start, all parent end dates, last order's end on the same work center)
   - Break that time to the next valid shift window
   - Skip past any maintenance windows
   - Calculate the end date by consuming `durationMinutes` of actual working time across shift blocks (subtracting maintenance gaps)

After reflow, the constraint checker verifies the output that there are no overlaps, dependencies are satisfied, work is within shifts, and maintenance is avoided considering the shift timings.

## Project structure

```
src/
├── reflow/
│   ├── types.ts              -- All interfaces
│   ├── reflow.service.ts     -- Main algorithm
│   └── constraint-checker.ts -- Post-reflow validation
├── utils/
│   └── date-utils.ts         -- Shift-aware date helpers (Luxon)
├── data/
│   ├── scenario-1.ts         -- Delay cascade
│   ├── scenario-2.ts         -- Maintenance conflict
│   ├── scenario-3.ts         -- Mixed (delay + maintenance)
│   ├── scenario-4.ts         -- Weekend skip
│   └── scenario-5.ts         -- Mixed (delay + maintenance + weekend)
├── tests/
│   └── reflow.test.ts        -- Vitest test suite
├── prompts/
│   └── ai_prompts.md         -- Prompts
└── main.ts                   -- Entry point
```

## Scenarios

**Delay Cascade**: Three orders in a chain (WO-001 -> WO-002 -> WO-003) on one work center. WO-001 runs late by 2 hours, WO-002 and WO-003 cascade forward.

**Maintenance Conflict**: A single order (WO-001, 240min) spans a shift boundary (Mon 3PM past 5PM end) and must avoid a Tuesday maintenance window.

**Mixed (delay + maintenance)**: Two work centers, three orders in a dependency chain across centers. WO-003 (600min) spans into a day with a maintenance window and must work around it.

**Weekend Skip**: A single order (WO-001, 180min) starts Friday 4PM. Works until 5PM, skips Saturday and Sunday, finishes Monday 10AM.

**Mixed (delay + maintenance + weekend)**: Three work centers, three orders chained across them. A 3-hour delay on WO-001 pushes WO-002 into a maintenance window on WC-2, then WO-003 spills past Friday into the following Monday.

## Tech
- TypeScript (strict mode)
- Luxon for all date operations
- tsx as the runner
- Vitest for testing

## Trade-offs

**Greedy forward scheduling vs. optimization**: The algorithm places each order at its earliest possible slot. Sorting orders by dependencies takes O(V+E) where V is the number of work orders and E is the number of dependency links between them. However, it doesn't try to minimize total delay across the whole schedule. A smarter approach could try all possible orderings to find the one with the least overall disruption, but that would be far more complex and slower.

**Block-based date math vs. minute-by-minute**: Instead of stepping through every minute to count working time, the algorithm calculates available time blocks within each shift (subtracting maintenance windows) and uses them in parts. This is faster for long-duration orders but the block-splitting logic in `date-utils.ts` is harder to follow than a simple minute counter would be.

**Post-reflow validation**: The algorithm runs the constraint checker on its own output before returning. If the scheduling logic is correct, there should never be violations. But it catches bugs early and gives clear error messages when something unexpected happens.

## Limitations

- No priority-based scheduling as the orders are processed in dependency order, not by urgency or due date
- No setup time between orders (could be added via `setupTimeMinutes` field)
