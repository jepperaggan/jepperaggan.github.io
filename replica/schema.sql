-- Flight tracker (personal build): first migration
-- Target: Supabase Postgres. Access rules: row level security (RLS) on every
-- table. Reference data (airports, airlines, aircraft, flights, positions) is
-- written only by the service role from Edge Functions and the poller, and is
-- readable by any signed-in user. Everything a person owns carries user_id.
-- All times are timestamptz in UTC. Display uses airports.timezone.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- helper: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  home_airport_id uuid,                       -- fk added after airports
  units text not null default 'metric' check (units in ('metric','imperial')),
  nationality text,                           -- ISO 3166 alpha-2, for connection rules later
  telegram_chat_id bigint unique,             -- alerts channel while there is no APNs
  ntfy_topic text unique,                     -- alternative alerts channel
  import_address text unique                  -- local part of the forwarding address
    default encode(gen_random_bytes(9), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- create the profile row when someone signs up
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- reference data
-- ---------------------------------------------------------------------------
create table airports (
  id uuid primary key default gen_random_uuid(),
  icao text unique,
  iata text,
  name text not null,
  city text,
  country text not null,                      -- ISO 3166 alpha-2
  lat double precision not null,
  lon double precision not null,
  timezone text not null,                     -- IANA, e.g. Europe/Oslo
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on airports (iata);
create index airports_search on airports using gin (to_tsvector('simple', name || ' ' || coalesce(city,'')));
create trigger airports_updated before update on airports
  for each row execute function set_updated_at();

alter table profiles add constraint profiles_home_airport_fk
  foreign key (home_airport_id) references airports(id) on delete set null;
create index on profiles (home_airport_id);

create table airlines (
  id uuid primary key default gen_random_uuid(),
  icao text unique,
  iata text,
  name text not null,
  checkin_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on airlines (iata);
create trigger airlines_updated before update on airlines
  for each row execute function set_updated_at();

create table aircraft (
  id uuid primary key default gen_random_uuid(),
  registration text not null unique,          -- tail number, e.g. LN-RKO
  type_code text,                             -- ICAO type, e.g. A20N
  type_name text,
  first_flight_date date,
  wifi text check (wifi in ('none','wifi','starlink')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger aircraft_updated before update on aircraft
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- flights: one row per real flight instance (shared by everyone tracking it),
-- or one row per manual flight (private to its creator)
-- ---------------------------------------------------------------------------
create table flights (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'provider' check (source in ('provider','manual')),
  provider text,                              -- 'aeroapi' | 'aerodatabox'
  provider_flight_id text,                    -- e.g. AeroAPI fa_flight_id
  created_by uuid references auth.users(id) on delete cascade,   -- manual only
  airline_id uuid references airlines(id) on delete set null,
  flight_number text,                         -- marketing ident as searched, e.g. SK4035
  operating_ident text,
  codeshares text[] not null default '{}',
  origin_id uuid not null references airports(id) on delete restrict,
  destination_id uuid not null references airports(id) on delete restrict,
  diverted_to_id uuid references airports(id) on delete restrict,
  local_departure_date date not null,         -- the date printed on the ticket
  scheduled_out timestamptz,
  scheduled_in timestamptz,
  estimated_out timestamptz,
  estimated_in timestamptz,
  actual_out timestamptz,
  actual_off timestamptz,
  actual_on timestamptz,
  actual_in timestamptz,
  status text not null default 'scheduled' check (status in
    ('scheduled','boarding','departed','airborne','landed','arrived','cancelled','diverted','unknown')),
  dep_terminal text, dep_gate text,
  arr_terminal text, arr_gate text,
  baggage_belt text,
  aircraft_id uuid references aircraft(id) on delete set null,
  inbound_flight_id uuid references flights(id) on delete set null,
  delay_reason text,
  route_text text,                            -- filed flight plan route
  -- poller bookkeeping
  next_poll_at timestamptz,
  last_polled_at timestamptz,
  poll_etag text,                             -- hash of last provider payload, to detect change
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_fields check (
    (source = 'provider' and provider is not null and provider_flight_id is not null and created_by is null)
    or (source = 'manual' and created_by is not null)
  )
);
create unique index flights_provider_uq on flights (provider, provider_flight_id) where source = 'provider';
create index on flights (airline_id);
create index on flights (origin_id);
create index on flights (destination_id);
create index on flights (aircraft_id);
create index on flights (inbound_flight_id);
create index on flights (created_by);
create index on flights (flight_number, local_departure_date);
create index flights_due on flights (next_poll_at) where next_poll_at is not null;
create trigger flights_updated before update on flights
  for each row execute function set_updated_at();

-- recorded track, only for flights someone follows
create table flight_positions (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null references flights(id) on delete cascade,
  ts timestamptz not null,
  lat double precision not null,
  lon double precision not null,
  altitude_ft integer,
  ground_speed_kt integer,
  heading smallint,
  created_at timestamptz not null default now(),
  unique (flight_id, ts)
);
create index on flight_positions (flight_id, ts);

-- every change the poller saw, for "what changed" and for idempotent alerts
create table flight_events (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null references flights(id) on delete cascade,
  kind text not null check (kind in
    ('delay','gate_change','terminal_change','cancelled','diverted','boarding',
     'departed','takeoff','landing','arrived','belt','aircraft_change','inbound_late','prediction')),
  old_value text,
  new_value text,
  dedupe_key text not null,                   -- e.g. 'gate_change:B12'; same change seen twice = same key
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (flight_id, dedupe_key)
);
create index on flight_events (flight_id, occurred_at);

create table predictions (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null references flights(id) on delete cascade,
  predicted_out timestamptz not null,
  reason text not null check (reason in ('inbound','weather','congestion','atc','unknown')),
  confidence real not null check (confidence between 0 and 1),
  explanation text,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);
create index on predictions (flight_id, created_at desc);

-- ---------------------------------------------------------------------------
-- what a person owns
-- ---------------------------------------------------------------------------
create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  purpose text not null default 'personal' check (purpose in ('personal','business','crew')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on trips (user_id);
create trigger trips_updated before update on trips
  for each row execute function set_updated_at();

create table user_flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flight_id uuid not null references flights(id) on delete restrict,
  trip_id uuid references trips(id) on delete set null,
  role text not null default 'mine' check (role in ('mine','friend')),
  friend_name text,                           -- whose flight, when role = 'friend'
  seat text,
  cabin_class text check (cabin_class in ('economy','premium','business','first','private')),
  reason text check (reason in ('personal','business','crew')),
  booking_ref text,
  notes text,
  alert_level text not null default 'default'
    check (alert_level in ('default','none','just_landed','basics','everything')),
  source text not null default 'search'
    check (source in ('search','email','calendar','csv','scan','manual')),
  live_activity_token text,                   -- ActivityKit push token, once APNs is available
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, flight_id)
);
create index on user_flights (flight_id);
create index on user_flights (trip_id);
create index on user_flights (user_id, role);
create trigger user_flights_updated before update on user_flights
  for each row execute function set_updated_at();

create table alert_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                         -- same values as flight_events.kind, plus 'checkin_reminder','morning_of'
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);
create trigger alert_prefs_updated before update on alert_prefs
  for each row execute function set_updated_at();

-- one row per message actually sent: makes sending idempotent
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_flight_id uuid references user_flights(id) on delete cascade,
  flight_event_id uuid references flight_events(id) on delete cascade,
  channel text not null check (channel in ('apns','live_activity','telegram','ntfy')),
  title text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, flight_event_id, channel)
);
create index on notifications (user_flight_id);
create index on notifications (flight_event_id);
create index on notifications (status, created_at) where status = 'queued';

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  apns_token text unique,
  environment text not null default 'development' check (environment in ('development','production')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on devices (user_id);
create trigger devices_updated before update on devices
  for each row execute function set_updated_at();

create table share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_flight_id uuid references user_flights(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  channel text not null default 'link' check (channel in ('link','telegram')),
  recipient_label text,                       -- "Mamma", for your own reference
  telegram_chat_id bigint,                    -- recipient chat, when channel = 'telegram'
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint share_target check ((user_flight_id is null) <> (trip_id is null))
);
create index on share_links (user_id);
create index on share_links (user_flight_id);
create index on share_links (trip_id);

create table favorite_airports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  airport_id uuid not null references airports(id) on delete cascade,
  alerts boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, airport_id)
);
create index on favorite_airports (airport_id);

