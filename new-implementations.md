# Sanchay Platform — Detailed Change Requirements

## Point 1: Implement a Proper Role-Based Access Control (RBAC) System

The platform has three primary areas: **Admin, Vehicles, and Spaces**. Implement a strict, secure, and organization-specific role-based access control system.

### 1.1. Vehicle Module Access
- The Vehicle module must be accessible only to authorized police station personnel.
- When a user logs in through a particular police station's account, they should see only the vehicle-related dashboard, data, features, and sidebar navigation permitted for that police station.
- Users must not be able to view or access data belonging to other police stations unless explicitly authorized.
- The sidebar must contain only the navigation options relevant to the Vehicle module and the logged-in user's permissions.
- Vehicle requests can be submitted by any authorized government organization, since Sanchay is a government-to-government (G2G) platform. However, access to the Vehicle management module itself must remain restricted to police stations.

### 1.2. Spaces Module Access
- When a user logs in through the Spaces module, they must see only the Spaces-related dashboard, data, features, and navigation.
- Each organization must be able to access only its own Spaces-related information, subject to its assigned permissions.
- Data belonging to other organizations must remain inaccessible unless access has been explicitly authorized.

### 1.3. Admin Access
- The Admin role must have the necessary permissions to administer both the Vehicles and Spaces modules.
- The existing header toggle between Vehicles/Fleet and Spaces should remain available to administrators.
- Remove the duplicate module-switching buttons or boxes from the sidebar.
- Administrators must be able to switch between the two modules using the existing header toggle.
- Administrative features, controls, and permissions must never be visible or accessible to ordinary Vehicle or Spaces users.
- Enforce these restrictions on both the frontend and backend. Hiding a button alone is not sufficient security.

## Point 2: Correct the Incorrect Role Dropdown

When logging in to the Vehicle module, the role dropdown sometimes displays an incorrect value, such as Admin or another unintended role.

- Investigate and fix the role dropdown so it displays the correct role associated with the authenticated user.
- Ensure that Vehicle users cannot accidentally receive or select an Admin role through the dropdown.
- Verify that role information is correctly retrieved from the authenticated session and backend.
- Check for incorrect default values, stale state, role-mapping issues, and frontend/backend inconsistencies.
- Ensure that this fix does not introduce authentication, authorization, or privilege-escalation vulnerabilities.

## Point 3: Remove Module-Switching Options from the Sidebar

The sidebar currently contains buttons or boxes for switching between Vehicles and Spaces.

- Remove these module-switching controls from the sidebar.
- Retain the existing Vehicles/Fleet and Spaces toggle in the header.
- The header toggle must be available only to users with the appropriate administrative permissions.
- Ordinary Vehicle and Spaces users must not see the module-switching toggle.
- Ensure that direct URL access and API calls cannot be used to bypass module-level permissions.

## Point 4: Add Request Cancellation Functionality

The Vehicles and Spaces modules currently allow users to submit requests but do not provide a proper option to cancel them.

- Add a Cancel Request action to eligible requests in both modules.
- Display the cancellation option wherever it is appropriate, such as request details or the request list.
- Define valid cancellation rules according to the request lifecycle.
- A user should be able to cancel their own eligible request, subject to authorization and its current status.
- Prevent cancellation of requests that have already reached a state where cancellation is no longer permitted, unless an authorized administrator can override it.
- Update the request status, dashboard, lists, and relevant availability information after cancellation.
- Ask for confirmation before cancelling a request and provide clear success or error feedback.

## Point 5: Fix and Improve the Satellite Map View

The current satellite view is not displaying or functioning correctly.

- Investigate and fix the satellite map rendering, tile loading, zooming, panning, and layer-switching behavior.
- Ensure the satellite view displays the correct geographical area and map data.
- Fix the contrast and visibility of the satellite-view toggle button.
- Ensure the button's active and inactive states are visually distinguishable.
- Maintain adequate contrast, accessibility, and readability in both satellite and standard map modes.
- Ensure that map markers, police station locations, and other important map controls remain visible and usable in satellite mode.

## Point 6: Expand Vehicle Categories and Classes

Expand the vehicle categories available when submitting a Vehicle request.

