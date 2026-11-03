# Architecture: personal flight tracker (rebuilding the core features of Flighty and byAir)

Working name: **Fly** (placeholder until /replica-brand).
Audience: one person (Jeppe), plus family who receive updates without
installing anything. Installed by Xcode onto your own iPhone. No App Store, no
payments and no marketing for now.

Read with `recon.md` (screen IDs S01 to S29, flows F01 to F12) and
`schema.sql` (the first migration).

## What "personal and sideloaded" changes

| decision | because |
| --- | --- |
| Native SwiftUI, not Expo | Live Activities, Dynamic Island, widgets and the Watch app are WidgetKit/ActivityKit, which are Swift only. A React Native shell would still need all of that written in Swift. |
| No payments, paywall, plans, referral | personal use. Rows marked `skip (personal)` in `features.csv`. |
| Friends inside the app: later | your friends can't install a sideloaded build. For now, you track their flights yourself (`role = 'friend'`), and they get **your** flights through a web link or a Telegram bot, which needs no app. |
| Alerts go to Telegram first, APNs later | a free Apple ID (Xcode "Personal Team") **cannot use Push Notifications or iCloud**. Those need the paid Apple Developer Program. A Telegram bot gives instant, reliable pushes today and also covers "family updates without the app" (F07). |
| Flight data on a personal, non-commercial API tier | it's cheap or free at your volume, and its terms fit personal use. |

### The Xcode signing question (decide this early)

