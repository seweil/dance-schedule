import styles from './DanceScheduleGrid.module.css'

// The □ (caller) / ○ (cuer) before a name on a card whose session has both — see
// danceScheduleCardContent.tsx's hasCallerAndCuer. Its accessible name says what
// it marks, so a screen reader hears "Caller Ted Lizotte" rather than an
// unexplained symbol.
export function StaffGlyph({ role }: { role: 'caller' | 'cuer' }) {
  return (
    <span className={styles.staffGlyph} role="img" aria-label={role === 'caller' ? 'Caller' : 'Cuer'}>
      {role === 'caller' ? '□' : '○'}
    </span>
  )
}