The current vehicle classification must be reviewed and extended to support a wider range of vehicles and machinery, including:

- JCBs and other earthmoving/construction machinery.
- Trucks and heavy commercial vehicles.
- Vans.
- Chhota Hathi / small commercial goods vehicles.
- Buses.
- Cars.
- Motorcycles and other two-wheelers.
- Other relevant government-use vehicles and specialized machinery.

Requirements:
- Organize vehicle classes into clear categories and subcategories wherever appropriate.
- Make the categories available in the relevant request, registration, allocation, and vehicle-management forms.
- Ensure that vehicle classes are consistently represented across the frontend, backend, database, filters, reports, and map markers.
- Use suitable icons for vehicle types wherever applicable.
- Prefer a centralized, maintainable vehicle-classification system instead of hardcoding different lists in multiple components.

## Point 7: Make the Accountable Officer's Phone Number Mandatory

When creating a vehicle request or assigning a vehicle to a particular person, the following rules must apply:

- The Accountable Officer's phone number must be a mandatory field.
- Validate the phone number before submitting the form.
- Display a clear validation message if the phone number is missing or invalid.
- The Contact Phone field associated with the police station must automatically be populated using the authenticated police station's registered contact number.
- Ordinary users should not have to manually enter the police station's contact number.
- Retrieve the station contact number from trusted backend or organization data rather than accepting an arbitrary value from the browser.
- Apply appropriate validation and authorization checks on the backend as well.

## Point 8: Improve Allocation Return-Due Formatting and Add Serial Numbers

### 8.1. Return-Due Display
The Return Due field in vehicle allocations currently displays only hours.

Update the display to show the remaining time in days and hours.

Examples:
- 2 days, 5 hours remaining.
- 1 day, 0 hours remaining.
- 6 hours remaining.
- Overdue by 1 day, 3 hours.

Requirements:
- Calculate the remaining duration from the allocation's due date and time.
- Display days and remaining hours in a readable format.
- Handle allocations that are overdue, due immediately, or already returned.
- Use a consistent format throughout allocation lists and relevant detail views.

### 8.2. Allocation Serial Numbers
- Add a serial-number column to the allocation list in the Vehicles module.
- Make it easier to identify and reference individual allocations.
- Ensure serial numbers remain consistent with the displayed list and pagination.
- If a permanent identifier is required for official records, retain the allocation's unique database ID separately from its display serial number.

## Point 9: Add Detailed Police Station Information Panels to the Map

The map currently displays police station locations. Extend this functionality so users can inspect a station's details by clicking its marker.

### 9.1. Police Station Details
When a user clicks a police station marker, open a proper side panel containing the relevant details of that police station.

Include, wherever available and authorized:
- Police station name.
- Station code or unique identifier.
- Address and geographical location.
- Contact details.
- Other relevant station information.

### 9.2. Vehicle Inventory Summary
The side panel must also display the vehicle inventory associated with the selected police station.

For example:
- JCBs: 75.
- Trucks: 25.
- Cars: 300.
- Motorcycles: 76.

These are illustrative examples only. Display actual figures retrieved from the database.

### 9.3. Inventory Details and Availability
- Display vehicle classes using recognizable icons and clear labels.
- Show the total quantity of each vehicle type associated with the police station.
- Where the data model supports it, distinguish between total vehicles, currently available vehicles, allocated vehicles, unavailable vehicles, and seized vehicles awaiting approval.
- Provide an easy-to-understand overview of which vehicle types and quantities are available at each station.
- Refresh the displayed figures when relevant inventory data changes.
- Ensure that the information respects role-based access permissions and does not expose restricted information to unauthorized organizations.

## Point 10: Implement a Seized Vehicle Registration and Approval Workflow

Introduce a dedicated workflow in the Vehicles module for registering vehicles seized by police stations and managing their potential future utilization through Sanchay.

### 10.1. Register a Seized Vehicle
When a vehicle is seized, authorized police station personnel must be able to register it on the platform through a dedicated form.

The form should capture relevant information, such as:
- Vehicle registration number, if available.
- Vehicle make, model, and class.
- Vehicle identification details, where available.
- Seizing police station.
- Date and location of seizure.
- FIR number or related case reference.
- Seizure documentation and supporting evidence.
- Current custody or storage location.
- Relevant case status and remarks.

