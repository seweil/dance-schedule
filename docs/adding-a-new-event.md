# Adding a new event

This walks through adding a new event to the app — a new convention or dance
weekend, published alongside the existing ones (`real`, `test`) with its own
web address. No code changes are needed; everything below is data: two
spreadsheets, some markdown pages, a small config file, and (optionally) an
icon.

In this app, one event = one **content set**: a self-contained folder of
pages and schedule data under `content/<your-event-name>/`. Once that folder
exists and the site is rebuilt, your event is automatically published at
`https://<your-domain>/<your-event-name>/` — nothing else has to be wired up.

If you get stuck, the living technical references this guide is based on are
`docs/design/content-sets.md`, `docs/design/content-config.md`, and
`docs/design/schedule-page.md` / `docs/design/dance-schedule.md` — more
detail than you'll usually need, but useful if something here seems out of
date.

## Before you start

Pick a short, URL-safe name for your event — lowercase letters, digits, and
hyphens only, no spaces (e.g. `spring-2027`, `fall-convention`). This becomes
part of the web address (`/spring-2027/...`), so keep it short. Avoid these
exact names, which are reserved for the app's own files: `assets`, `icons`,
`index.html`, `manifest.webmanifest`, `sw.js`, `debug`, `clear-storage`,
`events`, or anything starting with `workbox-`.

Everything for your event lives under one new folder:

```
content/<your-event-name>/
  config.yaml       (optional) event name + a couple of feature flags
  icon.png          (optional) app icon — see step 5
  pages/
    home.md         the event's home page
    2 installation.md   (etc. — any other pages you want)
  data/
    event-schedule.xlsx   the simple flat event list — step 3
    dance-schedule.xlsx   the detailed room/time grid — step 4
  scratch/          (optional) your own staging area — raw material you want to
                    keep around (e.g. a higher-resolution source photo before
                    cropping) that isn't itself a built page, spreadsheet, or
                    icon. Nothing in the build ever looks at this folder, so
                    anything you put here is safe from breaking a build — put
                    whatever's useful to you.
```

You can copy `content/automated-testing/` as a starting template and edit
from there — often the fastest way to get the folder shape right. That set
is a permanent stable sample event used by the automated test suite, not a
real one — it's never edited to reflect an actual event, only cloned. Once
your event is ready, point `content/config.yaml`'s `defaultContentSet` at
your new event's name (see step 7) rather than editing
`content/automated-testing/` itself.

## Step 1: The pages

`content/<your-event-name>/pages/` holds plain markdown files. Each file
becomes a page and a navigation-menu entry automatically — no routing setup
needed.

- **File naming:** kebab-case (`getting-started.md`, not `Getting Started.md`).
  A leading number and a space (`2 installation.md`) controls where it sits
  in the nav menu — lower numbers come first, "Home" (from `home.md`)
  always comes first regardless. Files with no number sort after numbered
  ones.
- **`home.md` is required** — it becomes the home page (`/`), and every
  other event's `home.md` does the same for its own URL. Without one, your
  event's home page won't render.
- **No frontmatter** — just start writing markdown. The filename (minus the
  number prefix and `.md`) becomes both the URL and the nav label
  (title-cased automatically: `getting-started.md` → "Getting Started").
- **Images:** put them in a `pages/assets/` subfolder and reference them as
  `![alt text](./assets/your-image.png)`. They're automatically made
  clickable/zoomable, and never render wider than the page no matter how
  large the source file is — no extra markup needed. For a photo that looks
  better small in the flow of the page (e.g. a caller headshot) — full size
  is still one tap away — add a standard markdown title of `thumbnail`,
  `small`, `medium`, or `large`:
  `![Jane Doe](./assets/caller-jane-doe.jpg "thumbnail")`. Any other title
  text is left alone as a normal image tooltip.
- **Numbering convention:** keep your own page numbers below 10 — number 10
  is reserved for the automatically-generated "Event Schedule" page (see
  step 3), and 12/13 for "Dance Schedule" / "Dance by Level" (step 4). Those
  three pages appear in your nav automatically; you don't create them.

A minimal `pages/home.md`:

```markdown
# Welcome to Spring 2027

Dates, location, and anything else you want visitors to see first.
```

## Step 2: Feature flags and manifest info (`config.yaml`)

`content/<your-event-name>/config.yaml` is optional — if you skip it, both
flags below default to `true` already. It has two independent sections:

