import { useEffect, useRef, type RefObject } from 'react'
import styles from './HintBalloon.module.css'

export interface HintBalloonProps {
  message: string
  onDismiss: () => void
  // 'end' (default): sits BESIDE the anchor, immediately to its left, arrow
  // pointing right — PageMenu.tsx's kebab toggle, a small icon at the very
  // top of the page. 'center': below the anchor instead, horizontally
  // centered and arrow pointing up — the level slider
  // (DanceScheduleFilters.tsx) is itself centered rather than right-aligned,
  // and its own width varies (present-level count/text size/viewport — see
  // that file's maxLevelFieldWidthPx), so a fixed edge anchor would drift
  // off-center depending on how wide the slider happens to render. This is
  // the "second caller with a genuinely different placement need" this
  // component's own history anticipated (see git history /
  // docs/design/onboarding-hints.md) — resolved with one prop rather than a
  // full generic positioning API, since these two shapes are still the only
  // ones any caller has needed so far.
  placement?: 'end' | 'center'
  // The real control this hint points at — PageMenu.tsx's toggle button, or
  // DanceScheduleFilters.tsx's whole `.levelField`. A tap ON this element
  // already has its own onClick/onValueChange wired to call this SAME
  // onDismiss (see each caller's own comment) — using the real control IS
  // the hint doing its job, so that tap should dismiss AND still go on to
  // perform its own action normally. A tap anywhere ELSE, while the hint is
  // showing, still dismisses too (see handlePointerDown below) but must NOT
  // also trigger whatever it happened to land on — see that handler's own
  // comment for why.
  targetRef: RefObject<HTMLElement | null>
}

