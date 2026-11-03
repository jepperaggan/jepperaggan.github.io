# Recon map: Flighty + byAir mix (iOS first)

Scope (proposed, confirm before /replica-architect): the personal flight-tracking
core loop of both apps. That means adding flights, live status and alerts, the
inbound plane, sharing with friends and family, and a personal flight
history/stats. Airport intelligence and assistants are second wave.
Platform: iOS (iPhone, Lock Screen, Live Activities, widgets, Watch) first.
Android/Wear OS is a later option; byAir already uses it as its main pitch
against Flighty.
For: personal use (confirmed 2026-11-03), installed from Xcode onto your own
iPhone. Family get updates through a link or a Telegram bot. A product to sell
may come later.
Date: 2026-11-03

Origin tags used below: **[F]** Flighty only, **[B]** byAir only, **[F+B]** both.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | Flighty App Store (NO) | https://apps.apple.com/no/app/flighty-live-flight-tracker/id1358823008 | full Free vs Pro list, NOK prices, version history through 4.11.3 (26 Oct 2026), privacy labels |
| 2 | Flighty App Store (US) | https://apps.apple.com/us/app/flighty-live-flight-tracker/id1358823008 | 4.8 stars from 160K ratings, Editors' Choice, USD prices (from a summary, so verify) |
| 3 | Flighty help center | https://flighty.com/help | article index, about 30 articles |
| 4 | Flighty pricing | https://flighty.com/pricing | Pro $4.99/mo or $59.99/yr, "free for your first flight" |
| 5 | Flighty help: notifications | https://flighty.com/help/flighty-notifications | alert types, Pro gating |
| 6 | Flighty help: friends' flights | https://flighty.com/help/managing-friends-flights | 4 alert levels: None, Just Landed, Basics, Everything |
| 7 | Flighty help: passport | https://flighty.com/help/passport | stats fields |
| 8 | Flighty passport page | https://flighty.com/passport | plane names and ages, seats |
| 9 | Flighty help: search | https://flighty.com/help/using-search | search and manual add |
| 10 | Flighty help: email forwarding | https://flighty.com/help/email-forwarding | manual forward, "We do not scrape your inbox" |
| 11 | Flighty help: calendar import | https://flighty.com/help/calendar-import | parsed on the device, Apple Calendar only, syncs every 30 min |
| 12 | Flighty help: TripIt sync | https://flighty.com/help/tripit-sync | one-way sync, placeholders |
| 13 | Flighty help: where is my plane | https://flighty.com/help/where-is-my-plane | inbound chain, tail data |
| 14 | Flighty help: connection assistant | https://flighty.com/help/connection-assistant | checkpoints, passport-aware |
| 15 | Flighty help: airports | https://flighty.com/help/flighty-airports | airport status, METAR/TAF, delay forecast |
| 16 | Flighty help: live activities | https://flighty.com/help/live-activities-widgets | Lock Screen, widgets, friends' flights |
| 17 | Flighty help: family | https://flighty.com/help/sharing-annual-family | up to 6 members through Apple Family Sharing |
| 18 | byAir App Store (NO) | https://apps.apple.com/no/app/byair-plane-tracker-status/id6468928108 | description, NOK prices, version notes 2.36 to 2.42.5 |
| 19 | byAir App Store (US) | https://apps.apple.com/us/app/byair-plane-tracker-status/id6468928108 | 4.9 stars from 225 ratings, USD prices |
| 20 | byAir site | https://byairapp.com | marketing, nav |
| 21 | byAir FAQ | https://byairapp.com/faq/ | the most complete feature list; Free vs Pro limits |
| 22 | byAir: AI integration | https://byairapp.com/features/ai-integration/ | MCP endpoint, tool categories |
| 23 | byAir: friends' flights | https://byairapp.com/features/friends-flights/ | invite model, tab bar mockup |
| 24 | byAir: auto-scan email | https://byairapp.com/features/auto-scan-email/ | Gmail/Outlook read-only scan |
| 25 | byAir: find my plane | https://byairapp.com/features/find-my-plane/ | inbound aircraft |
| 26 | byAir: delay prediction | https://byairapp.com/features/flight-delay-prediction/ | "byAir Predict", 6 h window |
| 27 | byAir vs Flighty | https://byairapp.com/compare/flighty/ | byAir's own positioning against Flighty |

