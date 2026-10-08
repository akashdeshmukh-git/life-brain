# Life Brain test report

Automated browser tests (Chromium, Playwright) against the final build. 62 of 62 passed.

## Unit

- **PASSED** Brain detects every seeded pattern with H1–H3 diagnoses
- **PASSED** Any key is recognised by its shape; unclear keys are flagged, not guessed silently
- **PASSED** Next action: explains itself, asks for a first step when a task is unclear, respects snooze and your choice
- **PASSED** Blind spots: neglected values, avoided tasks with your reasons, overplanning, time optimism
- **PASSED** Load, overlap, calibration and plan-keeping math
- **PASSED** Decision matrix ranks options and finds the weight that flips it
- **PASSED** Plan history counts deferrals only when a task moves later
- **PASSED** Import validation rejects bad backups and accepts good ones
- **PASSED** AI text is escaped; local recall finds related memories
- **PASSED** Loop: plans are sized to what you really get done, with every rule applied
- **PASSED** Loop: experiments are judged against the weeks before, only after five days

## Flow

- **PASSED** Day loop: commit a plan, tick it off, close the day with reasons; misses move on
- **PASSED** Start makes a task live: yellow row counts down, Done records how long it really took
- **PASSED** Lines: each life area is a line with a letter and colour; editing it changes every bullet
- **PASSED** Month: each day shows its tasks as line-coloured dots and what became of them; a day opens in detail
- **PASSED** A task can be put on a line directly, without a goal
- **PASSED** A past day left open is asked about first; an unknown day is left out, not guessed
- **PASSED** Weekly review: the gap and its reasons; one experiment that changes plans; kept, it becomes a rule
- **PASSED** Now: blind-spot actions work, Not useful hides them, Not now asks why, quick add
- **PASSED** First run shows marked example data; clearing it leaves an empty, guided app
- **PASSED** Build area → aim → goal → project → task; task shows why it matters in Today
- **PASSED** Finishing a task records actual time and outcome separately from the plan
- **PASSED** Moving a task counts a deferral; letting go records the reason
- **PASSED** Forms validate input and save nothing when invalid
- **PASSED** Calendar: add events, detect overlap and load, switch months and agenda
- **PASSED** Experiment: hypothesis → start → observation → outcome → learning saved
- **PASSED** Diagnose: agree, annotate and reject conclusions; rejected ones hide
- **PASSED** Help me decide: weighted scores update live and the decision is saved with its reason
- **PASSED** Analyze life, suggest experiments and ask-anything work locally without AI
- **PASSED** Habits, values and direction editing
- **PASSED** Exactly two modes (white, true black) and seven highlight colours; choice tints the UI and persists
- **PASSED** Navigation: tab bar, More sheet, and desktop sidebar reach every section

## Persistence

- **PASSED** Data and profile survive a reload and a new tab
- **PASSED** A failed save shows an error and no success message
- **PASSED** Blocked storage: app still works in memory and says it is not saving

## Data

- **PASSED** Export downloads a complete JSON backup without the API key
- **PASSED** Import merges a backup into another device and replaces after confirmation
- **PASSED** Invalid import files are rejected with a reason and change nothing
- **PASSED** Device backups: back up now and restore
- **PASSED** Delete everything needs DELETE typed and erases records, key and backups
- **PASSED** Backup-as-text shows the same JSON for copying

## Offline

- **PASSED** Service worker caches the app; it reloads and saves with no network

## AI

- **PASSED** Missing key: nothing is sent; Brain says how to set up; a forgotten key is called out
- **PASSED** Success: preview equals what is sent; user controls scopes; answer shown safely and saved
- **PASSED** Provider errors: 500, 401, empty answer and unreachable host give clear messages
- **PASSED** Timeout ends a hung request with a message
- **PASSED** Stop cancels a request in progress
- **PASSED** Paste an OpenRouter key: detected, checked for free, models listed, answer works, key kept only if asked
- **PASSED** Connecting refuses bad keys and insecure addresses; network trouble offers Save anyway
- **PASSED** Anthropic and Gemini keys use their own request formats and headers
- **PASSED** Claude built-in provider (stubbed viewer): streams, answers, and handles a refusal of consent

## Design

- **PASSED** Sheet follows the finger, rubber-bands past the top, springs back, and a flick throws it away
- **PASSED** A sheet caught while closing comes back instead of finishing the close
- **PASSED** Deleting is instant with Undo, which restores the item and its links
- **PASSED** Fields say what is wrong as soon as you leave them, and clear when fixed
- **PASSED** Subway signage: bundled Helvetica-style face, black sign with white rule, no third-party requests, collapsing title bar, reduced motion respected
- **PASSED** Neurath X is used on key text when its files are added, with a clean fallback when not

## Quality

- **PASSED** No dead controls: every button and form on every screen and sheet is wired
- **PASSED** User text containing HTML is displayed, never executed
- **PASSED** Phone widths 320 and 390 never scroll sideways; desktop uses a sidebar
- **PASSED** Every form field has a label and every button has a name
- **PASSED** Claude-hosted build boots in a viewer-like page without a service worker or errors
## Blocked by environment

- **BLOCKED BY ENVIRONMENT** Calls to real AI services (OpenRouter, OpenAI, Anthropic, Gemini and the rest). The test machine cannot reach them. Each request format, header set, model listing, key check, error code, timeout and cancel was tested against a local stand-in server that speaks the same formats. Your own key was not used.
- **BLOCKED BY ENVIRONMENT** Whether each service accepts requests sent straight from a browser (CORS). This can only be confirmed against the live services. OpenRouter and Anthropic document browser access; for others the app shows a clear message and supports a proxy address.

## Not tested

- **NOT TESTED** Claude (built in) inside the real Claude viewer. It was tested with a stand-in for the viewer's interface.
- **NOT TESTED** Saving a backup file from inside the Claude viewer. "Show backup as text" is the fallback there and was tested.
- **NOT TESTED** Installing on a real Android phone (including how your launcher crops the icon; the icon was checked against a circle mask), and touch drags on a real phone. Sheet dragging was tested with a mouse in Chromium.
- **NOT TESTED** Safari and Firefox. All tests ran in Chromium.
- **NOT TESTED** The real Neurath X font. The loading path was tested with a free stand-in font file; the actual font is licensed and was not used.
- **NOT TESTED** Weeks of real use. The loop was tested with generated days and a simulated week. Whether its suggested changes help you can only be shown by your own closed days, which is what the verdicts measure.
- **NOT TESTED** Screen reader use. Labels and button names were checked automatically.
