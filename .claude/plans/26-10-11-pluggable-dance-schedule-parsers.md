# Pluggable dance-schedule parsers — step 1: the parser interface

## Context
Not every event organizer will author their schedule in our current spreadsheet
format (one sheet per day, rooms as columns, time slots as rows, cell syntax
`Level : Type - Caller [GCA: Name]`). We want several input parsers that all
produce the same data model (`DanceSessionData[]`, `src/types/danceSchedule.ts`),
so nothing downstream of parsing changes. Dance schedule only; Event Schedule is
out of scope.

**This step:** define the parser interface, a registry, and a per-content-set
selection key in `config.yaml`, and wrap today's parser as the first (and only)
implementation. No behavior change for any existing content set.

**Decided with the user:**
- Selection is an explicit `config.yaml` key (`danceSchedule.format`), defaulting to
  today's format, so existing sets need no edits.
- Format-independent validation (caller/room double-booking, level codes) stays
  inside today's parser for this step. Extracting it into one shared post-parse
  implementation is recorded as an **urgent known issue**. Every new parser
  added before that happens would have to re-implement it, or silently skip it.

## Current shape (what's being refactored)
- `vite-plugin-dance-schedule.ts` → `loadDanceScheduleData(file)`: reads the
  `.xlsx` with `read-excel-file/node`, skips `-`-prefixed sheets
  (`isNonScheduleSheetName`), calls `parseDanceScheduleSheet(sheetName, rows)`
  per sheet (`src/lib/parseDanceScheduleSheet.ts`, returns `{ sessions, errors }`),
  aggregates errors, and throws one formatted error.
- Callers of `loadDanceScheduleData`: `danceSchedulePlugin` (the
  `virtual:dance-schedule` module, file watching, dump `.md`, roomOrder
  cross-check), and `vite-plugin-content-sets.ts:92`, which hardcodes
  `data/dance-schedule.xlsx`.
- Double-booking checks live inside `parseDanceScheduleSheet`
  (`checkAndRecordBooking`, per sheet), with cell-reference error messages.

## Design

### Interface — new `dance-schedule-parsers/types.ts` (repo root, Node-side, like the `vite-plugin-*.ts` files)
```ts
export interface DanceScheduleParseResult {
  sessions: DanceSessionData[]
  // Human-readable, pinpointed in the parser's own terms (sheet + cell, line
  // number, ...). Returned, not thrown, so the shared loader reports every
  // parser's errors in one consistent, aggregated format.
  errors: string[]
}

export interface DanceScheduleParser {
  // The `danceSchedule.format` value in content/<set>/config.yaml that selects it.
  format: string
  // Source file name inside the content set's data/ directory.
  sourceFileName: string
  // One line, for docs and the "unknown format" error message.
  description: string
  // Reads and parses the source file. Throws only if the file can't be read at
  // all; content problems go in `errors`.
  parse(sourceFile: string): Promise<DanceScheduleParseResult>
}
```
The parser owns its own file I/O, because formats differ in how they're read
(xlsx vs csv vs ...). Each parser declares its own file name, so `data/` can hold
whatever file that format needs.

### First implementation — `dance-schedule-parsers/roomGrid.ts`
- `format: 'room-grid'`, `sourceFileName: 'dance-schedule.xlsx'`.
- Body is the loop moved out of today's `loadDanceScheduleData`:
  `readExcelFile`, skip `isNonScheduleSheetName` sheets, and
  `parseDanceScheduleSheet` per sheet, concatenating sessions and errors.
- `src/lib/parseDanceScheduleSheet.ts` is unchanged (pure, already tested).
- The name `room-grid` is my pick (rooms as columns, one sheet per day). Easy to
  change before merge.

### Registry and loader — `dance-schedule-parsers/index.ts`
- `DANCE_SCHEDULE_PARSERS`: a map from format to parser, holding just `room-grid`
  for now. `DEFAULT_DANCE_SCHEDULE_FORMAT = 'room-grid'`.
- `getDanceScheduleParser(format, configFile)` throws for an unknown format,
  naming the bad value and listing the valid ones.
- `resolveDanceScheduleSource(contentDir)` returns `{ parser, sourceFile }`. It
  reads the format from config, looks up the parser, and resolves
  `<contentDir>/data/<sourceFileName>`. This is used for both loading and file
  watching.
