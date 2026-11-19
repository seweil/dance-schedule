import { describe, expect, it } from 'vitest'
import { staffScheduleLabel } from './staffScheduleLabel'
import type { DanceForm, DanceSessionData } from '../types/danceSchedule'

function session(danceForm?: DanceForm): DanceSessionData {
  return {
    kind: 'structured',
    date: '2027-01-30',
    startTime: '2027-01-30T19:00:00',
    endTime: '2027-01-30T20:00:00',
    location: { kind: 'located', rooms: ['Hall A'] },
    levels: danceForm ? [] : ['MS'],
    eventType: 'Dance',
    callers: ['Ted Lizotte'],
    ...(danceForm ? { danceForm } : {}),
  }
}

const freeform: DanceSessionData = {
  kind: 'freeform',
  date: '2027-01-30',
  startTime: '2027-01-30T12:00:00',
  endTime: '2027-01-30T13:00:00',
  location: { kind: 'roomless' },
  description: 'Lunch',
}

describe('staffScheduleLabel', () => {
  it('says "Caller Schedule" at a square-dance-only event', () => {
    expect(staffScheduleLabel([session(), freeform])).toBe('Caller Schedule')
  })

  it('says "Caller Schedule" for an empty schedule', () => {
    expect(staffScheduleLabel([])).toBe('Caller Schedule')
  })

  it.each<DanceForm>(['round', 'clogging'])('says "Staff Schedule" once a %s session is scheduled', (form) => {
    expect(staffScheduleLabel([session(), session(form)])).toBe('Staff Schedule')
  })
})
