# UX Action Plan — HamSats

---

## Section 1 — UX Workflow Improvements

### 1.1 First-load with no home location is a dead end

**Problem:** On first visit the only visible action is "Set Home Location". There is no map-level onboarding, no hint that the user can drag the map and click to place a marker manually, and no indication that geolocation is optional. If the browser denies location permission the UI silently falls back to the map center (0°, 0°) — the ocean — with no feedback.

**Action:**
- Show a subtle one-line banner above the button: *"Click the map to set your QTH, or use the button below."*
- On geolocation denial, show a toast/inline notice: *"Location access denied — click anywhere on the map to set your position."*
- Enable map-click-to-set-home even before the user clicks the button (click handler is always active but silent — surface it).

---

### 1.2 AGL height is hidden on mobile but still affects calculations

**Problem:** The AGL toggle button (`+ AGL: 0m`) is hidden via CSS at `≤640px`. The AGL value persists in state and continues to influence satellite horizon calculations, but the user on mobile has no way to view or change it. This is a silent functional gap, not a deliberate simplification.

**Action:**
- Restore AGL access on mobile — replace the slider with a compact numeric input (`<input type="number" min="0" max="500">`) that is always visible on mobile. The vertical slider can remain on desktop.
- Alternatively, move AGL into the StatusBar row on mobile as a tappable label that opens a bottom sheet.

---

### 1.3 Baofeng (FM) mode gives no persistent visual cue

**Problem:** When Baofeng mode is active, the satellite list is silently filtered. The only indication is the checked checkbox. If the panel scrolls or the user forgets, they may be confused by missing satellites in search and upcoming passes.

**Action:**
- Add a small persistent badge in the SatelliteSelector header when the mode is active: *"FM filter ON"* in amber.
- Change the border or background of the search input to a tinted color while filtering is active, matching the FM badge used in UpcomingSatellitesControl.

---

### 1.4 TransmitterInfoControl and UpcomingSatellitesControl have inconsistent default expand state

**Problem:** TransmitterInfoControl is always expanded on load (`expanded = true`). UpcomingSatellitesControl is conditionally expanded only if `window.innerWidth > 640`. There is no documented reason for the asymmetry. On desktop both open, stacking tall on the right side. On mobile TransmitterInfo is open but UpcomingSatellites is closed — the opposite of what makes sense (passes are more useful than transmitter frequencies on a small screen).

**Action:**
- Unify default state: both panels start **collapsed**, with a clear header users can tap to expand.
- On desktop, TransmitterInfo auto-expands (it's compact). UpcomingSatellites starts collapsed because it can be very long.
- On mobile, both start collapsed. The user expands the one they need.

---

### 1.5 Clearing a satellite selection jumps the map unexpectedly

**Problem:** When a satellite is deselected (red X button), the map is programmatically fit to show home location + nearest satellites. This is a disorienting jump if the user was zoomed in to inspect the satellite's path.

**Action:**
- Only refit the map on deselect if the current view no longer contains the home location (i.e., the user has panned far away). Otherwise, keep the current viewport.
- Optionally, animate the transition (`view.animate(...)`) so the jump is not abrupt.

---

### 1.6 "Show future path" is hidden between the Baofeng checkbox and the transmitter panel

**Problem:** The "Show future path" checkbox appears below "Baofeng (FM) mode" when a satellite is selected. These two controls have nothing to do with each other contextually. The path toggle relates to the selected satellite's track; the Baofeng mode relates to the satellite list filter. Placing them in the same visual group is confusing. Additionally, Baofeng mode is hidden on mobile when a satellite is selected (by CSS), which means the path toggle also loses context.

**Action:**
- Move "Show future path" into its own row inside the SatelliteSelector, visually separated from the Baofeng checkbox (a thin `<hr>` or a margin break).
- On mobile, show only "Show future path" when a satellite is selected (Baofeng mode is already correctly hidden in this state — that part is fine).

---

### 1.7 Distance is shown inconsistently across panels

**Problem:** Satellite distance appears in three places with different formatting:
- Autocomplete dropdown: `FUNCUBE-1 (AO-73) (1234 km)` — appended to the name, no label
- StatusBar: `Distance: 1234.1km` — label + value, monospace
- NearestSatellitesFeature map label: `FUNCUBE-1 (AO-73) (1234km)` — on-map text

There is no distance shown in the UpcomingSatellitesControl or TransmitterInfoControl, and the formatting (decimal places, unit spacing, label presence) differs across all occurrences.

**Action:**
- Standardize distance display as `1 234 km` (no decimal, thousands separator, space before unit).
- Add distance-at-AOS to upcoming satellite list rows (e.g., *"max elevation 32°"* or *"~1 200 km at closest"*), replacing or supplementing the countdown-only display.

---

### 1.8 No feedback while upcoming passes are being computed

**Problem:** `predictUpcomingVisibleSatellites()` iterates over all satellites with 30-second intervals over a 24-hour window — a computationally heavy operation. On slow devices it can take multiple seconds. The UpcomingSatellitesControl renders nothing during this time with no loading indicator.

**Action:**
- Show a "Computing passes…" placeholder row while the prediction is running.
- Move prediction into a Web Worker to prevent UI jank during computation.

---

### 1.9 The StatusBar collapses too aggressively on small screens

**Problem:** At `≤640px`, when a satellite is selected, the `.sat-selected` modifier hides both `.location` and `.elevation` from the StatusBar. Only satellite info (distance, azimuth, elevation angle) remains. This means the user's own coordinates disappear entirely, which is disorienting.

At `≤360px`, location and elevation are always hidden regardless of satellite selection.

**Action:**
- At `≤640px` with satellite selected: keep home coordinates but display them in a smaller sub-row, not hidden entirely.
- At `≤360px`: show at minimum a single compact line: `Home: 54.68°N 25.27°E | Sat: 1234km 32°`.

---

### 1.10 URL parameter `?id=` is updated on every selection but never surfaced to the user

**Problem:** The `?id=` URL parameter enables direct links to a specific satellite. This is a useful feature that users have no way to discover. There is no "Copy link" affordance anywhere in the UI.

**Action:**
- Add a small "share" or "copy link" icon next to the satellite name in the SatelliteSelector input when a satellite is selected. One tap copies the current URL to the clipboard.

---

## Section 2 — Style Unifications