- `loadDanceScheduleData(contentDir)` resolves the source, calls `parser.parse`,
  and throws the same aggregated error message as today (`Failed to parse
  <file> — N error(s): ...`) if there are any errors.
  - This replaces the file-path signature, and its export moves from
    `vite-plugin-dance-schedule.ts` to here.

### Config key — `vite-plugin-content-config.ts`
- New `loadDanceScheduleFormat(configFile): string`, built on the existing
  `asConfigSection`.
  - Missing file or key: returns the default.
  - Non-string or empty value: throws, matching the `readRoomOrder` style.
- Build-time only: it is **not** added to `ContentConfigData` or the
  `virtual:content-config` module, because the client never needs it.
- Unit tests in `vite-plugin-content-config.test.ts`: default when absent;
  explicit value; non-string rejected.

### Call-site changes
- `vite-plugin-dance-schedule.ts`:
  - Drop `DANCE_SCHEDULE_FILE_NAME`.
  - In `configResolved`, use `resolveDanceScheduleSource` for the watched source
    path.
  - In `load`, call the new `loadDanceScheduleData(contentDir)`.
  - The watcher, roomOrder cross-check and dump `.md` are otherwise unchanged.
  - The `dataDir` option still sets where the dump is written.
- `vite-plugin-content-sets.ts:92`: replace the hardcoded `data/dance-schedule.xlsx`
  with `loadDanceScheduleData(path.resolve(root, contentDir))`.
- `tsconfig.json` `include`: add `dance-schedule-parsers/**/*.ts`. Confirm ESLint
  already covers it.

### Tests
- `dance-schedule-parsers/index.test.ts`:
  - The registry resolves `room-grid` by default and by explicit config.
  - An unknown format throws, listing the valid ones.
  - The loader aggregates errors from a stub parser into the expected message
    (stub parser, no xlsx needed).
- `roomGrid` gets a smoke test that parses `content/automated-testing/data/dance-schedule.xlsx`
  and gets a non-empty session list with no errors. The detailed parse behavior is
  already covered by `parseDanceScheduleSheet.test.ts`.
- The strongest regression check: the committed `content/*/data/dance-schedule-dump.md`
  files must be **byte-identical** after a build. They're regenerated from the
  parsed data, so any drift shows up in `git diff`.

### Docs
- `docs/design/dance-schedule.md`: new decision, "Pluggable parsers". It covers
  the interface, why errors are returned rather than thrown, why parsers own their
  file I/O, config-key selection, and the `room-grid` name. Also update "Where the
  code lives".
- `docs/design/content-config.md` and `docs/adding-a-new-event.md`: document
  `danceSchedule.format` (optional, default `room-grid`).
  - Note that `roomOrder: spreadsheet` really means "source order", which is
    format-neutral. The value's name stays as is for now.
- `CLAUDE.md`: in the content-set tree and the "Schedule data pipeline" section,
  say that `dance-schedule.xlsx` is the `room-grid` format's file, and that the
  format is chosen by `danceSchedule.format`.
- `docs/known-issues.md`: **new urgent item**, "Dance-schedule validation lives
  inside the room-grid parser". It covers:
  - What it is: double-booking and level-code rules are format-independent but
    are only enforced inside `parseDanceScheduleSheet`.
  - Why it's urgent: any new parser skips them unless it duplicates them.
  - The planned fix: one shared validator over `DanceSessionData[]`, run by the
    loader after every parser. Error messages need an optional per-session
    source location to stay pinpointed.
  - Constraint: it must be done before or alongside the second parser.

## Verification
- `pnpm typecheck && pnpm lint && pnpm test`.
- `pnpm build`, then `git status` should show no change to any
  `content/*/data/dance-schedule-dump.md`. That proves the parsed output is
  identical for every content set.
- A temporary `danceSchedule.format: nope` in a set's `config.yaml` should fail
  the build with the "unknown format, valid: room-grid" message. Revert it after.
- `pnpm test:e2e`. Per `docs/known-issues.md`, this is the form allowed to launch
  Chromium in the sandbox; `pnpm exec playwright` isn't. It also runs the
  now-line spec that hasn't been run yet.