-- forwarded booking emails, kept only until parsed
create table inbound_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,                   -- RFC 5322 Message-ID, for idempotency
  subject text,
  body_text text,                             -- wiped after parsing
  status text not null default 'received'
    check (status in ('received','parsed','failed','ignored')),
  parsed jsonb,                               -- [{flight_number, date, origin, destination, booking_ref}]
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, message_id)
);
create index on inbound_emails (status, created_at);
create trigger inbound_emails_updated before update on inbound_emails
  for each row execute function set_updated_at();

-- provider spend guard: the poller refuses to call past the monthly budget
create table provider_usage (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  month date not null,                        -- first day of the month
  calls integer not null default 0,
  cost_cents integer not null default 0,
  budget_cents integer not null default 500,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, month)
);
create trigger provider_usage_updated before update on provider_usage
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
alter table profiles          enable row level security;
alter table airports          enable row level security;
alter table airlines          enable row level security;
alter table aircraft          enable row level security;
alter table flights           enable row level security;
alter table flight_positions  enable row level security;
alter table flight_events     enable row level security;
alter table predictions       enable row level security;
alter table trips             enable row level security;
alter table user_flights      enable row level security;
alter table alert_prefs       enable row level security;
alter table notifications     enable row level security;
alter table devices           enable row level security;
alter table share_links       enable row level security;
alter table favorite_airports enable row level security;
alter table inbound_emails    enable row level security;
alter table provider_usage    enable row level security;   -- no policies: service role only

