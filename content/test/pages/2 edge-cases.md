# Edge cases in this fixture

The Schedule page (`content/test/data/event-schedule.xlsx`) exercises:

- Every supported date format: ISO, slash (2-digit and inferred year), and
  long-form (with/without comma, with/without a period after an abbreviated
  month), plus year-inference for dates with no year at all.
- Ambiguous-hour meridiem inference in both directions, including a case
  where the inferred meridiem flips relative to a naive guess.
- All four time-range separators: hyphen, "to", en dash, and em dash.
- A deliberately long `Description`, to check text wrapping.
- A deliberately short `Description` (just "Test Event", no subtitle).
- An accented `Location`/`Description` ("Café Montréal Hall" / "Soirée
  Dansante").

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

**Visual-review-only additions** (no automated test asserts any of these —
they exist purely so a reviewer can eyeball how the grid handles names and
text that the uniform "Test Caller N"/"Test Room X" pattern above doesn't
cover):

- Accented caller names, two different sets of diacritics (`François Côté`;
  `Björn Åström`).
- A very long, plain-ASCII caller name
  (`Alexander Bartholomew Fitzgerald-Montgomery`), including once inside a
  room-spanning (`ROOMS:`) session, to see how a wide merged card handles
  long text.
- A very short, single-word caller name (`Zed`) — also the alphabetically
  last first name in this set, a visual check of alphabetical-by-first-name
  caller-column ordering.
- A 3-caller co-taught session (existing coverage above tops out at 2).
- A long/accented name in the `GCA:` slot, not just as a primary caller.
- A new room with a deliberately long name
  (`The Grand Overflow Annex Ballroom`) and one with a deliberately short,
  single-word name (`Gym`) — column-header wrapping at both extremes.
- A long `Details` line (a verbose session-type description), to exercise
  the card's line-clamp truncation for real.
