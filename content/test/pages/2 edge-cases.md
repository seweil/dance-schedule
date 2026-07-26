# Edge cases in this fixture

The Schedule page (`content/test/data/event-schedule.xlsx`) exercises:

- Every supported date format: ISO, slash (2-digit and inferred year), and
  long-form (with/without comma, with/without a period after an abbreviated
  month), plus year-inference for dates with no year at all.
- Ambiguous-hour meridiem inference in both directions, including a case
  where the inferred meridiem flips relative to a naive guess.
- All four time-range separators: hyphen, "to", en dash, and em dash.

The Dance Schedule page (`content/test/data/dance-schedule.xlsx`) exercises:

- The minimum (`SSD`) and maximum (`C4`) points on the ordered skill scale.
- An unordered level (`Various`) that stays visible no matter the level
  slider's range.
- Multi-level cells using both the `&` and `/` separators.
- A room-spanning session via a ditto mark (`"`) in the adjacent column.
- A room-spanning session via an explicit, non-adjacent `ROOMS:` line.
- A `GCA:` line.
- A roomless freeform session (`* ... ` plus `ROOMS: NONE`).
- A second day with a different set of rooms than the first, matching the
  real data's day-to-day room variance.
