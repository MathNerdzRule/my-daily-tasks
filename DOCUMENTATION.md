# Project Documentation - My Daily Tasks

## AND-001: Git Init

- **Status**: Done

## AND-002: Storage Migration

- **Status**: Done

## AND-003: Task Entry UI & Room Persistence

- **Status**: Done

## Native Room Refactoring

- **Role**: Dev
- **Action**: Rewrote `TaskItem.kt`, `AppDatabase.kt`, and `RoomTaskPlugin.kt` to natively host all TypeScript `Task` interface attributes (`category, date, recurringType, recurringDays, exceptions, start, end, priority`, etc.). Removed the temporary manual Room testing UI from `App.tsx` and routed all standard Timeline/QuickAdd mutations (Insert, Update, Delete) dynamically over the native Room Capacitor Bridge. Set `localStorage` logic structurally as a web-only fallback.
- **Status**: Applied. App assembled, migrated (v2 destructive migration enabled), and installed onto Pixel 9 Pro XL via ADB.

## API Key Update & Deployment

- **Role**: Dev
- **Action**: Replaced the previous `VITE_GEMINI_API_KEY` with a new key in the `.env` file (`AIzaSyDKvO...`). Verified that the API key is strictly maintained within `.env` and is not hard-coded in the project source (`services/gemini.ts` injects it via Vite). Rebuilt the web app, synced Capacitor assets, built the debug APK, and successfully ran wireless ADB deployment to the phone.
- **Status**: Done.

## Timeline & Modal UI Enhancements

- **Role**: Dev
- **Action**: Modified the `TimelineView.tsx` to expand the viewport height and conditionally show the "Jump to Today" link beneath the current date if it is not today. In the task modal (`App.tsx`), implemented a toggle state `showFullForm` to exclusively show the AI Quick Add input and button initially, with a "Enter task details manually" chevron toggle leading to the detailed form fields.
- **Status**: Done.

## Unified Task Modal & Quick Add

- **Role**: Dev
- **Action**: Converted the static AI Quick Add bar into the existing task details modal. The modal now serves a dual purpose for both creating new tasks and editing existing ones. Added a "Cancel" button for new tasks (replacing "Delete").
- **Status**: Done.

## Camera Task Creation Progress Modal

- **Role**: Dev
- **Action**: Added an animated loading modal to `App.tsx` that visually indicates when the app is analyzing an uploaded image or creating specific tasks. This provides real-time feedback during the AI metadata extraction process.
- **Status**: Done. Built and pushed via ADB.

## Recurring Tasks Support (Monthly & Weekly)

- **Role**: Dev
- **Action**: Modified `gemini.ts` to support `monthly` and `monthly_weekday` recurrence types. Updated `TimelineView.tsx` and `TasksRemoteViewsFactory.java` to filter and display these recurring dates accurately based on their origin date. In `App.tsx`, implemented an edit option for recurring tasks that prompts the user to either update just that single occurrence (by adding an exception and spawning a new detached task) or update the entire series.
- **Status**: Done. Built and deployed via ADB.
