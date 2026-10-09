# Life Brain audit, 9 October 2026

This is a review of the app as it stood at commit 98cb75f (the warm-look release), followed by the fixes made in this round. Every measurement below came from scripts run against the built app in Chromium. Nothing here comes from real usage data, because the app collects none.

## 1. What the app is

Life Brain is a single-page web app installed from a link on an Android phone. It holds tasks, calendar events, notes, a daily journal with mood, habits and counted goals, all in the browser's IndexedDB on that phone. There is no server and no account. An optional AI step sends a month of records to a service of the user's choosing, after showing the exact text.

The code is plain JavaScript in eleven files (about 1,100 lines), joined by `build.mjs` into one `index.html` of roughly 300 KB with both fonts inlined. Screens are drawn from template strings. Taps go through one `data-action` lookup table and forms through another. A service worker makes it work offline.

There is one user, the owner. The main jobs, in rough order of frequency:

- Open the app and see what today holds (Home).
- Capture a task, tick it off, move it.
- Tick habits, write a journal line.
- Look at a day or a month (Calendar).
- Write or find a note.
- Check the week and patterns, occasionally ask the AI (Progress).

Unknowns. No analytics exist, and none were added, so actual task frequency, error rates and time-on-task are unknown. The app was never tested on the owner's phone by me, only in a phone-sized Chromium window. Real AI services could not be reached from the build machine.

## 2. Findings

### Data integrity and security

**Imported data reached the page unescaped (P1).** Record ids and dates were written straight into HTML attributes such as `data-id="${x.id}"` in about a dozen places, and `validateImport` only checked that an id was a non-empty string. A crafted backup file with an id like `x"><img ...>` would have injected markup. The strict Content Security Policy blocks inline script, so this could not run code, but it could still inject fake controls or break screens. Habit logs also accepted impossible dates such as `2026-13-40`, because `new Date` silently rolls them over.

**All data lives on one phone with no reminder to back it up (P1).** Clearing site data, or the browser evicting storage when the phone is short of space, deletes everything. The daily automatic snapshot lives in the same storage, so it dies with the data. The app asked the browser for persistent storage but never showed whether it was granted. Nothing told the user when a backup file was last saved.

### Accessibility (WCAG 2.2 AA)

An axe-core 4.10.2 scan of all seven screens, plus the task sheet, found 21 failing elements in light mode and 14 in dark mode:

| Problem | Where | Measured |
|---|---|---|
| Clay accent text below 4.5:1 | "Add", "History", "Move to today", "Service and address" links | 3.95:1 on paper |
| White text on clay buttons below 4.5:1 | every primary button, light and dark | 4.05:1 light, 2.89:1 dark |
| Faded text for the past part of the day | Home | 1.86:1 |
| Days outside the month | Calendar | 2.05:1 |
| Theme buttons used `aria-selected` on `role="radio"` | Settings | invalid ARIA |
| Add-habit button with no name | Today | no accessible name |

Axe does not test non-text contrast, so I measured it by hand. The tick circles and radio rings used `#b4b3a8` on `#fcfcfb`, which is 2.06:1. WCAG 1.4.11 asks for 3:1 on the visual boundary of a control.

Touch targets passed. The smallest are 34 px high, above the 24 px minimum in WCAG 2.2's 2.5.8. Reduced-motion preferences were already respected.

### Effort and clarity

**Dating a task took five steps (P2).** Adding "Call mom" for tomorrow meant typing, pressing Enter, opening the task, tapping Tomorrow, and tapping Save. Capture speed matters in a tool whose whole point is to hold things so the mind doesn't have to. Risko and Gilbert (2016) review the evidence that people offload memory to external tools readily when it is cheap, and Masicampo and Baumeister (2011) found that making a specific plan for an unfinished goal reduced its intrusion on unrelated work. The evidence supports cheap capture in general. It does not show that this particular shortcut improves outcomes. That would need testing.