The exact fields should align with applicable police procedures, the existing data model, and legal requirements.

### 10.2. Seized Vehicle Status and Tracking
- Every registered seized vehicle must receive a unique record and traceable status.
- Maintain a clear history of registration, custody, case updates, and administrative decisions.
- Keep seized vehicles separate from the inventory of vehicles that are immediately available for allocation.
- Do not automatically make a seized vehicle available for operational use.

### 10.3. Eligibility Review and Administrative Approval
A seized vehicle may become eligible for potential platform utilization after the relevant legal proceedings and release requirements have been resolved.

For example, this could occur after two or two and a half years, but the time elapsed alone must not determine eligibility.

- Provide an administrative review workflow for assessing eligibility.
- Authorized administrators must be able to review the relevant case status, documentation, and legal clearances.
- Allow administrators to approve or reject a vehicle for operational utilization, with appropriate reasons and an audit trail.
- Only after the required legal clearances, custody/release requirements, and applicable administrative approvals have been verified should the vehicle be eligible for inclusion in the usable fleet.
- A vehicle that is still subject to court proceedings, a seizure order, a release restriction, or other legal restrictions must not be made available for allocation.
- Record who made each decision, when it was made, and the reasons or supporting documents.

### 10.4. Integration With the Existing Vehicle Module
- Integrate this workflow with the existing vehicle registry, inventory, map, and allocation features.
- Display seized vehicles in a separate status or category until they are formally cleared and approved.
- Ensure that only approved and eligible vehicles can enter the available fleet.
- Maintain appropriate access controls for police personnel and administrators.

## Point 11: Implement Multilingual Support

Make the Sanchay platform multilingual.

- I will provide the translation API or related integration details separately.
- Once provided, inspect the API documentation and integrate the supplied service into the existing application.
- Provide a language selector in an appropriate location, preferably within the existing header or user settings.
- Ensure the selected language is applied consistently across the platform.
- Translate navigation menus, dashboard labels, buttons, forms, validation messages, status labels, notifications, and other user-facing interface text.
- Ensure that dynamic data and status messages are handled correctly.
- Preserve the existing layout and usability across supported languages, including languages that require different scripts or text direction where applicable.
- Persist the user's language preference where appropriate.
- Use a maintainable internationalization (i18n) architecture rather than scattering hardcoded translated strings throughout the application.
- Do not invent API endpoints, credentials, or request formats. Wait for and use the API details I provide.

## Point 12: Fix the Source Station in Vehicle Transfers

In the Vehicles module's Transfer section, the Source Station must be fixed to the police station associated with the currently authenticated user.

Requirements:
- Automatically populate the Source Station using the logged-in police station's trusted identity.
- Prevent ordinary users from changing the Source Station to another police station.
- The Destination Station should remain selectable from the permitted destination stations.
- Validate the source and destination on the backend before creating a transfer.
- Ensure that users cannot manipulate request payloads to transfer vehicles from stations they are not authorized to access.
- Update the relevant inventory and transfer records according to the existing transfer workflow.

## Final Implementation Requirements

- Inspect the existing Sanchay codebase, database schema, authentication flow, role definitions, API routes, and UI components before implementing these changes.
- Reuse existing architecture and components wherever possible rather than introducing unnecessary duplication.
- Preserve current functionality that is not affected by these requirements.
- Enforce all role-based and organization-specific restrictions at the backend and database-access layers, not only in the UI.
- Apply appropriate validation, error handling, audit logging, and transaction safety to inventory, allocation, cancellation, transfer, and approval workflows.
- Avoid destructive database migrations or changes that could corrupt existing records.
- Test the workflows with Admin users, police station users, and authorized non-police government organizations.
- Verify that users cannot access unauthorized modules or other organizations' records through direct URLs, modified requests, or manipulated form values.
- Run the available linting, type checks, tests, and production build after implementation.
- Report the changes completed, files modified, database migrations introduced, tests performed, and any remaining issues or configuration requirements.

Implement these requirements incrementally, preserving the existing design system and ensuring that the resulting platform is secure, maintainable, and consistent with the government-to-government purpose of Sanchay.