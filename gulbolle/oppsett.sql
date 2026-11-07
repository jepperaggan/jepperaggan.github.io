-- Gul bolle: kjør én gang i Supabase → SQL Editor
create table if not exists public.gulbolle_rom (
  kode     text primary key check (kode ~ '^[A-Z0-9]{4,6}$'),
  state    jsonb not null,
  versjon  int not null default 0,
  laget    timestamptz not null default now()
);

create table if not exists public.gulbolle_lapper (
  id     uuid primary key default gen_random_uuid(),
  rom    text not null references public.gulbolle_rom(kode) on delete cascade,
  parti  int not null default 1,
  tekst  text not null check (char_length(tekst) between 1 and 80),
  laget  timestamptz not null default now()
);
create index if not exists gulbolle_lapper_rom_idx on public.gulbolle_lapper (rom, parti);

alter table public.gulbolle_rom    enable row level security;
alter table public.gulbolle_lapper enable row level security;

-- Ingen innlogging i spillet, så kun anon trenger tilgang (ingen sletting)
grant select, insert, update on public.gulbolle_rom    to anon;
grant select, insert         on public.gulbolle_lapper to anon;

drop policy if exists gulbolle_rom_les    on public.gulbolle_rom;
drop policy if exists gulbolle_rom_ny     on public.gulbolle_rom;
drop policy if exists gulbolle_rom_endre  on public.gulbolle_rom;
drop policy if exists gulbolle_lapp_les   on public.gulbolle_lapper;
drop policy if exists gulbolle_lapp_ny    on public.gulbolle_lapper;
create policy gulbolle_rom_les   on public.gulbolle_rom    for select to anon using (true);
create policy gulbolle_rom_ny    on public.gulbolle_rom    for insert to anon with check (true);
create policy gulbolle_rom_endre on public.gulbolle_rom    for update to anon using (true) with check (true);
create policy gulbolle_lapp_les  on public.gulbolle_lapper for select to anon using (true);
create policy gulbolle_lapp_ny   on public.gulbolle_lapper for insert to anon with check (true);
