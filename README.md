# Production Schedule Reflow

A scheduling algorithm that reschedules manufacturing work orders when disruptions happen (delays, machine breakdowns). It looks for and respects dependencies between orders, prevents work center conflicts, handles shift boundaries, and avoids maintenance windows.

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