```yaml
features:
  # Whether the Dance Schedule level slider treats A1 and A2 as one combined
  # stop, instead of two separate ones. Most events have too few A1-only
  # dances to bother distinguishing — set to false only if yours genuinely
  # needs A1 and A2 kept separate. (Defaults to true — shown explicitly here
  # for clarity.)
  combineA1A2: true
  # Same idea, for C3B and C4 — the combined stop is labeled "C3B+" (square-
  # dance convention for "C3B and above"). Set to false only if your event has
  # enough distinct C3B-only and C4-only sessions to be worth splitting.
  # (Also defaults to true.)
  combineC3BC4: true

manifest:
  # What shows up as the installed app's name/home-screen label. Defaults to
  # "Dance Schedule" for both if you omit this section entirely.
  name: Dance Schedule (Spring 2027)
  shortName: Spring 2027
```

`shortName` is what appears under the home-screen icon — keep it short
(roughly 12 characters or fewer) or it may get truncated.

There's also a `testFixture: true` key this file's schema supports — you
won't need it for a real event. It only exists to mark the two built-in
fixture sets (`automated-testing`, `test`) so they sort to the bottom of
the `/events` landing page instead of alphabetically alongside real events.

### Dance-schedule room column order (`danceSchedule.roomOrder`)

Also optional. The "Dance Schedule" page's room columns default to
increasing dance level — specifically, each room's median dance level
across the **whole event** (every day combined, not recomputed per day —
ties broken by average level, then by the room's position in
`dance-schedule.xlsx` if it's still tied) — so easier-level rooms show up
first, and a room's column position is always the same regardless of which
day you're viewing. Any rooms a `ROOMS:`/ditto-mark session spans together
(e.g. an "All Callers Dance" across two ballrooms) always stay next to each
other in this default, regardless of level, so a spanning session still
renders as one merged card. If that's not the order you want, `config.yaml`
supports two overrides:

```yaml
danceSchedule:
  # Keep the columns in the same left-to-right order as dance-schedule.xlsx's
  # own room columns, ignoring level entirely.
  roomOrder: spreadsheet

  # — or — an exact order, naming every room used anywhere in
  # dance-schedule.xlsx, exactly once each. The build fails with a listing
  # of what's missing/unrecognized/duplicated if the list doesn't match.
  roomOrder:
    - Ballroom Centre
    - Ballroom East
    - Ballroom West
    - Drummond Ballroom
```

A room not scheduled on a particular day is simply skipped that day — the
list is one event-wide setting, not one per day.

## Step 3: The simple event list (`event-schedule.xlsx`)

This is a flat, one-row-per-event spreadsheet for the "Event Schedule" page
(things like meals, socials, workshops — anything that isn't the detailed
dance grid covered in step 4). One sheet, one header row, exactly these four
column headers:

| Date | Start time - End time | Location | Description |
|------|------------------------|----------|--------------|
| 8/15/2026 | 6:00 PM - 7:30 PM | Ballroom | Opening social |
| Aug 16 | 9:00am-10:00am | Salon A | Beginner lesson |

Date, the time range, and Description are required for every row. Location
is optional — leave the cell blank for an event with no fixed location
(e.g. something that isn't tied to one room); the page simply omits that
line for that event rather than showing it blank.

**Date formats accepted** (any of these):
- `2026-08-15` (ISO)
- `8/15/2026` or `8/15/26` (US slash, 4- or 2-digit year)
- `August 15, 2026`, `Aug 15, 2026`, `Aug. 15, 2026`, `August 15 2026`
- **Year optional** (`8/15`, `Aug 15`) — the app assumes the current year at
  build time, rolling forward to next year only if that would otherwise put
  the date more than ~6 months in the past. If you're entering dates near a
  year boundary (e.g. a New Year's event), just include the year explicitly
  to be safe.

**Time-range formats accepted** (one cell, both times, any of these):
- `6:00 PM - 7:30 PM`, `6:00pm-7:30pm`, `6:00 p.m. - 7:30 p.m.`
- `18:00 - 19:30` (24-hour)
- `6:00pm to 7:30pm`
- `6:00p-7:30p` (no trailing "m" at all — also works)
- **AM/PM optional on the *start* time** if the end time has it (e.g.
  `6 - 7:30pm` is understood as 6:00 PM – 7:30 PM). If leaving it off would
  put the start time after the end time, the app flips it for you (e.g.
  `11 - 1pm` is understood as 11:00 AM – 1:00 PM, not 11:00 PM). When in
  doubt, just write both times out fully.

Anything that doesn't match one of the above formats fails the build with
the offending row identified — you'll get a clear error, not a silently
wrong or missing event.

## Step 4: The detailed dance grid (`dance-schedule.xlsx`)

This spreadsheet drives the richer "Dance Schedule" and "Dance by Level"
pages — multiple rooms running in parallel, skill levels, named callers.
It's laid out as a **grid**, one sheet per day, matching how these are
usually already kept in practice.

### Sheet structure

- **One sheet per day.** Sheet name = weekday + month + day, no year, e.g.
  `Thursday July 2`. The year is inferred the same way as event dates
  (step 3) — include it in the sheet name only if you need to override that.
- **Row 1** = room names, one per column (can differ per sheet, e.g. a room
  only used on Saturday).
- **Column A** = a time slot per row (e.g. `12:30p-1:30p`, same flexible
  format as step 3's time ranges).
- **Every other cell** = either empty (nothing scheduled) or one session,
  written as:

  ```
  Level : Type - Caller
  ```

  For example: `SSD : Dancing - Vic Ceder`. The `Type -` part is optional —
  if the session is just ordinary dancing with nothing more specific to say,
  write `Level : Caller` and the type is assumed to be "Dancing" (e.g.
  `SSD : Vic Ceder` means the same thing as the example above).

### Cell format details

- **Level(s):** must be one of `SSD`, `MS`, `Plus`, `C1`, `C2`, `C3A`, `C3B`,
  `C4`, `A1`, `A2`, `Intro`, `Various`. An unrecognized level code fails the
  build — check spelling/capitalization exactly. `Advanced` is also
  accepted, as a writing convenience — it's automatically normalized to
  `A2`, since "Advanced" without further detail is assumed to mean the
  fuller A1+A2 track. Write `A1` explicitly if a session is specifically
  A1, not A2.
- **Multiple levels in one session:** join with `&` or `/` — both work the
  same way, e.g. `C1 & C2 : Dancing - Vic Ceder` or `A1/A2 : Dancing - ...`.
- **Multiple callers teaching together:** join with `&` in the caller
  position, e.g. `SSD : Dancing - Michael Kellogg & Terri Sherrer`.
- **A GCA (non-headline caller) credit:** for a caller who's calling
  alongside the main caller(s) without top billing — not a statement about
  their skill level. Add a second line inside the same cell, starting with
  `GCA:`:

  ```
  SSD : Dancing - Vic Ceder
  GCA: Tim Stephens
  ```

  (To add that second line *within* the cell in Excel — a plain
  Enter/Return moves to the next cell instead — press **Alt+Enter** on
  Windows, or **Option+Return** on Mac (older Excel versions: try
  **Control+Option+Return** instead), while typing in the cell. Same key
  combo for the `ROOMS:` lines below.)

- **A session spanning more than one room** (e.g. a combined all-attendee
  dance): either
  - write a `ROOMS:` line in **one** of the spanned rooms' cells listing
    every room it spans (comma-separated, including that cell's own room),
    and leave the other spanned rooms' cells for that row blank:
    ```
    SSD : Combined Dance - Vic Ceder
    ROOMS: Ballroom Centre, Ballroom East
    ```
  - **or**, for the common case of two rooms right next to each other as
    columns, just put a single `"` (a ditto mark) in the neighboring room's
    cell — no `ROOMS:` line needed. It means "same session as the cell to
    my left."
- **A session with no room at all** (e.g. a lunch break): write
  `ROOMS: NONE`:
  ```
  * Lunch Break
  ROOMS: NONE
  ```
- **Anything that isn't a structured "Level : Type - Caller" session**
  (an announcement, a break, anything freeform): prefix the cell with `* `
  (asterisk, space) and it's shown as-is, with no level/caller parsing
  attempted.

Anything that doesn't match one of these patterns fails the build with the
exact sheet name, cell address (e.g. `F3`), and cell contents identified —
so it's easy to find and fix directly in Excel.

The build also fails if the same caller or the same room ends up booked
twice at overlapping times on the same day — e.g. the same caller's name
in two different rooms' cells for overlapping time ranges, or two rows
both naming the same room for overlapping times. The error names both
cells involved, so you can tell which one is the typo. This only checks
callers, not GCA credits — one caller getting a GCA credit in two overlapping
sessions isn't flagged.

### Checking your work

After a build (or `pnpm dev`), a plain-markdown dump of exactly how the app
interpreted every session gets written to
`content/<your-event-name>/data/dance-schedule-dump.md` — open it and
skim for anything that looks wrong. There's also a raw debug table at
`/<your-event-name>/debug/dance-schedule` (once the site is built/deployed)
showing the same data as a dense table in the browser, with links to every
other published event's copy of the same debug page.

## Step 5: App icon (optional)

`content/<your-event-name>/icon.png` — a single square image, **at least
1024×1024 pixels**, becomes your event's installed home-screen icon
(replacing "Dance Schedule (Test)"-style generic icons). If you skip this,
a simple placeholder (a solid color square with your event name's first
letter) is generated automatically — everything still works, it's just not
custom-branded.

A few pointers on the image itself:
- **Keep it simple and bold** — a single logo, mark, or short wordmark, not
  a detailed illustration. Icons render as small as ~48px in places like app
  switchers, so fine detail or thin lines just disappear.
- **High contrast** between the mark and its background reads better than
  subtle colors.
- **Only the center ~70% (by diameter) is guaranteed visible.** Some
  operating systems crop your icon into a circle, rounded square, or other
  shape when it's installed — anything outside that centered zone may get
  clipped. Keep your logo/mark within the middle 70% of the square and treat
  the outer edge as background padding, not content.

The build automatically creates every size the app needs (192px, 512px, and
a safe-zone-padded version for OS icon masking) from your one source image —
you don't need to produce multiple sizes yourself.

## Step 6: Try it locally

```bash
pnpm install                         # first time only
CONTENT_SET=your-event-name pnpm dev
```

Opens a dev server showing just your event, so you can check pages, the
event schedule, and the dance grid as you go. `Ctrl+C` to stop.

Once it looks right, do a full production-style check (this is also what
catches spreadsheet formatting errors most reliably, since it runs the real
build):

```bash
pnpm build && pnpm preview
```

This builds **every** event (not just yours) into `dist/` and serves it
locally — visit `http://localhost:4173/your-event-name/` to see your
event exactly as it'll appear once deployed. Check the browser's DevTools →
Application → Manifest panel to confirm your event's name/icon show up
correctly there too.

## Step 7: Publish it

Once your `content/<your-event-name>/` folder is committed and pushed,
`pnpm build` (which the deploy pipeline runs automatically) picks it up with
**no other changes needed** — every folder under `content/` gets published,
each at its own `/<event-name>/` address.

Two things worth knowing:

- **Making it the "default" event** (the one shown at the bare site root
  `/`, with no event name in the URL) is a separate, optional step: edit
  `content/config.yaml`'s `defaultContentSet` to your event's name.
- **Direct/bookmarked links into your event's pages** (e.g. sharing a link
  straight to `/your-event-name/installation`) need a one-time manual step
  in the Amplify hosting console — a rewrite rule for your event's prefix,
  alongside the ones for the existing events. Ask whoever manages hosting to
  add it (see `docs/design/hosting.md`'s "Per-content-set Amplify rewrite
  rule" decision) — until that's added, direct links to inner pages of a
  *brand-new* event may not resolve correctly, even though the event's own
  home page and normal in-app navigation work fine.

## If something goes wrong

- **Build fails with a spreadsheet error:** the error message names the
  exact file, sheet, and cell (or row) — open that spot in Excel and check
  it against the format sections above.
- **A page doesn't show up in the nav:** check the filename is kebab-case
  markdown directly inside `pages/` (not a subfolder), and that you didn't
  accidentally give it the same number as another page.
- **The icon doesn't look right:** confirm `icon.png` is at least 512×512 in
  both dimensions — anything smaller fails the build with a clear error. A
  non-square image isn't rejected, but gets center-cropped to a square
  automatically, which may cut off content you wanted visible — squaring it
  up yourself before adding it gives you control over what gets kept.
- **Still stuck:** `docs/design/content-sets.md`, `docs/design/content-config.md`,
  `docs/design/schedule-page.md`, and `docs/design/dance-schedule.md` have the
  full technical detail behind everything in this guide.
