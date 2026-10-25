# 06 — Space Settings / Booking Rules

## Evidence from the conversation
The prior batch was described as containing a Space Settings screen with booking-rule configuration, including default booking window, approval threshold, idle-alert threshold, policy notes and transparent notes. The exact labels and current values should be verified against the original screen before implementation.

## Purpose
Allow authorised administrators to configure booking policy in one place, with validation, clear explanations and an auditable history of changes.

## Review points
- **Default booking window:** define earliest/latest permitted booking horizon and timezone. Explain whether the setting applies to all spaces or can be overridden per space.
- **Approval threshold:** specify the exact rule (for example, duration, capacity, category, or lead time) that triggers approval. Avoid a number with no unit or explanation.
- **Idle-alert threshold:** define what “idle” means, the time window, recipient, frequency and suppression rules. Do not conflate unused with available.
- **Policy notes:** separate enforceable rules from explanatory text. Rules must be enforced by the backend, not only displayed.
- **Transparent notes:** clarify whether these are public-facing explanations, internal admin notes, or audit comments. Never expose internal notes to citizens unintentionally.

## Risks to verify
- Settings may be editable without role checks or may save without confirmation.
- Conflicting global and space-specific policies may produce unpredictable booking outcomes.
- Users may not know whether a change is saved or which spaces it affects.
- No version history may make policy changes difficult to investigate.

## Improvements
- Group settings by purpose: Booking Rules, Approval Workflow, Notifications, Public Information.
- Show validation ranges, units, defaults and examples.
- Provide Save, Cancel and Reset-to-default actions, with a dirty-state warning.
- Preview the effect of policy changes and show the affected spaces.
- Record actor, timestamp, old value, new value and reason in an audit log.
- Use backend validation and atomic updates; prevent partial saves.

## Acceptance criteria
- Every setting has a documented definition, valid range, default and scope.
- Invalid combinations are rejected with actionable messages.
- Only authorised roles can change policy.
- Changes are versioned and auditable.
- A policy change does not silently invalidate existing bookings; impact is explicit.