// A small, dismissible callout with an arrow pointing at whatever it's meant
// to be calling attention to — the presentational half of this app's
// onboarding-hint mechanism (see docs/design/onboarding-hints.md);
// useFirstLaunchHint.ts is the reusable logic half deciding WHETHER to
// render this at all. `placement` controls BOTH which side of the target
// this sits on and which way the arrow points — see its own comment above;
// HintBalloon.module.css's [data-placement] variants own the actual
// position/direction values, not this component.
//
// role="status" (not role="alert") — this is a helpful, non-urgent nudge a
// screen reader user can discover at their own pace, not something that
// needs to interrupt whatever they're already doing.
export function HintBalloon({ message, onDismiss, placement = 'end', targetRef }: HintBalloonProps) {
  const balloonRef = useRef<HTMLDivElement>(null)

  // Dismisses on a tap anywhere outside the balloon — the same "outside
  // click closes it" behavior useDismissableMenu.ts already gives Nav.tsx's/
  // PageMenu.tsx's own dropdowns, but written directly here rather than
  // reused from that hook: this isn't a reopenable toggle menu (no
  // isOpen/Escape-to-refocus behavior needed — once dismissed, a hint never
  // reappears), so useDismissableMenu's own shape doesn't fit. A tap on
  // the real target (targetRef) also counts as "outside" here and
  // dismisses it too, same as e.g. PageMenu.tsx's own handleToggleClick
  // already does explicitly — both paths call the same idempotent dismiss,
  // so there's no conflict from triggering it twice for that one tap. No
  // separate dismiss button on the balloon itself — reported live that one
  // was redundant UI, since a tap anywhere else already covers it.
  //
  // A tap that ISN'T on the balloon OR the real target ALSO gets its own
  // follow-up click swallowed — reported live: on a fresh device, the very
  // first tap anywhere (e.g. a "See all events" link on the home page,
  // while the kebab-menu hint is showing) shouldn't ALSO navigate away or
  // activate whatever it landed on, just dismiss the hint and leave the
  // user where they were, free to actually read the page before their next
  // tap does something real. Taps ON the real target are deliberately
  // exempt — see targetRef's own comment above.
  //
  // Can't just call event.preventDefault() on THIS pointerdown event and
  // stop there: confirmed live (and in this component's own tests) that
  // canceling 'pointerdown' does NOT reliably suppress the browser's
  // follow-up 'click' for the same tap, despite the Pointer Events spec's
  // "compatibility mouse events" language suggesting it should — real
  // browsers (and jsdom) still go on to dispatch it. And a plain 'click'
  // listener added the normal way (inside this same effect, cleaned up on
  // unmount) doesn't work either: onDismiss() below can unmount this
  // component synchronously, before the browser gets to dispatch the
  // 'click' that follows this same 'pointerdown' — by then, this
  // component's own effect cleanup has already removed its listeners.
  // Instead, a ONE-OFF capture-phase 'click' listener is added directly to
  // `document` right here, independent of this component's own lifecycle
  // (nothing tears it down on unmount) — capture phase means it runs
  // before the event ever reaches the tapped element or any of its
  // ancestors, so stopPropagation() there prevents that element's own
  // click handler (e.g. a link's navigation, or a plain <button>'s
  // onClick) from running at all, not just its default action. `once: true`
  // removes it after it fires; the `setTimeout` is a safety net for the
  // case where this pointerdown DOESN'T turn into a click at all (e.g. it
  // was the start of a scroll/drag) — without it, the listener would sit
  // there indefinitely and incorrectly swallow some later, unrelated
  // click.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (balloonRef.current?.contains(target)) {
        return
      }
      onDismiss()
      if (targetRef.current?.contains(target)) {
        return
      }
      function swallowClick(clickEvent: MouseEvent) {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
      }
      document.addEventListener('click', swallowClick, { capture: true, once: true })
      setTimeout(() => document.removeEventListener('click', swallowClick, { capture: true }), 0)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onDismiss, targetRef])

  return (
    <div ref={balloonRef} className={styles.balloon} data-placement={placement} role="status">
      {/* An actual arrow glyph — a thick shaft plus a solid, FILLED
          arrowhead with a CONCAVE (curved) back, the standard "pointy
          arrow" shape — drawn once, pointing right, always at its own
          true aspect ratio (never stretched/skewed). Each [data-placement]
          variant (HintBalloon.module.css) sizes and rotates this SAME
          glyph via real trigonometry against known distances (the real
          gap to the target, plus a fixed overlap sunk behind this
          balloon), rather than distorting its proportions to fit a box —
          see that file's own comment for the exact numbers. The tail
          (local x=0) is deliberately drawn UNDER this balloon's own
          background (same var(--color-accent) fill, so the overlap is
          invisible) rather than stopping exactly at its edge — see
          .pointer's own comment for why. */}
      <svg
        className={styles.pointer}
        data-placement={placement}
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* H62, not H55 — the concave arrowhead below bulges OUTWARD (toward the
            tip) at its own vertical center, per the quadratic curve's own math:
            base corners at x=50, control point at x=66, so at y=20 (the shaft's
            own height) the curve's actual edge sits at x=58, not x=50. A shaft
            ending at x=55 (an earlier version) fell 3 units short of that,
            leaving a visible gap between the shaft's own end and where the
            arrowhead's fill actually begins at that height — confirmed live.
            62 clears it with a couple units of margin. Unaffected by the
            arrowhead's own height shrinking below (5-35, not 0-40) — that
            change only moves the arrowhead's TOP/BOTTOM corners closer to its
            own vertical center, not its back edge's own x-position at y=20,
            which is what this shaft actually needs to clear. */}
        <path d="M0 20H62" stroke="currentColor" strokeWidth="12.4" strokeLinecap="butt" fill="none" />
        {/* 5-35, not 0-40 (the full viewBox height) — per direct product
            decision, a smaller, more refined arrowhead (25% shorter, same
            proportional reduction as the shaft's own strokeWidth above),
            still centered on y=20 so it lines up with the shaft regardless
            of size. */}
        <path d="M50 5Q66 20 50 35L100 20Z" fill="currentColor" />
      </svg>
      <p className={styles.message}>{message}</p>
    </div>
  )
}
