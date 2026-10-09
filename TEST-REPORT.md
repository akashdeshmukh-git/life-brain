# Test report

Automated browser tests (Playwright, Chromium, phone-size screen): **27 of 27 PASSED**.

AI calls were tested against a local mock service. Real AI services: NOT TESTED (BLOCKED BY ENVIRONMENT: the build machine cannot reach them).

| Area | Test | Result |
|---|---|---|
| Start | Opens on Home: five tabs, no errors, no example data, a calm empty brief | PASSED |
| Start | Today still works as before | PASSED |
| Home | Brief: headline with your name, the day as a line with one dot per event, three acts, what needs you and what is done | PASSED |
| Home | A full day reads as a climb; events can have an end time | PASSED |
| Tasks | Add, tick, undo and see done tasks fold away | PASSED |
| Tasks | Edit a task: rename, note, push to tomorrow (counted as moved), delete with undo | PASSED |
| Tasks | Overdue tasks show their date and move to today in one tap; "Anytime" holds undated tasks | PASSED |
| Habits | Add a habit, tick it, streak counts and shows in Progress | PASSED |
| Journal | Mood and text save as you type and survive a reload | PASSED |
| Calendar | Month grid, pick a day, add a task and an event there, dots appear, month arrows work | PASSED |
| Calendar | Today's events show on Today | PASSED |
| Notes | Write, search, pin and delete notes; an empty new note is not saved | PASSED |
| Goals | Add a goal, +1, correct the count, reach it | PASSED |
| Progress | Week numbers: tasks done, habits only counted since they were added, journal days, mood | PASSED |
| Patterns | Finds mood-with-habit, a slipped habit, a task moved again and again, and the overdue pile | PASSED |
| Patterns | Says nothing when there is too little data | PASSED |
| AI | Preview shows exactly what is sent; notes are off by default; answer is rendered safely and can be saved | PASSED |
| AI | Without a key, Ask AI goes to Settings → AI; a bad key shows a plain error | PASSED |
| AI | Paste a key: the service is recognised, checked, and a model chosen | PASSED |
| Data | Export then import (add and replace) round-trips everything | PASSED |
| Data | An old-version backup is converted: real items come in, example items stay out | PASSED |
| Data | First start brings over data from the earlier Life Brain once, skipping examples, and leaves the old data untouched | PASSED |
| Data | Delete everything needs DELETE typed, then clears all | PASSED |
| Look | Dark is true black; theme and colour switch from Settings and persist | PASSED |
| Look | Fits a small phone (360px) on every screen with no sideways scrolling; uses Inter | PASSED |
| Offline | Installs a service worker and opens with no network | PASSED |
| Safety | Titles with HTML are shown as text, not run | PASSED |
