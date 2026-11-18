import fs from 'node:fs/promises'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { loadDanceScheduleProgramStaff, loadDanceScheduleStaffAliases } from '../vite-plugin-content-config'
import {
  parseProgramGridPdf,
  type PdfLineSegment,
  type PdfTextItem,
  type ProgramGridPage,
} from '../src/lib/parseProgramGridPdf'
import type { DanceScheduleParser } from './types'

type Matrix = [number, number, number, number, number, number]

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ]
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

/**
 * Reads the one page of a schedule PDF as the geometry parseProgramGridPdf needs:
 * stroked gridlines and positioned text, in top-down page coordinates. Walks the
 * page's drawing operators to recover the lines, since pdfjs exposes text
 * positions directly but not vector paths. Relies on pdfjs 4's constructPath
 * argument layout ([ops, coords, bounds]) — pdfjs-dist is pinned to an exact
 * version in package.json because 5.x changed it.
 */
async function readProgramGridPage(sourceFile: string): Promise<ProgramGridPage> {
  const data = new Uint8Array(await fs.readFile(sourceFile))
  const document = await getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise
  try {
    if (document.numPages !== 1) {
      throw new Error(`expected a one-page PDF, got ${document.numPages} pages`)
    }
    const page = await document.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const toPage = (point: [number, number]) => viewport.convertToViewportPoint(point[0], point[1]) as [number, number]

    const lines: PdfLineSegment[] = []
    const operators = await page.getOperatorList()
    let transform: Matrix = [1, 0, 0, 1, 0, 0]
    const saved: Matrix[] = []
    let pending: PdfLineSegment[] = []
    operators.fnArray.forEach((fn, index) => {
      const args = operators.argsArray[index] as unknown[]
      if (fn === OPS.save) {
        saved.push(transform)
      } else if (fn === OPS.restore) {
        transform = saved.pop() ?? [1, 0, 0, 1, 0, 0]
      } else if (fn === OPS.transform) {
        transform = multiply(args as Matrix, transform)
      } else if (fn === OPS.constructPath) {
        const [pathOps, coords] = args as [number[], number[]]
        let cursor = 0
        let current: [number, number] | undefined
        for (const op of pathOps) {
          if (op === OPS.moveTo || op === OPS.lineTo) {
            const point = toPage(apply(transform, coords[cursor]!, coords[cursor + 1]!))
            cursor += 2
            if (op === OPS.lineTo && current) {
              pending.push({ x1: current[0], y1: current[1], x2: point[0], y2: point[1] })
            }
            current = point
          } else if (op === OPS.rectangle) {
            cursor += 4
          } else if (op === OPS.curveTo) {
            cursor += 6
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            cursor += 4
          }
        }
      } else if (fn === OPS.stroke || fn === OPS.closeStroke) {
        lines.push(...pending)
        pending = []
      } else if (
        fn === OPS.fill ||
        fn === OPS.eoFill ||
        fn === OPS.fillStroke ||
        fn === OPS.eoFillStroke ||
        fn === OPS.endPath
      ) {
        // Cell backgrounds, not gridlines.
        pending = []
      }
    })

    const content = await page.getTextContent()
    const texts: PdfTextItem[] = []
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      const [x, baseline] = toPage([item.transform[4] as number, item.transform[5] as number])
      texts.push({ text: item.str, x, y: baseline - item.height / 2 })
    }
    return { lines, texts }
  } finally {
    await document.destroy()
  }
}

// A one-page PDF schedule with programs (MS, Plus, Round Dance, ...) as column
// groups, each with its own room and Event/Caller/Cuer sub-columns — the 2027
// Oregon Mid-Winter Festival's layout. See docs/design/midwinter-festival-2027.md.
export const pdfProgramGridParser: DanceScheduleParser = {
  format: 'pdf-program-grid',
  sourceFileName: 'dance-schedule.pdf',
  description: 'one-page PDF, programs as column groups (Event/Caller/Cuer) and time slots as rows',
  async parse(sourceFile, configFile) {
    let page: ProgramGridPage
    try {
      page = await readProgramGridPage(sourceFile)
    } catch (error) {
      return { sessions: [], errors: [`${error instanceof Error ? error.message : String(error)}`] }
    }
    const result = parseProgramGridPdf(page, {
      programStaff: loadDanceScheduleProgramStaff(configFile),
      staffAliases: loadDanceScheduleStaffAliases(configFile),
    })
    return {
      sessions: result.sessions.map((session, index) => ({ session, source: result.sources[index]! })),
      errors: result.errors,
    }
  },
}
