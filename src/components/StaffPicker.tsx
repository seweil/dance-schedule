import styles from './StaffPicker.module.css'

// The Staff Schedule's "Show more staff" checklist, at an event with a
// featuredStaff list: everyone else calling or cuing on the selected day, in two
// sections, each name a checkbox that adds or removes that person's column. A
// native <details> disclosure, so it opens and closes with no script of its own
// and works the same on a phone and a desktop. `selected` may include people not
// on this day (picks are kept across days); only this day's names are listed
// or counted.
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
  if (callers.length === 0 && cuers.length === 0) {
    return null
  }

  const shownToday = [...callers, ...cuers].filter((name) => selected.includes(name))

  function toggle(name: string, checked: boolean) {
    onChange(checked ? [...selected, name] : selected.filter((picked) => picked !== name))
  }

  return (
    <details className={styles.picker}>
      <summary className={styles.summary}>
        Show more staff{shownToday.length > 0 ? ` (${shownToday.length})` : ''}
      </summary>
      <div className={styles.panel}>
        <StaffSection legend="Callers" names={callers} selected={selected} onToggle={toggle} />
        <StaffSection legend="Cuers" names={cuers} selected={selected} onToggle={toggle} />
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
