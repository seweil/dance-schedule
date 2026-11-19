// Words shortened in a room's on-page name, so long names fit their column
// header (which wraps to at most two lines) and card lines. The one place to add
// or change an abbreviation; the parsed data, the raw schedule table and the
// markdown dump keep each room's full name. A whole word only, so a room merely
// containing the letters is left alone.
const ROOM_NAME_ABBREVIATIONS: readonly (readonly [RegExp, string])[] = [[/\bConference\b/g, 'Conf']]

export function formatRoomName(room: string): string {
  return ROOM_NAME_ABBREVIATIONS.reduce((name, [word, abbreviation]) => name.replace(word, abbreviation), room)
}
