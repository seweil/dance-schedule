// A heading's id from its text ("Breakfast & Brunch" → "breakfast-brunch"), so a
// content page can link to its own sections — see App.tsx's MdxH2.
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
