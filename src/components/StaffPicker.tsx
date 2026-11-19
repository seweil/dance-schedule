import { useDismissableMenu } from '../hooks/useDismissableMenu'
import styles from './StaffPicker.module.css'

// The Staff Schedule's "Show more staff" checklist, at an event with a
// featuredStaff list: everyone else calling or cuing on the selected day, in two
// sections, each name a checkbox that adds or removes that person's column. A
// <details> disclosure, opened inline (it pushes the grid down) so columns can
// be seen appearing as names are ticked. Its open state is React's, not the
// element's own, so it also closes on Escape or a tap anywhere outside it, the
// same as the page menu (useDismissableMenu.ts). `selected` may include people
// not on this day (picks are kept across days); only this day's names are
// listed or counted.
export function StaffPicker({
  callers,
  cuers,
  selected,
  onChange,
}: {
  callers: readonly string[]
  cuers: readonly string[]
  selected: readonly string[]
  onChange: (names: string[]) => void
}) {
  const { isOpen, toggle, rootRef, toggleRef } = useDismissableMenu<HTMLDetailsElement, HTMLElement>()

  if (callers.length === 0 && cuers.length === 0) {
    return null
  }

  const shownToday = [...callers, ...cuers].filter((name) => selected.includes(name))

  function togglePick(name: string, checked: boolean) {
    onChange(checked ? [...selected, name] : selected.filter((picked) => picked !== name))
  }

  return (
    <details className={styles.picker} open={isOpen} ref={rootRef}>
      <summary
        className={styles.summary}
        ref={toggleRef}
        onClick={(event) => {
          // The element would toggle itself too; React's state is the one source.
          event.preventDefault()
          toggle()
        }}
      >
        Show more staff{shownToday.length > 0 ? ` (${shownToday.length})` : ''}
      </summary>
      <div className={styles.panel}>
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
    </details>
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