| | free Apple ID (Personal Team) | Apple Developer Program, $99/yr |
| --- | --- | --- |
| install on your iPhone from Xcode | yes | yes |
| app keeps working | **7 days**, then re-run from Xcode | 1 year |
| push notifications (APNs) | **no** | yes |
| Live Activity updates by push, push-to-start | **no** (updates only while the app runs) | yes |
| iCloud, Sign in with Apple | no | yes |
| App Groups (widget reading the app's data) | check Apple's [supported capabilities](https://developer.apple.com/help/account/reference/supported-capabilities-ios) table; plan as if no | yes |
| TestFlight for family | no | yes |

Recommendation: build milestones 1 and 2 on the free account with Telegram
alerts. Pay the $99 when you start milestone 3 (Live Activity and widgets).
That's where the free account stops being able to show live status on the
lock screen, and that's the feature both apps are known for.

Building also needs a Mac with Xcode 16 or later. This cloud session runs on
Linux, so I can write the Swift code here, but you compile and install it on
your Mac.

## Stack

| layer | choice | why |
| --- | --- | --- |
| iOS app | SwiftUI, iOS 18+, Swift 6, `supabase-swift` SDK | native is required for the lock screen surfaces; iOS 18 matches both originals |
| local cache | SwiftData | offline flight cards in the air (both apps cache); instant launch |
| maps | MapKit (SwiftUI `Map`) | free, native, great curves and annotations |
| widgets / Live Activity | WidgetKit + ActivityKit, one extension target | the main reason for going native |
| backend | Supabase: Postgres, Auth, Edge Functions (Deno/TypeScript), `pg_cron`, Realtime | one managed box: DB, cron, functions; the free tier covers one user |
| database | Postgres (Supabase), RLS on every table | see `schema.sql` |
| auth | Supabase Auth, email one-time code | Sign in with Apple needs the paid program; switch later |
| flight data | **FlightAware AeroAPI, Personal tier** (primary) | non-commercial personal tier, no monthly minimum, about $5/month usage credit, per-query fees above that. Its **push alerts are not on Personal**, so we poll. Backup: AeroDataBox (RapidAPI). Verify current prices before you start. |
| live position (optional) | AeroAPI position, or OpenSky Network (free, non-commercial, ADS-B) | OpenSky saves AeroAPI credit during cruise |
| weather | aviationweather.gov METAR/TAF API (free, public) | the "why is it delayed" weather reasons (S14) |
| US airport delays | FAA NAS Status (public) | Flighty's FAA advisories, for US airports |
| airports / airlines seed | OurAirports CSV (public domain), OpenFlights airlines (ODbL) | no paid reference data |
| alerts | Telegram Bot API (now), ntfy (alternative), APNs + Live Activity push (after $99) | Telegram does both your alerts and family updates |
| inbound email | Postmark inbound webhook | forwarding import (F02) without touching `raggan.no` MX records, which already carry your mail. Can move to `fly.raggan.no` later. |
| email parsing | Claude API (`claude-haiku-5-5`) with a strict JSON schema, your own key | airline emails are messy; the model only extracts flight number, date and route, and the flight provider is the source of truth |
| share page | static page on your GitHub Pages site (`raggan.no/fly/?t=...`) calling a public Edge Function | free hosting you already have. Supabase's default domain will not serve HTML pages, so the HTML lives on Pages and the data comes from the function as JSON. |
| jobs | `pg_cron` calling Edge Functions with `pg_net` | no extra service |
| payments, marketing email | none | personal |

Repo: put the app in a **new private repo** (e.g. `fly`) with `ios/`,
`supabase/migrations`, `supabase/functions`, `web/share`. Keep only the share
page in this Pages repo. Anything merged to `main` here is public on
raggan.no.

## Schema

Tables: 17, plus one view. Access rules: Postgres RLS. Tested: `schema.sql`
loads cleanly into Postgres 16 with Supabase's `auth` schema stubbed. A smoke
test (user, airports, flight, user_flight, share link, stats view, constraint
rejection) passes.

| table | owner | purpose |
| --- | --- | --- |
| profiles | self | home airport, units, Telegram chat, forwarding address |
| airports, airlines, aircraft | reference (service role writes) | seeded from OurAirports/OpenFlights, aircraft filled by the poller |
| flights | shared; manual ones private | one row per real flight instance, keyed by provider id |
| flight_positions | shared | recorded track for followed flights |
| flight_events | shared | every change seen, unique `dedupe_key`, the source of alerts |
| predictions | shared | rule-based delay predictions |
| trips | user | grouping legs |
| user_flights | user | your link to a flight: mine/friend, seat, booking ref, notes, alert level |
| alert_prefs | user | per-type toggles |
| notifications | user (read-only) | one row per message sent, unique per (user, event, channel) |
| devices | user | APNs tokens, for later |
| share_links | user | revocable, expiring links and Telegram subscriptions for family |
| favorite_airports | user | airport alerts |
| inbound_emails | user (read-only) | forwarded bookings; body wiped after parsing |
| provider_usage | service role only | monthly API spend guard |

Key constraints:
- `flights (provider, provider_flight_id)` is unique, so two imports of the same
  flight become one row.
- `user_flights (user_id, flight_id)` is unique.
- `flight_events (flight_id, dedupe_key)` is unique, so a change seen twice
  becomes one event.
- `notifications (user_id, flight_event_id, channel)` is unique, so one event
  sends one message.
- `inbound_emails (user_id, message_id)` is unique, so a re-forwarded email
  isn't imported twice.
- `share_links` must point at exactly one of a flight or a trip.

## API

Supabase gives each table a REST endpoint (PostgREST), guarded by RLS. The
app reads and writes its own rows directly. Edge Functions exist only where a
secret key, a third-party call or a public page is involved.

### F01 add a flight, F02 automatic import, F09 history import

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /functions/v1/search-flights | looks up the provider by ident + date, or by route + date; 10 min cache | signed in | `{query, date}` | candidates `[{provider_flight_id, ident, origin, destination, scheduled_out, scheduled_in, status}]` | F01 |
| POST /functions/v1/add-flight | upserts the flight and its airports, airline and aircraft, inserts `user_flights`, sets `next_poll_at` | signed in | `{provider_flight_id, role, friend_name?, trip_id?, source}` | `user_flight` with joined `flight` | F01, F02 |
| POST /rest/v1/flights + /rest/v1/user_flights | manual flight (S05) | signed in, RLS | origin, destination, date, times | rows | F01 |
| GET /rest/v1/user_flights?select=*,flight:flights(*,origin:airports!origin_id(*),destination:airports!destination_id(*),aircraft(*)) | My Flights and Friends lists (S02, S11) | signed in, RLS | filters `role`, date | rows | F01, F04 |
| PATCH /rest/v1/user_flights?id=eq.{id} | edit seat, class, reason, notes, booking ref, alert level (S21) | owner | fields | row | F04 |
| DELETE /rest/v1/user_flights?id=eq.{id} | remove from my list | owner | | | |
| POST /functions/v1/inbound-email | Postmark inbound webhook: matches the address to a profile, stores the email (unique Message-ID), queues parsing | Postmark, basic auth secret | Postmark JSON | 200 | F02 |
| POST /functions/v1/import-csv | parses Flighty / myFlightradar24 / App in the Air / OpenFlights exports into manual past flights (no provider calls, to save credit) | signed in | file | `{imported, duplicates, unmatched[]}` | F09 |
| (on device) calendar scan | EventKit reads chosen calendars on the phone, finds flight numbers, calls `search-flights` then `add-flight` | app | | | F02 |

### F03 alerts, F04 day of travel, F05 connection

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /functions/v1/refresh-flight | pull to refresh one flight; limited to once per 60 s per flight | signed in, must own a `user_flight` for it | `{flight_id}` | flight | F03, F04 |
| GET /rest/v1/flight_events?flight_id=eq.{id}&order=occurred_at.desc | "what changed" list on S06 | signed in | | rows | F03 |
| GET /rest/v1/predictions?flight_id=eq.{id}&superseded_at=is.null | prediction card S08 | signed in | | row | F03 |
| GET /rest/v1/flights?id=eq.{inbound_flight_id} (recursive in the app, up to 25 h) | where's my plane S07 | signed in | | rows | F03 |
| Realtime channel `flights:id=eq.{id}` | live updates while the app is open | signed in | | change events | F04 |
| PUT /rest/v1/alert_prefs | toggles S23 | owner | `{kind, enabled}` | row | F03 |
| POST /functions/v1/telegram-webhook | Telegram bot updates. `/start link-<code>` links your chat to your profile. `/start <share token>` subscribes a family member's chat to one shared flight. `/stop` unsubscribes. | Telegram, `X-Telegram-Bot-Api-Secret-Token` header | update JSON | 200 | F03, F07 |
| POST /functions/v1/link-telegram | creates a one-time code and returns a `t.me/<bot>?start=link-...` deep link | signed in | | `{url}` | F03 |
| POST /functions/v1/register-device | stores the APNs token and the Live Activity push token (after $99) | signed in | `{apns_token, user_flight_id?, activity_token?}` | 200 | F04 |

### F06, F07 sharing

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /rest/v1/share_links | creates a link for a flight or a trip | owner | `{user_flight_id or trip_id, recipient_label, expires_at}` | `{token}` | F07 |
| PATCH /rest/v1/share_links?id=eq.{id} | revokes (`revoked_at = now()`) | owner | | | F07 |
| GET /functions/v1/public-flight?t={token} | public, read-only flight JSON: status, times, gate, position. Never booking ref, seat or notes. | anyone with a valid, unexpired, unrevoked token | | flight JSON, `Cache-Control: max-age=30` | F07 |
| GET raggan.no/fly/?t={token} | static share page: renders that JSON and refreshes every 60 s | anyone | | HTML | F07 |

### F08 history, F10 airports

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /rest/v1/my_flight_stats | totals for S17 (distance, countries and per-year are computed in the app) | owner | | row | F08 |
| GET /functions/v1/airport-status?icao= | METAR/TAF + FAA NAS status (US) turned into a short status line; 10 min cache | signed in | | `{level, summary, metar, taf, delays[]}` | F10 |
| GET /functions/v1/airport-board?icao=&dir=dep\|arr | live board from the provider; 2 min cache, counts against the budget | signed in | | rows | F10 |
| POST/DELETE /rest/v1/favorite_airports | star an airport | owner | | | F10 |

### Webhooks

- In: Postmark inbound (`/inbound-email`), Telegram (`/telegram-webhook`).
  Both check a shared secret and are idempotent on their natural IDs
  (Message-ID, Telegram `update_id`).
- Out: Telegram `sendMessage` and `editMessageText` (one message per flight
  that gets edited as the status changes, so the chat isn't spammed), ntfy
  POST, and later APNs and ActivityKit pushes.

### Jobs (`pg_cron` calling Edge Functions)

| job | schedule | does |
| --- | --- | --- |
| poll-flights | every minute | takes up to 20 flights with `next_poll_at <= now()`, fetches each from the provider, compares a payload hash, updates the flight and writes `flight_events` for real changes, updates the prediction, sets the next `next_poll_at` (tiers below), checks `provider_usage` first and stops at the budget |
| send-notifications | runs right after poll-flights (and on a DB webhook for `flight_events` inserts) | for each new event × user that follows the flight × enabled pref × channel: insert `notifications` (the unique key blocks repeats), then send |
| parse-emails | every 2 min | `inbound_emails` with status `received`: Claude extracts candidates, `search-flights` confirms each one, `add-flight`; on failure, a Telegram message asks you to add it by hand; the body is wiped |
| checkin-reminder | every 15 min | 24 h before departure (airline check-in window), sends the booking ref + airline `checkin_url` |
| morning-of | every 15 min | at 07:00 local time on a travel day, sends one summary: departure, gate if known, airport status, prediction |
| reference-refresh | monthly | re-imports OurAirports and the airlines list |
| cleanup | daily 03:00 UTC | wipes email bodies older than 7 days, thins `flight_positions` to one point per 2 min for flights landed more than 7 days ago, expires share links |

Poll tiers (decide the API bill):

| time to departure / phase | poll every |
| --- | --- |
| more than 72 h | 12 h |
| 24 to 72 h | 3 h |
| 6 to 24 h | 30 min |
| less than 6 h, until departure | 5 min |
| in the air | 10 min (5 min in the last hour) |
| landed | until arrived at the gate and belt known, then stop |

That's roughly 100 to 130 calls for a 2 h flight. The poller also follows the
inbound flight once the tail is known (6 h window), which adds about as much
again. Multiply by the per-call price on the provider's pricing page.
`provider_usage.budget_cents` caps the month. When the cap is hit, the poller
stretches the intervals instead of stopping.

## Prediction v1 (rules, no ML)

Starting 6 h before departure, in order:
1. **Inbound late.** Predicted out = inbound estimated in + the airline's
   minimum turn time for the type (default 35 min narrowbody, 60 min
   widebody). If that is more than 15 min after scheduled out, reason
   `inbound`.
2. **Weather.** A TAF for the hour of departure with thunderstorms, freezing
   precipitation, visibility under 800 m or ceiling under 200 ft, at either
   end. Reason `weather`, low confidence.
3. **Airport.** FAA ground delay or ground stop (US), or more than 30 % of
   the last hour's departures delayed by 15+ min on the board. Reason
   `congestion` or `atc`.

Show it only when confidence is 0.5 or more. Otherwise keep the card neutral,
the way byAir does. Log predicted vs actual in `predictions` so you can tune
it later.

## The parts that bite

- **Time zones.** Store UTC and show times in the airport's IANA zone, never
  the phone's. The flight's "date" is `local_departure_date` at the origin.
  An overnight flight lands "tomorrow", so show +1. Daylight saving changes
  move schedules. The check-in and morning-of jobs work in the origin's zone.
- **Flight identity.** One flight number flies several legs and repeats every
  day. Codeshares have several numbers. Always key on the provider's flight
  instance id. Ask which leg when one number has several. Store the marketing
  number you searched with, and show the operating one too.
- **Idempotency.** Webhooks arrive twice, and the poller sees the same gate
  change on every poll. That's why `flight_events.dedupe_key`, the
  `notifications` unique key and `inbound_emails.message_id` exist. Use
  `insert ... on conflict do nothing` and only send when the insert returned a
  row.
- **Races.** A manual refresh and the cron poller can fetch the same flight at
  once. Take `pg_try_advisory_xact_lock(hashtext(flight_id))` and skip the
  flight if it's taken.
- **Rate limits and cost.** The per-query billing is the real limit. Cache
  search for 10 min and boards for 2 min, use the budget table, and don't
  enrich imported history automatically.
- **Live Activity limits.** A Live Activity lasts about 8 h, then stays on
  the lock screen a while longer. Long-haul flights outlive it, so start it
  about 2 h before departure, and restart it on the next app open or by
  push-to-start (paid program). ActivityKit also throttles frequent pushes.
  Send only real changes.
- **Background updates.** Without push, iOS background refresh is
  best-effort and can lag by hours. Don't rely on it for alerts (that's
  Telegram's job until APNs).
- **Offline.** In the air without Wi-Fi, show the SwiftData cache with a
  "last updated" stamp. Never show a stale gate as live.
- **Email parsing trust.** The LLM output is only a search key. Times, gates
  and status always come from the provider. Unconfirmed parses never create
  flights silently.
- **Privacy.** Share tokens are 144-bit random, revocable and expire 24 h
  after arrival by default. The public endpoint returns no booking ref, seat,
  notes or name. Email bodies are deleted after parsing.
- **Search.** Airport search is a Postgres full-text index plus an exact
  IATA/ICAO match first. That's enough for about 80k airports.
- **GDPR.** Personal use, one data subject (you), but family Telegram chat
  IDs are personal data: `/stop` deletes them.

## Build order

1. **Vertical slice: add a flight, get pinged on Telegram** (free Apple ID)
   - Screens: S02 (plain list), S03, S04, S06 (status, times, gate, terminal only).
   - Tables: profiles, airports (seeded), airlines, flights, user_flights, flight_events, notifications, provider_usage.
   - Routes: `search-flights`, `add-flight`, `link-telegram`, `telegram-webhook`, the `poll-flights` and `send-notifications` jobs.
   - Done when: you add tomorrow's flight on your phone and get a Telegram message when its gate is assigned.
2. **Must-haves (personal)**
   - Flight card: timeline, map and live position, aircraft card, where's my plane (S06, S07, S10).
   - Alert types and settings (S23), check-in reminder, Friends list where you track others yourself (S11).
   - Share link + `raggan.no/fly` page + Telegram family subscription (S13, F07).
   - Passport-style stats + past-flights map (S17, S18).
3. **Should-haves** (buy the $99 here)
   - APNs pushes, Live Activity + Dynamic Island (S25), widgets (S26), Watch (S27).
   - Email forwarding import, on-device calendar scan, CSV import of your existing Flighty/byAir history (S20, F02, F09).
   - Prediction v1 (S08), airport status + board (S14, S15), morning-of summary, Siri shortcut.
4. **Could-haves**: connection assistant (S09), airport tips you write yourself (S16), crew-style roster import, MCP endpoint for Claude (S28), CarPlay.
5. **Fixes from replica-entrepreneur**, once it has run.