**Calendar dots had no key (P2).** Four dot styles meant event, open task, done task and journal, and the only way to learn that was to tap and compare. Nielsen's "recognition rather than recall" heuristic favours a visible legend.

**Streak framing (P2).** Today showed a bare number beside each habit, which nothing explained. Progress said "No streak" after a single missed day, and Home said "On a 5-day streak, not ticked yet today". Silverman and Barasch (2023) found that after a streak breaks, people are less likely to keep doing the activity, beyond the effect of the missed day itself. Their studies were on consumer behaviour, not this app, so this is a reasonable caution rather than proof. A weekly count ("5 of last 7 days") gives the same feedback without a cliff edge. Lally et al. (2010) also found that missing a single day did not measurably slow habit formation, which argues against designs that make one miss feel like a reset.

### Performance

With 3,473 records (2,500 tasks, 300 events, a year of journal entries, 8 habits, 300 notes), the app booted in 0.12 s. Most screens redrew in 8 to 50 ms. Today took 168 ms per redraw, because it drew every overdue task, about 830 rows, and redraws on every tick. That is a noticeable delay on a slower phone, though only at an unusual backlog.

### What held up

Undo after tick and delete, the AI preview that shows the exact text before sending, the CSP, key handling (never exported), offline mode and migration from the earlier version all worked under test. No changes were needed there.

## 3. Backlog

| Pri | Problem | Change | Success check | Confidence |
|---|---|---|---|---|
| P1 | Unvalidated imported records | Reshape every record from outside to its known fields and check ids, real calendar days, times and numbers | Malicious backup imports with zero markup reaching the page | High |
| P1 | Silent data-loss risk | Record when a backup file is saved, show it and the persistent-storage answer in Settings, and add one Home reminder when there are 15+ items and no backup file in 30 days | Reminder appears and clears after export (tested) | Medium. The 30-day and 15-item thresholds are judgment calls |
| P1 | Contrast and ARIA failures | Darker clay `#b5532f` for light text and fills, dark text on clay in dark mode, a `--control` colour for rings, fix past-day and out-of-month text, fix ARIA | Axe reports zero WCAG A/AA violations on every screen in both themes | High |
| P2 | Five steps to date a task | Today's add box reads a date word at the end ("tomorrow", "friday", "next week", "someday"), with an "Added for Tomorrow" message and Undo | One step instead of five, and ordinary words are not misread (tested) | Medium. Benefit assumed, not measured |
| P2 | Dots without a key | Legend under the month grid | Visible on every month | High |
| P2 | Streak cliff | Weekly counts in Progress and Home, bare number removed from Today, link renamed "History" | No "streak" wording outside yesterday's positive note | Medium |
| P3 | Slow Today redraw at huge backlog | Show 40 overdue/today tasks, then "Show N more" | Redraw under 20 ms at 3,473 records | High |
| P3 | Two open tabs can overwrite each other | Not done. Rare for a phone app. Would need a storage event or BroadcastChannel | | |
| P3 | Tasks have no time of day | Not done. Implementation intentions ("when X, I will Y") have strong support (Gollwitzer and Sheeran 2006, a meta-analysis of 94 independent tests), but adding times and reminders would grow the app the owner just asked to simplify. Worth testing later as an optional field | | |
| P3 | No estimates | Not done on purpose. The planning fallacy is well established (Buehler, Griffin and Ross 1994), but the earlier version's estimate-heavy planning loop was what the owner found overwhelming | | |

## 4. What changed