-- own profile
create policy profiles_self_read   on profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- reference data: read for signed-in users, writes only by service role (no policy)
create policy airports_read on airports for select to authenticated using (true);
create policy airlines_read on airlines for select to authenticated using (true);
create policy aircraft_read on aircraft for select to authenticated using (true);

-- flights: provider flights are shared; manual flights only for their creator
create policy flights_read on flights for select to authenticated
  using (source = 'provider' or created_by = auth.uid());
create policy flights_manual_insert on flights for insert to authenticated
  with check (source = 'manual' and created_by = auth.uid());
create policy flights_manual_update on flights for update to authenticated
  using (source = 'manual' and created_by = auth.uid())
  with check (source = 'manual' and created_by = auth.uid());
create policy flights_manual_delete on flights for delete to authenticated
  using (source = 'manual' and created_by = auth.uid());

create policy positions_read   on flight_positions for select to authenticated using (true);
create policy events_read      on flight_events    for select to authenticated using (true);
create policy predictions_read on predictions      for select to authenticated using (true);

-- owned tables: full access to your own rows
create policy trips_own        on trips             for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_flights_own on user_flights      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy alert_prefs_own  on alert_prefs       for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy devices_own      on devices           for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy share_links_own  on share_links       for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favorites_own    on favorite_airports for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- read-only for the owner; written by functions
create policy notifications_read on notifications  for select to authenticated using (user_id = auth.uid());
create policy inbound_read       on inbound_emails for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- stats view for Passport-style screen (S17); security_invoker keeps RLS
-- ---------------------------------------------------------------------------
create view my_flight_stats with (security_invoker = true) as
select
  uf.user_id,
  count(*)                                                            as flights,
  count(distinct f.aircraft_id)                                       as unique_tails,
  sum(extract(epoch from (coalesce(f.actual_on, f.scheduled_in) - coalesce(f.actual_off, f.scheduled_out))) / 3600.0)
                                                                      as hours_in_air,
  sum(greatest(0, extract(epoch from (f.actual_out - f.scheduled_out)) / 3600.0))
                                                                      as hours_delayed
from user_flights uf
join flights f on f.id = uf.flight_id
where uf.role = 'mine' and f.status in ('landed','arrived')
group by uf.user_id;
-- distance, countries and per-year breakdowns are computed in the app from
-- airport coordinates; move them here when the list gets slow.
