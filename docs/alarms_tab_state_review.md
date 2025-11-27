# Alarms tab state review

This note summarizes how the current UI manages alarm-related state in the Alarms tab.

## Active vs history view toggle
- `AlarmsScreen` keeps `showHistory` in component state initialized to `false`, so the view resets to **Active Alarms** whenever the tab is unmounted and remounted (e.g., when navigating away and back).
- The toggle button swaps between "View History" and "View Active"; history entries are sorted descending by timestamp and the active list filters out any `cleared` items defensively.

## Acknowledgement and clear logic
- "Acknowledge All" posts `ACKNOWLEDGE_ALARM` with `alarm_id: "all"` and is disabled when there are no active alarms or all active alarms are already acknowledged.
- "Clear Alarms" is enabled only when every active alarm is acknowledged; it calls `CLEAR_ALARM` and uses a green accent when available.
- Individual active alarms render an ACKNOWLEDGE button until acknowledged; once acknowledged the UI shows an italic green "Acknowledged" label instead.

## Visual cues and overlays
- Severity color coding uses red for `CRITICAL` and yellow for other severities, applied to the card border and badge.
- A critical, unacknowledged alarm triggers a full-screen overlay on every view **except** the Alarms tab; the overlay provides an ACKNOWLEDGE action for the specific alarm.

## History presentation
- History items include timestamp, computed duration from the timestamp, and a `CLEARED` badge when applicable.
- The history view does not expose clear or acknowledge controls; it is read-only and ordered most-recent-first.

## Data sources
- `activeAlarms` and `alarmHistory` are derived from the `/api/status` payload via `data.state.active_alarms` and `data.state.alarm_history` inside `App` before being passed to `AlarmsScreen`.

## Potential UX considerations
- Because `showHistory` is local state, users returning to the Alarms tab always start on the active view. Persisting the toggle (e.g., in higher-level state or storage) would keep the last selected view.
- There is currently no empty-state cue for history besides the "No alarm history." message.