- `02-db.js`: `cleanRecord()` rebuilds every record from a backup, the old database, or storage at start-up, using only the fields each kind needs. Ids must match `[A-Za-z0-9_-]{1,80}`. Dates must survive a round trip through `Date`. Times must be real clock times. Numbers are clamped. Anything else is dropped with a "damaged item" note. It also adds `lastExport`, `markExported()` and the `persisted` flag.
- `06-today.js`: `parseWhen()` reads a trailing date word in Today's add box only. The Calendar's add box already has a fixed day and is left alone. "sun" and "sat" are excluded, because they are ordinary words too often. Long task lists are capped at 40 rows.
- `06-home.js`: habit reminders use "Done N of the last 7 days", plus the backup reminder.
- `09-progress.js`, `10-settings.js`, `07-calendar.js`, `style.css`, `05-ui.js`: streak wording, backup status, legend, the colour and ARIA fixes, and contrast-checked colours for all seven accents.
- `tests/run.py`: four new tests (quick add, hostile import, backup reminder, an axe scan of every screen in both themes) and updated habit tests.

## 5. Verification

| Check | Before | After |
|---|---|---|
| Browser tests | 28 of 28 passed | 32 of 32 passed |
| Axe WCAG 2.2 A/AA plus best practice, light | 21 failing elements | 0 |
| Axe, dark | 14 failing elements | 0 |
| Clay text on paper | 3.95:1 | 4.82:1 |
| Text on primary buttons, light / dark | 4.05:1 / 2.89:1 | 4.95:1 / 6.21:1 |
| Tick-circle ring, light / dark | 2.06:1 / 3.08:1 | 3.21:1 / 4.10:1 |
| Steps to add a task for tomorrow | 5 | 1 |
| Today redraw at 3,473 records | 168 ms | 15 ms |
| Boot at 3,473 records | 0.12 s | 0.15 s |
| `index.html` size | 290 KB | 300 KB |

Not tested: real AI services (the build machine can't reach them), a real Android phone, TalkBack, and actual users. The accessibility result means automated checks pass. It is not a substitute for a screen-reader walkthrough.

## 6. Next, if the owner wants more

1. Use the app on the phone for a week, then note any screen that felt slow or unclear. That is the only real usability data available.
2. Try TalkBack on Today and Home once.
3. If quick add proves useful, consider times ("at 5pm"). Add reminders only if a missed time actually caused a problem.

## Sources

Existence and details checked by web search on 9 October 2026. The DOI pages themselves could not be opened from the build machine.

- Buehler, R., Griffin, D., and Ross, M. (1994). Exploring the "planning fallacy": Why people underestimate their task completion times. *Journal of Personality and Social Psychology*, 67(3), 366-381. https://doi.org/10.1037/0022-3514.67.3.366
- Gollwitzer, P. M., and Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis of effects and processes. *Advances in Experimental Social Psychology*, 38, 69-119. https://doi.org/10.1016/S0065-2601(06)38002-1
- Harkin, B., et al. (2016). Does monitoring goal progress promote goal attainment? A meta-analysis of the experimental evidence. *Psychological Bulletin*, 142(2), 198-229. https://doi.org/10.1037/bul0000025 (supports the weekly numbers on Progress)
- Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., and Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. *European Journal of Social Psychology*, 40(6), 998-1009. https://doi.org/10.1002/ejsp.674
- Masicampo, E. J., and Baumeister, R. F. (2011). Consider it done! Plan making can eliminate the cognitive effects of unfulfilled goals. *Journal of Personality and Social Psychology*, 101(4), 667-683. https://doi.org/10.1037/a0024192
- Nielsen, J. 10 usability heuristics for user interface design. Nielsen Norman Group. https://www.nngroup.com/articles/ten-usability-heuristics/
- Risko, E. F., and Gilbert, S. J. (2016). Cognitive offloading. *Trends in Cognitive Sciences*, 20(9), 676-688. https://doi.org/10.1016/j.tics.2016.07.002
- Silverman, J., and Barasch, A. (2023). On or off track: How (broken) streaks affect consumer decisions. *Journal of Consumer Research*, 49(6). https://doi.org/10.1093/jcr/ucac029
- W3C (2023). Web Content Accessibility Guidelines (WCAG) 2.2. https://www.w3.org/TR/WCAG22/
