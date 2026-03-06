# Prompts

"I have work orders with multiple parent dependencies. If a parent moves, how do I ensure children move correctly without checking every order repeatedly?"
- Discussed Recursive DFS vs. Kahn’s Algorithm.
- Selected Kahn’s Algorithm for its efficiency (O(V+E)) and reliable cycle detection for complex manufacturing chains.

"The requirement says work must pause outside shift hours and skip maintenance windows. What is the most efficient way to calculate an endDate for a 25 hours order?"
- Considered minute-by-minute loops vs. block-based interval math.
- Chose block-based math for performance. Built calculateEndDateWithShifts to "carve" maintenance out of shift windows, allowing the algorithm to skip entire days in a single step.

"How do I prevent two orders from overlapping on the same machine after I've moved them for shifts?"
- Considered priority-based re-shuffling vs. greedy forward accumulation.
- Implemented a Greedy Forward Scheduler using a workCenterTimeline. This makes sure that each order takes the absolute earliest available gap, optimizing machine utilization while respecting all hard constraints.

"The shift logic is quite complex. How can I be 100% sure the final schedule satisfies every rule in the task.md?"
- Built an independent ConstraintChecker. By running a post-reflow validation pass that re-calculates constraints from scratch, we make sure that any architectural bugs are caught before the user sees the output.

"The output needs to explain *why* a date changed. How can I build a human-readable reason string during the reflow loop?"
- Implemented buildStartReason to detect specifically which constraint caused the move (Dependency, Machine Overlap, or Shift/Maintenance jump).
