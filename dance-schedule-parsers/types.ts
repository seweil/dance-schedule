import type { SourcedDanceSession } from '../src/lib/validateDanceSessions'

// Every dance-schedule input format produces this same data model, so nothing
// downstream of parsing (buildDanceSchedule, the grids, the dump) knows or cares
// which format a content set was authored in. See docs/design/dance-schedule.md's
// "Pluggable parsers" decision.
export interface DanceScheduleParseResult {
  // Each session with a required source location (where the parser found it), so
  // the shared validator's errors can point back into the source file. The parser
  // only enforces its own format's rules; data-model rules (double-booking, level
  // codes) are enforced for every format by validateDanceSessions, run by the
  // loader.
  sessions: SourcedDanceSession[]
  // Human-readable, pinpointed in the parser's own terms (sheet + cell, line
  // number, ...). Returned rather than thrown, so the shared loader
  // (loadDanceScheduleData) reports every parser's errors in one consistent,
  // aggregated format, with all of them listed at once rather than only the first.
  errors: string[]
}

export interface DanceScheduleParser {
  // The `danceSchedule.format` value in content/<set>/config.yaml that selects it.
  format: string
  // The source file's name inside the content set's data/ directory.
  sourceFileName: string
  // One line, for docs and the "unknown format" error message.
  description: string
  // Reads and parses the source file. The parser owns its own file I/O, since
  // formats differ in how they're read (xlsx, csv, ...). Throws only if the file
  // can't be read at all; content problems go in `errors`.
  parse(sourceFile: string): Promise<DanceScheduleParseResult>
}
