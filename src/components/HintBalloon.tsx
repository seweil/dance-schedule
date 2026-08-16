import { useEffect, useRef, type RefObject } from 'react'
import styles from './HintBalloon.module.css'

// Module-level, not component-state — shared by whichever HintBalloon
// instance(s) happen to be mounted at once (the kebab-menu and level-slider
// hints can both be showing simultaneously on a genuinely fresh device, see
// docs/design/onboarding-hints.md), since a single physical tap always has
// to be judged by the MOST RECENT relevant pointerdown's own decision,
// regardless of which instance made it. See the mechanism's own comment
// inside HintBalloon below for why this needs to live outside any one
// component's state/lifecycle at all.
let pendingClickSwallow = false
let clickSwallowListenerInstalled = false

function ensureClickSwallowListenerInstalled() {
  if (clickSwallowListenerInstalled) {
    return
  }
  clickSwallowListenerInstalled = true
  document.addEventListener(
    'click',
    (event) => {
      if (pendingClickSwallow) {
        event.preventDefault()
        event.stopPropagation()
      }
      pendingClickSwallow = false
    },
    { capture: true },
  )
}

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
  // Optional: the real control this hint points at, EXEMPT from the "first
  // tap swallows its own click" behavior below — a tap on this element
  // dismisses AND still goes on to perform its own action normally (its own
  // onClick/onValueChange already calls this SAME onDismiss — see each
  // caller's own comment). DanceScheduleFilters.tsx passes its `.levelField`
  // here: tapping a tick or dragging a thumb IS the hint doing its job, so
  // that same tap should also move the slider, not require a second tap.
  // PageMenu.tsx deliberately does NOT pass one: reported live that tapping
  // the kebab toggle while its hint was showing dismissed the hint AND
  // opened the menu in that one tap — per direct product decision, the
  // toggle should behave like every OTHER tap while the hint is up (dismiss
  // only, requiring a second, deliberate tap to actually open the menu),
  // not be a special case. Omitting `targetRef` entirely (rather than a
  // prop that's still required but sometimes points at nothing) is what
  // makes that the natural, no-exceptions default — see handlePointerDown
  // below.
  targetRef?: RefObject<HTMLElement | null>
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
  // the real target (targetRef, if given) also counts as "outside" here and
  // dismisses it too, same as e.g. DanceScheduleFilters.tsx's own tick
  // onClick already does explicitly — both paths call the same idempotent
  // dismiss, so there's no conflict from triggering it twice for that one
  // tap. No separate dismiss button on the balloon itself — reported live
  // that one was redundant UI, since a tap anywhere else already covers it.
  //
  // A tap that ISN'T on the balloon OR the real target (if any) ALSO gets
  // its own follow-up click swallowed — reported live: on a fresh device,
  // the very first tap anywhere (e.g. a "See all events" link on the home
  // page, while the kebab-menu hint is showing) shouldn't ALSO navigate
  // away or activate whatever it landed on, just dismiss the hint and leave
  // the user where they were, free to actually do something on purpose
  // next. Taps ON the real target are exempt ONLY when a `targetRef` was
  // given — see that prop's own comment above for why PageMenu.tsx
  // deliberately doesn't give one, so ITS toggle gets swallowed like
  // everything else too.
  //
  // Can't just call event.preventDefault() on THIS pointerdown event and
  // stop there: confirmed live (and in this component's own tests) that
  // canceling 'pointerdown' does NOT reliably suppress the browser's
  // follow-up 'click' for the same tap, despite the Pointer Events spec's
  // "compatibility mouse events" language suggesting it should — real
  // browsers (and jsdom) still go on to dispatch it.
  //
  // TWO earlier versions of the actual fix both failed on a REAL device,
  // for two DIFFERENT timing reasons — both traps of trying to reason
  // about WHEN a real tap's own 'click' will arrive, rather than sidestep
  // that question entirely:
  //   1. A plain 'click' listener added the normal way (inside this same
  //      effect, cleaned up on unmount) doesn't work: onDismiss() below
  //      can unmount this component synchronously, before the browser
  //      gets to dispatch the 'click' that follows this same
  //      'pointerdown' — by then, this component's own effect cleanup has
  //      already removed its listeners.
  //   2. A version that instead added a FRESH, one-off capture-phase
  //      'click' listener directly to `document` (independent of this
  //      component's own lifecycle) still failed, because of how long it
  //      waited before giving up: cleaning it up via `setTimeout(fn, 0)`
  //      fires almost instantly — well before a REAL finger's own
  //      touchstart-to-touchend dwell time (plus some mobile browsers'
  //      still-present tap-delay) produces its 'click' — so the listener
  //      was already gone by the time that later 'click' arrived. Widening
  //      the wait to a generous fixed timeout (plus a `pointercancel`
  //      fast-path for the common non-tap case) was STILL a real-device
  //      regression waiting to happen: it assumed the click either arrives
  //      well inside that window or never at all, but a real tap's own
  //      timing simply isn't bounded tightly enough to trust any fixed
  //      number, on top of `pointercancel` itself being able to fire for
  //      an ordinary tap that has any hint of finger jitter (extremely
  //      common on a touchscreen, essentially never reproducible with a
  //      synthetic/automated click), tearing the listener down before its
  //      own genuine 'click' still went on to arrive.
  //
  // The actual fix drops the clock entirely. `pendingClickSwallow`
  // (module-level, see its own comment above) is simply set on THIS
  // pointerdown and consumed by an ALWAYS-installed 'click' listener
  // (installed once, ever, the first time any HintBalloon mounts —
  // `ensureClickSwallowListenerInstalled`) whenever that click actually
  // shows up — 10ms later or 400ms later, it doesn't matter, since nothing
  // here is racing against a deadline. The only way this flag can go
  // stale is if a LATER pointerdown (a genuinely new gesture) happens
  // before the expected click ever arrives (e.g. this one turned out to
  // be the start of a scroll, which browsers don't follow with a 'click'
  // at all) — handled by every qualifying pointerdown always overwriting
  // the flag fresh, so a new gesture's own decision naturally supersedes
  // whatever an abandoned previous one left behind.
  useEffect(() => {
    ensureClickSwallowListenerInstalled()

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (balloonRef.current?.contains(target)) {
        pendingClickSwallow = false
        return
      }
      onDismiss()
      pendingClickSwallow = !targetRef?.current?.contains(target)
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
