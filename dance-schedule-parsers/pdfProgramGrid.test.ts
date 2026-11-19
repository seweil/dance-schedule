import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { pdfProgramGridParser } from './pdfProgramGrid'

// The real 2027 Oregon Mid-Winter Festival PDF, end to end: PDF reading (gridlines
// recovered from drawing operators, text positions) plus layout parsing, which
// src/lib/parseProgramGridPdf.test.ts covers rule by rule on synthetic grids.
describe('pdfProgramGridParser', () => {
  const contentDir = path.resolve('content/MidWinter2027')
  const parse = () =>
    pdfProgramGridParser.parse(
      path.join(contentDir, 'data', pdfProgramGridParser.sourceFileName),
      path.join(contentDir, 'config.yaml'),
    )

  it('parses the real festival schedule with no errors', async () => {
    const { sessions, errors } = await parse()
    expect(errors).toEqual([])
    expect(sessions).toHaveLength(99)
    expect(new Set(sessions.map(({ session }) => session.date)).size).toBe(4)
    expect(sessions.every(({ source }) => source.startsWith('Row '))).toBe(true)
  })

  it('reads merged cells, in-cell times, cuers and phases from the real layout', async () => {
    const { sessions } = await parse()
    const find = (source: string) => sessions.find((entry) => entry.source.startsWith(source))?.session

    expect(find('Row 29 (Sunday 10:00-11:00 AM), Relaxed')).toMatchObject({
      kind: 'freeform',
      description: 'State Meeting',
      startTime: '2027-01-31T09:00:00.000Z',
      endTime: '2027-01-31T12:00:00.000Z',
    })
    expect(find('Row 25 (Saturday 8:30-9:30 PM), MainStream')).toMatchObject({
      callers: ['Bruce Lowther', 'Ron Bell-Roemer'],
      cuers: ['Judy Russell'],
    })
    expect(find('Row 31 (Sunday 12:00-1:00 PM), MainStream')).toMatchObject({
      eventType: 'Trails Out',
      callers: ['Ted Lizotte'],
      cuers: ['Pam & Jeff Johnson'],
    })
    expect(find('Row 11 (Friday 9:30-10:30 PM), Round Dance')).toMatchObject({
      danceForm: 'round',
      phases: [3, 4, 5],
      cuers: ['David Vomocil'],
    })
    expect(find('Row 23 (Saturday 6:30-7:30 PM), Clogging')).toMatchObject({
      danceForm: 'clogging',
      callers: ['Trevor DeWitt'],
      startTime: '2027-01-30T19:00:00.000Z',
      endTime: '2027-01-30T22:00:00.000Z',
    })
  })

  it('applies the config\'s alias and the intro/teach level rules', async () => {
    const { sessions } = await parse()
    const structured = sessions.flatMap(({ session }) => (session.kind === 'structured' ? [session] : []))
    expect(structured.some((session) => session.callers.includes('Mike Kious'))).toBe(false)
    expect(structured.filter((session) => session.callers.includes('Michael Kious')).length).toBeGreaterThan(1)
    expect(structured.find((session) => session.eventType === 'Intro to A')).toMatchObject({ levels: ['Plus'] })
    expect(structured.find((session) => session.eventType === 'Intro to Plus')).toMatchObject({ levels: ['MS', 'MSX'] })
    expect(structured.find((session) => session.eventType === 'Teach Ph 5')).toMatchObject({ phases: [4] })
  })
})
