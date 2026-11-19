import type { RefObject } from 'react'
import styles from './StaffPicker.module.css'

// The Staff Schedule's "Show more staff" checklist, at an event with a
// featuredStaff list: everyone else calling or cuing on the selected day, in two
// sections, each name a checkbox that adds or removes that person's column.
//
// Two pieces placed apart: the toggle button sits in the filter row
// (DanceScheduleFilters.tsx's extraControl, so it doesn't take a line of its
// own), and the panel opens full-width just below the filters, pushing the grid
// down, so columns can be seen appearing as names are ticked. The page owns the
// shared open state, from useDismissableMenu.ts like the page menu, so it closes
// on Escape or a tap anywhere outside the button and panel: the button's wrapper
// is the hook's root and the panel its "portal", since the panel isn't inside
// the button's own element. `selected` may include people not on this day (picks
// are kept across days); only this day's names are listed or counted.

function picksToday(callers: readonly string[], cuers: readonly string[], selected: readonly string[]) {
  return [...callers, ...cuers].filter((name) => selected.includes(name))
}

export function StaffPickerToggle({
  isOpen,
  onToggle,
  panelId,
  rootRef,
  toggleRef,
  callers,
  cuers,
  selected,
}: {
  isOpen: boolean
  onToggle: () => void
  panelId: string
  rootRef: RefObject<HTMLSpanElement | null>
  toggleRef: RefObject<HTMLButtonElement | null>
  callers: readonly string[]
  cuers: readonly string[]
  selected: readonly string[]
}) {
  if (callers.length === 0 && cuers.length === 0) {
    return null
  }
  const count = picksToday(callers, cuers, selected).length
  return (
    <span ref={rootRef}>
      <button
        type="button"
        ref={toggleRef}
        className={styles.toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
      >
        Show more staff{count > 0 ? ` (${count})` : ''}
        <span className={styles.chevron} aria-hidden="true">
          {isOpen ? '▴' : '▾'}
        </span>
      </button>
    </span>
  )
}

// `overlay` (a phone in portrait): instead of opening inline below the filters —
// where the level and phase sliders would sit between it and its button — the
// panel floats directly under the button, covering the sliders. It's rendered
// next to the button for that (DanceScheduleCallersPage.tsx) and positioned
// against the whole filter row (.overlay).
export function StaffPickerPanel({
  isOpen,
  onClose,
  overlay,
  panelId,
  panelRef,
  callers,
  cuers,
  selected,
  onChange,
}: {
  isOpen: boolean
  onClose: () => void
  overlay: boolean
  panelId: string
  panelRef: RefObject<HTMLDivElement | null>
  callers: readonly string[]
  cuers: readonly string[]
  selected: readonly string[]
  onChange: (names: string[]) => void
}) {
  if (!isOpen || (callers.length === 0 && cuers.length === 0)) {
    return null
  }

  const shownToday = picksToday(callers, cuers, selected)

  function togglePick(name: string, checked: boolean) {
    onChange(checked ? [...selected, name] : selected.filter((picked) => picked !== name))
  }

  return (
    <div id={panelId} ref={panelRef} className={overlay ? `${styles.panel} ${styles.overlay}` : styles.panel}>
      <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
        ✕
      </button>
      <StaffSection legend="Callers" names={callers} selected={selected} onToggle={togglePick} />
      <StaffSection legend="Cuers" names={cuers} selected={selected} onToggle={togglePick} />
      {shownToday.length > 0 && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange(selected.filter((name) => !shownToday.includes(name)))}
        >
          Featured staff only
        </button>
      )}
    </div>
  )
}

function StaffSection({
  legend,
  names,
  selected,
  onToggle,
}: {
  legend: string
  names: readonly string[]
  selected: readonly string[]
  onToggle: (name: string, checked: boolean) => void
}) {
  if (names.length === 0) {
    return null
  }
  return (
    <fieldset className={styles.section}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.names}>
        {names.map((name) => (
          <label key={name} className={styles.name}>
            <input
              type="checkbox"
              checked={selected.includes(name)}
              onChange={(event) => onToggle(name, event.target.checked)}
            />
            {name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
