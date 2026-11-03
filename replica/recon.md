# Recon map: AlDente (macOS desktop, menu bar app)

Scope: battery charge management for MacBooks. That means the charge limiter plus everything
AlDente gates behind Pro: discharge, sailing mode, heat protection, top up, calibration,
schedules, sleep control, MagSafe LED, Shortcuts and the energy dashboard.
For: the user and a few friends, private testing, no revenue yet.
Platform target: macOS 13+ on Apple silicon first. Intel is a `could`.
Date: 2026-11-03

> Clean room. This map records what the app does and how a user moves through it, based on
> its public site. No code, binaries, icons, copy or names from AlDente go into the clone.
> AlDente Classic (up to 2.0) is open source, but don't read it during the build. That keeps
> the clone an independent implementation.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing / overview | https://apphousekitchen.com/aldente-overview/ | positioning, hardware list, Pro tags |
| 2 | feature docs | https://apphousekitchen.com/aldente-overview/features/ | the most complete feature and settings list |
| 3 | pricing | https://apphousekitchen.com/aldente-overview/pricing/ | Free vs Pro table. **It contradicts source 2 on tiers** |
| 4 | FAQ | https://apphousekitchen.com/faq/ | requirements, known issues, macOS interference |
| 5 | Intel behaviour post | https://apphousekitchen.com/aldentes-behavior-on-intel-macbooks/ | Intel Mode, hardware-stored limit |
| 6 | changelog | https://github.com/AppHouseKitchen/AlDente-Charge-Limiter/releases | not read yet |
| 7 | the user's own install (Free) | local | **still to do**: the user screenshots every popover and settings tab into `replica/screens/` |

Not read yet: support, blog posts on uninstalling, powered-off behaviour, the analytics setting,
and the "charges to 100% despite limit" troubleshooting post. Worth reading before the build.

