# 07 — General Settings

## Evidence limitation
The earlier conversation identified a general Settings screen, but the current visual context does not expose its full contents. Treat the items below as a review checklist to verify against the original screenshot and implementation, not as confirmed defects.

## Purpose
Provide predictable preferences and administrative configuration without mixing personal preferences with organisation-wide policy.

## Review checklist
- Separate personal preferences (language, theme, notifications) from system/space configuration.
- Clearly label whether each setting affects the current user, one space, a district, or the whole platform.
- Use explicit save behaviour: autosave with status, or a Save button with success/error feedback.
- Provide safe defaults and explain irreversible or high-impact changes.
- Confirm before destructive actions and provide a recovery path where possible.
- Keep secrets, API keys and credentials out of client-visible settings.
- Apply role-based access control to administrative configuration.
- Ensure language and theme preferences persist after sign-in and across supported devices.
- Ensure forms are keyboard accessible and errors are associated with their fields.

## Acceptance criteria
- Every setting has a defined scope and permission requirement.
- Saved values persist after reload and are reflected consistently across relevant screens.
- Sensitive settings are not exposed to unauthorised roles.
- Save failures preserve user input and explain how to recover.
