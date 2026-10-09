# Test report

Automated browser tests (Playwright, Chromium, phone-size screen): **56 of 56 PASSED**.

AI calls were tested against a local mock service, including Organise, the AI tools (Plan steps and Tie to goals among them) and Automatic runs. Real AI services: NOT TESTED (BLOCKED BY ENVIRONMENT: the build machine cannot reach them), so how well a real model plans, sorts or ties tasks to goals is untested. Automatic runs on a real phone (app reopened, back online) are NOT TESTED. The accessibility test needs axe-core (`npm i axe-core` in `source`, or set `AXE_JS`); without it, that test reports BLOCKED BY ENVIRONMENT.

| Area | Test | Result |
|---|---|---|
| Start | Opens on Home: every screen in the menu, no errors, no example data, a calm brief that asks for a first goal | PASSED |
| Start | The menu: ☰ opens it, it shows where you are, items go to their screen, Settings is last, Escape and the backdrop close it | PASSED |
| Start | First open shows How it works once; it can be opened again from the menu | PASSED |
| Start | Today still works as before | PASSED |
| Home | Brief: headline with your name, the day as a line with one dot per event, three acts, what needs you and what is done | PASSED |
| Home | A full day reads as a climb; events can have an end time | PASSED |
| Tasks | Add, tick, undo and see done tasks fold away | PASSED |
| Tasks | Edit a task: rename, note, push to tomorrow (counted as moved), delete with undo | PASSED |
| Tasks | Overdue tasks show their date and move to today in one tap; "Anytime" holds undated tasks | PASSED |
| Habits | Add a habit, tick it, streak counts and shows in Progress | PASSED |
| Notes | No journal any more: old journal entries become dated notes, shown on their day in Calendar | PASSED |
| Notes | A note can be for another day: pick Tomorrow, it shows on that day, and Home brings it up | PASSED |
| Calendar | Month grid, pick a day, add a task and an event there, dots appear, month arrows work | PASSED |
| Calendar | Today's events show on Today | PASSED |
| Notes | Write, search, pin and delete notes; an empty new note is not saved | PASSED |
| Goals | Home invites a first goal; only its name is needed; it opens straight to a first step, which ties to it; Mark done, with Undo | PASSED |
| Goals | Goals screen: examples to start from; a counting goal gets +1, a corrected count, and moves to Done when reached | PASSED |
| Goals | Tasks and habits are tied to a goal from their own sheet; the picker only shows once a goal exists | PASSED |
| Heading | Where you’re heading: finished work by goal, the goal behind its date named first, its fix, and rows that open the goal | PASSED |
| Heading | Fixes: a stalled goal gets its next step put on tomorrow in one tap, with Undo; a task moved again and again opens; Not now hides a fix for a week | PASSED |
| Heading | Fixes: a day fuller than usual offers to move the newest loose tasks to later this week; tasks tied to goals stay; Undo | PASSED |
| AI | Plan steps for a goal from a Home fix: steps come tied to the goal, never past its date, without repeats; Undo | PASSED |
| AI | Tie tasks to goals: the AI matches loose tasks to goals, unknown ids are ignored, you can change a goal before Apply | PASSED |
| Progress | Week numbers: tasks done, habits only counted since they were added, overdue now | PASSED |
| Patterns | Finds a slipped habit, a task moved again and again, and the overdue pile | PASSED |
| Patterns | Says nothing when there is too little data | PASSED |
| AI | Preview shows exactly what is sent; notes are off by default; answer is rendered safely and can be saved | PASSED |
| AI | Organise a note: the AI suggests tasks, events, habits and goals; you check them; Add puts each where it belongs; Undo takes them back | PASSED |
| AI | Organise: an answer that is not a list gives a plain error; no key sends you to Settings | PASSED |
| AI tools | Break down: steps added with dates (never after the due date), the big task replaced, Undo restores it | PASSED |
| AI tools | Plan my week: only real, open tasks move, within the next 7 days; the note shows; Undo puts dates back | PASSED |
| AI tools | Sort out overdue: do today, move, split and delete each work; unknown actions are left alone | PASSED |
| AI tools | Home line: one sentence about today, kept until tomorrow; Weekly look back saves as a note | PASSED |
| AI tools | Ask your notes: needs a question, sends numbered notes, answer links to the notes it used | PASSED |
| AI tools | One tap runs: no second Send step, and with Automatic on a prepared suggestion opens instead of asking again | PASSED |
| AI tools | Every AI button without a key goes to Settings instead of failing | PASSED |
| Automatic | Off by default: opening the app sends nothing, even with a key kept on the phone | PASSED |
| Automatic | Switched on: a line about today and overdue ideas appear by themselves; applying needs one tap; it runs once a day | PASSED |
| Automatic | Closing a note organises it in the background; the suggestions wait on Home; unchanged notes are not sent again | PASSED |
| Automatic | On a Monday: weekly look back saved to Notes and a plan for the week waiting to check | PASSED |
| Automatic | Settings warns when the key is not kept, and shows a failed run plainly | PASSED |
| AI | Without a key, Ask AI goes to Settings → AI; a bad key shows a plain error | PASSED |
| AI | Paste a key: the service is recognised, checked, and a model chosen | PASSED |
| Data | Export then import (add and replace) round-trips everything | PASSED |
| Data | An old-version backup is converted: real items come in, example items stay out | PASSED |
| Data | First start brings over data from the earlier Life Brain once, skipping examples, and leaves the old data untouched | PASSED |
| Data | Delete everything needs DELETE typed, then clears all | PASSED |
| Look | Dark is true black; theme and colour switch from Settings and persist | PASSED |
| Look | Warm look everywhere: clay by default, serif page titles, and an old blue choice moves to clay once | PASSED |
| Tasks | Quick add reads a date word at the end: one step instead of five, with Undo | PASSED |
| Data | Imported records are reshaped: bad ids, dates, times and markup are refused or neutralised | PASSED |
| Data | Backup safety: Settings shows when a backup file was last saved; Home reminds only when one is overdue | PASSED |
| Accessibility | axe-core finds no WCAG 2.2 A/AA problems on any screen, light or dark | PASSED |
| Look | Fits a small phone (360px) on every screen with no sideways scrolling; uses Inter | PASSED |
| Offline | Installs a service worker and opens with no network | PASSED |
| Safety | Titles with HTML are shown as text, not run | PASSED |