Tier conflict: the features page marks only Charge Limiter and Discharge as Free. The pricing
page lists most features as Free, and the FAQ says clamshell discharge is Pro. This doesn't
matter for the clone, since the clone gets all of it. It only matters for knowing what the user
has never seen in the real app (anything Pro has no screenshots from the user's account).

## Core loop

Pick a charge limit once in the menu bar, and the Mac holds the battery there while plugged
in, safely, through sleep, heat and lid-close, with no further attention.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Menu bar icon | always visible | glanceable charge state | status icon, optional % text, optional hardware % | charging, paused at limit, discharging, unplugged, hidden ("don't show") |
| S02 | Main popover | click S01 | set limit, see state, quick actions | battery %, state label, limit slider + typed % field, sailing range shown as dashed band, Discharge button, Top Up, widget stack | normal, discharging (button hidden when auto discharge is on), top up active, calibration running, heat paused, helper missing (guess) |
| S03 | Popover edit mode | Settings > Appearance > Popover > open in edit mode | add, remove and reorder widgets | widget list, drag handles, add/remove | edit, normal |
| S04 | Popover widgets | inside S02 | optional panels | Sleep Control, Power Mode (full or compact), Specifications, Apps Using Significant Energy (with Quit), Power Flow | each one shown or hidden |
| S05 | Dashboard window | from popover (guess) | the bigger view | Power Flow sankey, energy-heavy apps list, Start Calibration, Sleep Control | idle, calibrating, on battery, on adapter |
| S06 | Settings: General | app menu / popover gear | app-level options | launch at login (guess), license (skip), remove app | default |
| S07 | Settings: Appearance | settings tab | look | menu bar icon style, battery specs in menu bar, popover options, show dock icon, MagSafe LED options | default |
| S08 | Settings: Battery Care | settings tab | the behaviour | Charge Control (auto discharge, sailing range, heat max temp, calibration options), Energy Use (low power mode policy, energy mode, energy app threshold, background processes), Sleep Behavior (stop charging when sleeping, disable sleep until limit, manual sleep control options), advanced disclosure | basic, advanced shown, Apple-silicon-only rows hidden on Intel |
| S09 | Settings: Automations | settings tab | scheduled tasks | task list, + add, active toggles, templates (monthly/biweekly calibration), catch up on missed tasks | empty, filled |
| S10 | Schedule task editor | + in S09 | create or edit a task | action picker, value (limit %, discharge target), time, repeat picker, day picker, active toggle | new, edit, invalid |
| S11 | Task history | S09 | audit of runs | list of run entries with time and result | empty, filled |
| S12 | Calibration progress | S02/S05 while calibrating | show phase | phase (charge to 100 > discharge to 10 > charge to 100 > back to limit), stop button | each phase, finished, cancelled |
| S13 | macOS forced calibration notice | shown when macOS runs its own calibration | explain locked controls | notice text, locked slider, locked stop button | shown |
| S14 | First run / helper install | first launch (**not documented, guess**) | install the privileged helper that writes to the SMC | explanation, Install button, admin password prompt (system) | not installed, installing, failed, installed |
| S15 | Shortcuts actions | macOS Shortcuts app | automation hooks | the app's action set | n/a |
| S16 | Remove app | Settings > General | clean uninstall | confirm dialog | confirm, done |

## Flows

```
F01 Set a charge limit (the core loop)
    S01 -> S02 drag slider (or type %)
    happy path clicks: 2
    edge: limit below current % (auto discharge kicks in, or the user is offered Discharge),
          limit set while unplugged, typed value out of range, helper not installed

F02 First run
    launch -> S14 install helper -> admin prompt -> S02 set limit
    happy path clicks: 3 + password
    edge: user denies the admin prompt, helper outdated after app update, Optimized Battery
          Charging still on in macOS (must tell the user to turn it off), macOS update breaks control

F03 Discharge to the limit while plugged in
    S02 Discharge -> adapter is ignored -> battery drains -> adapter resumes at target
    happy path clicks: 2
    edge: target >= current %, lid closed (clamshell), Thunderbolt dock drops out, user unplugs mid-way

F04 Top up to 100% once before a trip
    S02 Top Up -> charges to 100 -> unplug -> limit restores
    happy path clicks: 2
    edge: user never unplugs (stays at 100), app quits mid top up

F05 Calibrate the battery
    S02/S05 Start Calibration -> S12 phases -> back to limit
    happy path clicks: 2
    edge: unplugged during a phase, sleep during discharge, heat protection paused for the run,
          macOS starts its own calibration (S13)

F06 Schedule a monthly calibration
    S01 -> settings -> S09 -> template "monthly calibration" -> active
    happy path clicks: 5
    edge: Mac asleep or off at task time (catch up option), task fires while unplugged, lag of up to ~10 min

F07 Keep the Mac awake for 1 hour
    S02 Sleep Control widget -> 1 h
    happy path clicks: 2
    edge: battery drops to the re-enable % (sleep allowed again), unplugged with "re-enable when unplugged" on

F08 Heat protection (automatic, no clicks)
    battery temp > max -> charging paused -> temp falls (5 min hysteresis) -> charging resumes
    edge: during calibration (disabled), sensor read fails

F09 Change the limit from Shortcuts
    Shortcuts app -> "Set Charge Limit" action -> run
    edge: app not running, invalid value

F10 Customise the popover
    S07 -> S03 add/remove/reorder widgets
    happy path clicks: 4

F11 Uninstall safely
    S06 -> S16 Remove -> helper removed, charging restored to normal
    happy path clicks: 3
    edge: user just drags the app to the Trash (the helper is left behind and charging may stay inhibited)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Menu bar status icon | charging, paused, discharging, unplugged; with/without % text | normal, dark/light menu bar | S01 |
| Charge limit slider | with sailing band, locked | default, dragging, disabled (calibration / forced calibration) | S02 |
| Percent input field | inline with slider | default, invalid, disabled | S02 |
| Action button | primary, secondary, destructive (stop) | default, hover, pressed, disabled, hidden | S02, S05, S12 |
| Widget card | full, compact | shown, hidden, edit mode (drag handle, remove) | S02, S03, S04 |
| Power flow sankey | in popover, in dashboard | adapter only, battery only, both, discharging | S04, S05 |
| App energy row | with Quit button | normal, quitting | S04, S05 |
| Settings row | toggle, stepper/number, popup menu, slider | default, disabled, hidden (platform specific) | S06-S08 |
| Advanced disclosure | collapsed, expanded | | S08 |
| Task row | with Active toggle | active, inactive, missed | S09 |
| Task editor form | action, time, repeat, days | new, edit, invalid | S10 |
| Notice banner | info, warning | shown, dismissed | S02, S13 |
| Phase stepper | 4 calibration phases | pending, current, done | S12 |

## Inferred data model

No server and no accounts. Everything lives on the Mac: preferences in UserDefaults, tasks in a
small local store, live state in memory, polled from IOKit/SMC.

```
Settings      chargeLimit (int 20-100), autoDischarge (bool), sailingRange (int 0-20),
              heatProtection (bool), maxTempC (number), stopChargingWhenSleeping (bool),
              disableSleepUntilLimit (bool), allowDisplaySleep (followMacOS | never),
              muteWhenDisplayOff (bool), lockOnLidCloseWhileAwake (bool),
              stopChargingWhenAppClosed (bool), sleepReenableAtPct (5-95, default 20),
              sleepReenableWhenUnplugged (bool), lowPowerPolicy (off | on | battery | adapter),
              energyModeBattery/Adapter (auto | low | high), energyAppsThreshold (low | med | high),
              includeBackgroundProcesses (bool), magsafeIndicateLimit (bool),
              magsafeBlinkOnDischarge (bool), magsafeLed (default | alwaysOff | offDuringSleep),
              menuIconStyle (enum), showHardwarePct (bool), showDockIcon (bool),
              popoverWidgets (ordered list), catchUpMissedTasks (bool), calibrationAfterMacOS (enum)
              evidence: S07, S08, features page settings names
              confidence: high (names), medium (ranges and defaults)

ScheduledTask id, action (setLimit | calibrate | topUp | pauseCharging | dischargeTo |
              lowPowerOn | lowPowerOff), value (int?), time, repeat (daily | weekdays | weekly |
              biweekly | monthly | yearly | once), weekdays (set), active (bool), lastRunAt
              evidence: S09, S10, features page "Schedule"
              confidence: high

TaskRun       id, taskId, firedAt, result (ok | skipped | caughtUp | failed), note
              evidence: "Task History" mention
              confidence: medium

ChargeState   (runtime) charging | paused | sailing | discharging | topUp | heatProtect |
              calibration(phase) | unplugged | exit
              evidence: Shortcuts "Get State" values
              confidence: high

BatteryReading (runtime) macOSPct, hardwarePct, temperatureC, isPluggedIn, adapterWatts,
              batteryWatts, systemWatts, cycleCount, health, voltage, amperage
              evidence: Specifications widget, Power Flow, Get Temperature
              confidence: medium (exact fields are a guess)

CalibrationRun (runtime, persisted for resume) phase, startedAt
              evidence: S12, calibration description
              confidence: guess
```

Relationships: ScheduledTask 1-n TaskRun. Settings is a singleton. ChargeState is computed by a
controller from Settings + BatteryReading on each tick.

## How the hardware side works (public knowledge, needs verifying on the user's Mac)

This is the real engine of the app, and the UI is the easy part.

- Charge control on Apple silicon means writing SMC keys as root: one key inhibits charging and
  one disables the adapter (used for discharge). The key names have changed across macOS and
  firmware versions (the community has documented `CH0B`/`CH0C`, `CHTE`, `CH0I`/`CHIE`). The
  architect step must probe which keys exist on the target machine instead of hard coding them.
- Writing the SMC needs root, so the app needs a **privileged helper** (a launch daemon,
  registered with `SMAppService` on macOS 13+), and the menu bar app talks to it over XPC.
- Battery %, temperature, voltage, amperage and adapter watts come from IOKit
  (`AppleSmartBattery`, `IOPSCopyPowerSourcesInfo`) without root.
- Apple silicon resets charge inhibition on sleep and shutdown, which is why "stop charging when
  sleeping" and "disable sleep until limit" exist. Sleep and wake notifications from IOKit
  drive this.
- MagSafe LED is another SMC key. Low Power Mode is set through `pmset`.
- Sleep prevention uses `IOPMAssertionCreateWithName`.
- Shortcuts integration uses App Intents (macOS 13+).
- macOS's own Optimized Battery Charging fights the clone, so first run must check for it and
  tell the user to turn it off.
- MIT-licensed open-source tools like `actuallymentor/battery` document the same SMC approach.
  Their docs are fine to read for the key names.

## Feature matrix

See `features.csv`. Must: 14, should: 13, could: 9, skip: 5.

## Out of scope (cannot or should not be cloned)

- The name "AlDente", its icons, menu bar glyphs, screenshots and copy. The clone gets its own
  brand (`/replica-brand`).
- Licensing, Paddle checkout, Setapp distribution and online license checks. Not needed for a
  free, private build.
- Analytics. Not needed.
- Translations into the six site languages. Later, if ever.
- Intel Mode and Boot Camp behaviour. Only needed if a friend has an Intel MacBook. Kept as `could`.

## Size

Screens 16, flows 11, entities 6 (2 persisted, 4 runtime). Hard parts:

1. **SMC control through a privileged helper.** Root daemon, XPC, key names that differ by
   macOS/firmware, and it must fail safe: if the app crashes or is deleted, charging has to come back.
2. **Sleep and power-state edge cases.** Charging resumes during sleep on Apple silicon. Lid
   close, adapter swaps, docks, and macOS updates that silently break control.
3. **Sharing it with friends.** A privileged helper on someone else's Mac means signing and
   notarizing with an Apple Developer ID ($99/year), or asking friends to bypass Gatekeeper and
   approve the helper by hand. Decide before the build.

Also non-trivial: per-app energy usage (no clean public API) and a live power flow diagram.

Size: **M** (a few weeks). The UI is small. The helper, safety and edge cases take the time.
A first slice (helper + charge limiter + menu bar + popover) is about a weekend.