No user account was used. Everything here comes from public pages. The App Store
fetch did not return screenshot images, so `replica/screens/` is empty for now.
Add reference screenshots by hand from your own phone if you want layout diffs
later. Keep them out of the shipped app.

## Core loop

You add a flight once (search, or detected automatically). The app then tells
you about delays, gate changes and the inbound plane before the airline does,
on your Lock Screen, and keeps the people waiting for you updated.

The pitch of each app:
- **Flighty**: speed and depth. "World's fastest delay alerts", "2-90 minutes
  faster than airline apps", pilot-grade data (FAA, Eurocontrol), airport
  intelligence, a strong design. No account required.
- **byAir**: convenience and reach. Gmail/Outlook auto-scan, screenshot Quick
  Scan, Android and Wear OS, family updates over WhatsApp/Telegram for people
  without the app, an MCP link for AI assistants, airport guide and transport.
  Cheaper.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Welcome / onboarding | first launch | value pitch, permissions (notifications, calendar, location), optional sign-in | pager, permission prompts, sign-in buttons | first run, permission denied |
| S02 | My Flights (map-first home) [F+B] | tab 1 | upcoming and in-air flights over a map in a sliding panel; "Finished" section for landed flights [B] | map, bottom sheet, flight row, segmented control | empty (no flights), upcoming, in-air, finished, offline (cached) |
| S03 | Search [F+B] | Search tab [F] / "+" button [B] | find a flight by flight number, airline or route, past, present or future | search field, recent searches, result rows | empty, typing, no results, error |
| S04 | Search results / confirm add [F+B] | S03 select | pick the date or leg, then choose "My flight" or "Friend's flight" | result rows with live status, confirmation dialog | multiple legs, codeshare, past flight, limit reached (free) |
| S05 | Manual flight entry [F+B] | S04 "not found" | private, charter or defunct flights: origin, destination, date | airport picker, date picker, form | validation errors |
| S06 | Flight detail card [F+B] | tap a flight | the main screen: status, times (scheduled, estimated, actual), terminal, gate, baggage, route map, progress, timeline stages (check-in, boarding, taxi, takeoff, landing) [B], aircraft card (type, tail, age, livery, Wi-Fi/Starlink [B]), delay reason [F], booking details, notes, travel docs [B], "..." menu (delete, alerts, switch mine/friend's) | status header, time grid, badges (gate, terminal), timeline, map, aircraft card, section headers | scheduled, boarding, departed, in air, landed, delayed, cancelled, diverted, data stale |
| S07 | Where's my plane / inbound aircraft [F+B] | S06 section | the incoming plane, its previous legs (25-hour chain [F]), how a delay will propagate | chain list, mini map, aircraft facts | no tail assigned yet, inbound delayed, inbound cancelled |
| S08 | Delay prediction panel [F+B] | S06 section | predicted departure and likely reason (weather, inbound, congestion, ATC); byAir starts 6 h before | prediction card, reason chips | neutral (weak evidence), predicted delay, locked preview (free) |
| S09 | Connection assistant [F] | S06 when a connecting leg exists | checkpoints for the connection (passport control, security, e-gates), typical time, gate prediction | checkpoint list, timer, risk badge | comfortable, tight, at risk, missed |
| S10 | Live flight map [F+B] | S06 map tap | live position, flown and planned route, ground radar while taxiing [F], proximity radar (nearby flights) [F] | full-screen map, plane marker, altitude and speed readout | ground, airborne, position lag (byAir says 5 to 10 min) |
| S11 | Friends tab [F+B] | tab 2 | friends' flights, auto-removed after arrival [F] | flight rows, friend avatars, section per friend | empty, has flights, invite prompt |
| S12 | Add friend / invite [F+B] | S11 "Add a friend" | link or QR invite, accept with "Connect"; links work 5 times [B] | share sheet, QR code, invite card | invite pending, accepted, expired |
| S13 | Share flight sheet [F+B] | S06 share | share a single flight as a link or image; set up family updates over WhatsApp/Telegram for people without the app [B] | share sheet, contact picker, channel picker | no app on the receiving side, sent |
| S14 | Airports tab / airport intelligence [F+B] | tab [B] / control tower icon [F] | airport status in plain words, disruptions, METAR/TAF weather reasons, delay trend forecast [F], favourites | status map, disruption list, trend chart, favourite star | normal, disrupted, meltdown forecast |
| S15 | Airport board [F+B] | S14 | live departures and arrivals, refreshed every minute | board rows, departures/arrivals toggle, filters | loading, filled, error |
| S16 | Airport guide [B] | S14 | traveller tips (security, food, lounges), terminal maps, taxi and public transport, check-in links for 100+ airlines | tip cards, map, transport list, links | no tips yet |
| S17 | Passport / stats [F+B] | tab 3 [F] / Profile [B] | distance, hours in the air, airports, countries, aircraft types, tail numbers, routes, hours delayed, worst delay, seats; all-time and per year | stat tiles, rankings, year picker | empty, first flight, many flights (1,000+ is the perf target) |
| S18 | Past flights map / heat map [F] | S17 | every flight drawn on a globe or 2D map, heat map | map, filter by year | empty, filled |
| S19 | Shareable travel card [F+B] | S17 share | year-in-review card, "byAir ID" with Apple Wallet pass [B] | card render, export to image, Wallet pass | generated |
| S20 | Import hub [F+B] | Settings > Import & Sync | email forwarding [F+B], Gmail/Outlook auto-scan [B], calendar sync [F+B], TripIt sync [F], CSV import from other apps [F+B], screenshot or PDF Quick Scan [B] | source list, connection status, progress | not connected, connected, importing, parse failed, free limit |
| S21 | Edit flight [F+B] | S06 bottom | correct seat, class, travel reason (Personal/Business/Crew), notes, booking reference | form | saved, restricted fields |
| S22 | Profile / settings [F+B] | avatar [F] / Profile tab [B] | home airport, units, currency, travel preferences (skip check-in/boarding timeline stages [B]), passport nationality [F], app icon [F] | settings list | signed out, signed in |
| S23 | Alert settings [F+B] | S22 > Alerts | per-type toggles for own flights, global level for friends' flights (None, Just Landed, Basics, Everything), per-flight override | toggle list, level picker | default, custom |
| S24 | Paywall / Pro [F+B] | locked feature, S22 | plans (weekly, monthly, annual, lifetime, family), trial ("free first flight" [F]) | plan cards, feature list, restore purchases | trial, active, expired, family member |
| S25 | Live Activity + Dynamic Island [F+B] | system, starts automatically before departure | countdown, gate badge, in-flight progress arc, check-in and boarding stages | compact, expanded, Lock Screen | pre-departure, boarding, in air, landed, delayed |
| S26 | Home and Lock Screen widgets [F+B] | system | next flight, a friend's flight, stats widget [B] | small, medium, Lock Screen sizes | no flights, upcoming, in air |
| S27 | Apple Watch app + complications [F+B] | watch | glanceable status, friends' flights and layovers [B] | list, detail, complication | same as S25 |
| S28 | AI integration (MCP) [B] | S22 > Automations | connect AI assistants, list active connections, revoke | connection list, copy link, revoke button | none, connected, revoked |
| S29 | Crew mode [F+B] | S22 | roster import from crew calendars (AIMS eCrew, FLICA and others), crew stats | toggle, calendar picker | off, on |

Not seen but implied: a public web page that opens when someone without the
app taps a shared flight link. Neither source confirms one exists. It is a
cheap way to beat both apps, see the notes in `features.csv`.

## Flows

```
F01 Add my upcoming flight by search
    S02 -> S03 -> S04 (confirm "My flight") -> S06
    happy path clicks: 4 (tap +, type flight number, tap result, confirm)
    edge: codeshare number, same flight number on two legs, overnight date,
          flight not yet in schedule, free plan limit, offline

F02 Flight gets added automatically (no typing)
    S20 connect email / calendar once -> booking arrives -> flight appears in S02 -> push "Flight added"
    happy path clicks: 0 after setup (setup is about 4)
    edge: parse failure (send a notification and fall back to S03), duplicate from two
          sources, a cancelled booking email, crew roster events, a placeholder flight not matched yet [F]

F03 Get alerted about a delay before the airline
    background: inbound plane late / prediction fires -> push -> S25 Live Activity updates -> tap -> S06 / S08
    happy path clicks: 0 to see it, 1 to open it
    edge: prediction reverses, delay then cancellation, diversion, gate change at the last
          minute, missed connection (S09), push permission denied

F04 Day of travel
    morning-of summary push [F] -> check-in reminder with booking ref and link [F+B]
    -> S25 counts down -> gate assigned -> boarding -> taxi -> in air (S10) -> landed -> baggage belt
    happy path clicks: 0 (all pushes and Live Activity)
    edge: no gate yet, gate predicted [F], terminal change, offline in the air (cached S06)

F05 Make a connection
    S06 (leg 1 landed) -> S09 checkpoints + time -> leg 2 gate
    edge: tight connection, inbound late, terminal change, different passport rules

F06 Invite a friend and follow each other
    S11 -> S12 (link or QR) -> friend taps "Connect" -> friend's flights appear in S11 -> alerts per S23 level
    happy path clicks: 3 for the sender, 2 for the friend
    edge: friend has no app (go to F07), link used up, revoke sharing, privacy (hide booking details)

F07 Keep family without the app updated
    S06 -> S13 -> choose WhatsApp/Telegram contact or a web link -> they get updates on their own
    happy path clicks: 3
    edge: recipient opts out, flight changes after share, several legs in one trip

F08 Look back at my travel
    S17 -> S18 -> S19 share card
    happy path clicks: 2
    edge: imported history with gaps, manual flights without times, 1,000+ flights

F09 Import history from another app
    S20 -> pick source (Flighty CSV, myFlightradar24, App in the Air, OpenFlights, TripIt) -> upload -> review -> S17 updates
    happy path clicks: about 4
    edge: unknown format, duplicates, unmatched airports, partial import

F10 Check my departure airport
    S06 airport link or S14 -> status, delay trend -> S15 board -> S16 tips and transport
    happy path clicks: 2
    edge: no data for a small airport, disruption in progress

F11 Upgrade to Pro
    locked feature (S08, S09, S20) -> S24 -> Apple purchase -> feature unlocks
    happy path clicks: 2
    edge: family plan member restores, trial on first flight, refund, region mismatch for Family Sharing

F12 Ask an AI assistant about my flights [B]
    S28 -> connect via OAuth -> the assistant lists trips, status, stats
    edge: revoke, Pro expired (tool calls rejected)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Flight row | mine, friend's, past, compact | scheduled, delayed, cancelled, in air, landed | S02, S04, S11, S15 |
| Status pill | on time, delayed, cancelled, diverted, landed, boarding | default, pulsing (live) | S02, S06, S25, S26 |
| Time grid | departure, arrival | scheduled, estimated, actual, struck-through when changed | S06, S25 |
| Gate / terminal / belt badge | gate, terminal, baggage, predicted gate | assigned, predicted, changed (highlight) | S06, S25, S09 |
| Timeline | check-in, boarding, taxi out, takeoff, landing, taxi in, baggage | upcoming, active, done, skipped | S06 |
| Map | home (sliding panel), flight route, live, heat map | loading, offline, lagging | S02, S06, S10, S18 |
| Bottom sheet | peek, half, full | dragging | S02, S10, S14 |
| Aircraft card | type, tail, age, livery, Wi-Fi | tail unknown, assigned | S06, S07 |
| Prediction card | delay, on time, neutral, locked | loading | S06, S08 |
| Inbound chain | 25-hour list | on time, late, cancelled | S07 |
| Stat tile | number, ranking, chart | empty, filled | S17, S19 |
| Airport status block | normal, minor, major disruption | | S14 |
| Board row | departure, arrival | | S15 |
| Search field | flight number, route, airport | empty, typing, results, error | S03, S05 |
| Share card | flight, year, travel ID | rendering, ready | S13, S19 |
| Plan card | weekly, monthly, annual, lifetime, family | selected, recommended | S24 |
| Toggle list row | toggle, level picker, nav row | on, off, disabled (Pro) | S22, S23 |
| Toast / in-app banner | success, warning, error | | all |
| Empty state | no flights, no friends, no stats | with call to action | S02, S11, S17 |
| Live Activity | compact, minimal, expanded, Lock Screen | per flight phase | S25 |
| Widget | small, medium, Lock Screen | | S26 |

## Inferred data model

```
User          id, auth_provider (apple | google | email | anonymous), display_name, avatar,
              home_airport_id, units, currency, nationality, travel_style, plan, created_at
              evidence: S22, byAir FAQ "Settings", Flighty "no account required" (anonymous + iCloud)
              confidence: high (fields), medium (anonymous mode)

Airport       id, iata, icao, name, city, country, lat, lon, timezone, terminals (json)
              evidence: S03, S14, S15, Passport "countries"
              confidence: high

Airline       id, iata, icao, name, checkin_url, logo_ref
              evidence: one-tap check-in, S06
              confidence: high

Aircraft      id, tail_number, type_code, type_name, first_flight_date, age, name,
              livery_ref, wifi (none | wifi | starlink)
              evidence: Flighty "tail number with birthday, type, and even name", byAir Wi-Fi card
              confidence: high

Flight        id (provider id), airline_id, flight_number, operating_carrier, codeshares[],
              origin_id, destination_id, scheduled_out, scheduled_in, estimated_out, estimated_in,
              actual_out, actual_off, actual_on, actual_in, status
              (scheduled | boarding | departed | airborne | landed | cancelled | diverted),
              dep_terminal, dep_gate, arr_terminal, arr_gate, baggage_belt, aircraft_id,
              inbound_flight_id, delay_reason, flight_plan_route, updated_at
              evidence: S06 fields, "taxi times", "cancellation or diversion", where's my plane
              confidence: high. This is shared between users: one row per real flight.

UserFlight    id, user_id, flight_id (nullable for manual), role (mine | friend),
              seat, cabin_class, reason (personal | business | crew), booking_ref,
              notes, alert_level, source (search | email | calendar | tripit | import | scan | manual),
              trip_id, created_at
              evidence: S21 edit flight, Flighty "switch My/Friend's Flight", import sources
              confidence: high

ManualFlight  id, user_id, origin_id, destination_id, date, times (nullable), aircraft_type
              evidence: S05
              confidence: high (could be UserFlight with flight_id null)

Trip          id, user_id, name, purpose
              evidence: byAir MCP "merge or split trips, update trip purpose"
              confidence: medium

Position      flight_id, ts, lat, lon, altitude, ground_speed, heading
              evidence: S10, "speed and altitude indicator"
              confidence: high (store only the track for flights users follow)

Prediction    id, flight_id, predicted_out, reason (inbound | weather | congestion | atc),
              confidence, created_at, superseded_at
              evidence: S08, byAir Predict page
              confidence: medium

Notification  id, user_id, flight_id, type (delay | gate_change | cancel | divert | boarding |
              takeoff | landing | belt | checkin_reminder | inbound | prediction | airport),
              payload, sent_at
              evidence: Flighty notifications article, S23
              confidence: high

AlertPrefs    user_id, type, enabled; friends_level (none | just_landed | basics | everything)
              evidence: S23, managing-friends-flights
              confidence: high

Friendship    id, user_a, user_b, share_flights (bool), share_stats (bool), created_at
              evidence: byAir "Share My Flights", "Share flight stats"
              confidence: high

Invite        id, inviter_id, token, uses_left (5), expires_at
              evidence: byAir "a link can be used up to 5 times"
              confidence: high

ShareLink     id, user_flight_id or trip_id, channel (link | whatsapp | telegram | image),
              recipient (nullable), token, revoked_at
              evidence: S13, Share with Family
              confidence: medium

ImportSource  id, user_id, kind (gmail | outlook | forward | calendar | tripit | csv | scan),
              status, last_sync_at, purpose (business | leisure | crew), oauth_ref
              evidence: S20, byAir auto-scan page
              confidence: high

TravelDoc     id, user_flight_id, file_ref, kind
              evidence: byAir "Travel Docs"
              confidence: medium

AirportTip    id, airport_id, author_id, category, body, votes
              evidence: byAir "tips verified by travelers"
              confidence: guess (moderation model unknown)

FavoriteAirport  user_id, airport_id, alerts (bool)
              evidence: Flighty star, airport alerts
              confidence: high

Subscription  user_id, product (weekly | monthly | annual | lifetime | family), status,
              original_transaction_id, expires_at, family_shared (bool)
              evidence: S24, IAP list
              confidence: high

AiConnection  id, user_id, client_name, oauth_token_ref, created_at, revoked_at
              evidence: S28
              confidence: high
```

Relationships: User 1-n UserFlight; Flight 1-n UserFlight; Flight n-1 Aircraft;
Flight 1-1 inbound Flight; Flight 1-n Position; Flight 1-n Prediction;
User n-n User through Friendship; User 1-n Invite; UserFlight 1-n ShareLink;
User 1-n ImportSource; Trip 1-n UserFlight; Airport 1-n AirportTip;
User 1-n Subscription; User 1-n AiConnection.

## Feature matrix

See `features.csv`. Must: 18, should: 21, could: 16, skip: 12 (re-prioritised
for personal use; see `architecture.md`).

## Out of scope (cannot or should not be cloned)

- **Flighty's and byAir's data contracts.** Flighty's "pilot-grade" FAA and
  Eurocontrol feeds and byAir's "five aviation providers" are commercial deals.
  You buy your own flight data. Realistic options: FlightAware AeroAPI, Cirium,
  OAG, AeroDataBox, plus the free FAA SWIM feeds (US only, with an
  application). This is the largest running cost and decides how fast your
  alerts can be.
- **Their prediction models and training data.** byAir says it trained on
  10M+ flight records. You can build a simple inbound-aircraft and weather
  rule set first and add ML later.
- **The community content.** byAir's traveller-verified airport tips and its
  user base. You start with zero tips.
- **Brand assets.** Airline logos and aircraft liveries are airline
  trademarks. Use a licensed logo API or plain IATA codes. Do not reuse either
  app's icon styles, "Passport", "byAir ID", "byAir Predict" names, colours or
  copy.
- **Awards and press.** Apple Design Award, Editors' Choice and the WSJ quote
  are not features.
- **Apple Family Sharing economics** and App Store featuring. You can copy the
  plan structure, not the placement.

## Size

Screens 29, flows 12, entities 20.

Hard parts:
1. **Flight data supply.** Cost per lookup, coverage outside the US,
   latency. You need a server that polls or receives a push feed, finds what
   changed, and fans it out to users.
2. **Realtime alert pipeline.** Change detection, then APNs pushes and
   Live Activity push updates, with deduplication. Speed is Flighty's whole
   pitch, so this is where a clone wins or loses.
3. **Automatic import.** Parsing airline emails (forwarding first, Gmail
   scan later; Gmail needs Google's CASA security assessment), on-device
   calendar parsing, and screenshot OCR.
4. Delay prediction (start rule-based).
5. Friends sync and privacy rules.
6. Live Activities, widgets and the Watch app.

Size for the full mix: **XL, so rescope.** A sellable MVP is **L (a quarter)**.
That MVP is F01, F03, F04, F06, F07 and F08, plus email forwarding and a web
share page. Leave airport intelligence, connection assistant, MCP, Watch and
Android for after launch.
