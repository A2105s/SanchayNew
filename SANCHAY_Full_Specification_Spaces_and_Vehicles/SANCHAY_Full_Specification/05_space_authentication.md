# 05 — Space Authentication and Signup

## Purpose
Authenticate registered space owners/administrators and associate each account with the correct registered space, without exposing one space's data to another account.

## What is visible
- Page is branded “SANCHAY Spaces” and “Open Space Booking”.
- Login and Signup tabs.
- Signup fields: Full name, Email address, Password (minimum eight characters), Registered Open Space Name.
- Text says only already registered open spaces are allowed.
- Explanatory copy says credentials are saved in Supabase Auth and profile mapping in PostgreSQL (Supabase).
- The page says each account is linked to one registered space and redirects to the current space dashboard after login.
- The header says “Open Space: Not signed in”.

## Issues and risks
### P1 — Identity and onboarding
- A free-text space-name field can fail because of spelling, punctuation, duplicate names, or name changes. Prefer a searchable selection backed by a stable space ID.
- “Only already registered open spaces are allowed” should be enforced server-side, not only by the UI.
- Clarify whether account creation is immediate or requires approval/invitation from an authorised administrator.
- Add password visibility, show/hide control, field-level validation and a clear password policy.
- Add password reset, email verification and safe error handling to the login flow.

### P0/P1 — Access control and data isolation
- A profile mapping in PostgreSQL (Supabase) is not sufficient on its own. PostgreSQL (Supabase) Security Rules must verify that the authenticated user can read/write only the linked space and permitted records.
- Do not trust a client-submitted space name or space ID to grant privileges.
- Define roles (owner, space administrator, booking officer, read-only auditor) and enforce least privilege.
- Prevent unauthorised account creation for public or sensitive spaces.
- Avoid revealing whether a particular email is registered through overly specific authentication errors.

## Recommended workflow
1. User selects an existing space from a controlled list.
2. The server validates that the space is eligible for owner/admin registration.
3. Supabase Authentication creates/verifies the identity.
4. A trusted server-side process creates the profile mapping with stable `spaceId`, role, status and audit metadata.
5. Access remains pending until verification/approval if the policy requires it.
6. Every protected read/write is checked against the authenticated UID, role and linked space.

## Acceptance criteria
- Invalid/unregistered space IDs cannot be associated with an account by changing client requests.
- Cross-space access tests fail by default.
- Email verification, password reset, loading states and safe error states are covered.
- Login and signup are keyboard accessible and usable on mobile.
- Account creation and role changes generate audit events.
