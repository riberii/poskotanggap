-- POSKOTANGGAP — skema awal (Fase 2)
-- Prototipe hackathon, bukan production-ready.
-- Jalankan dengan: supabase db push  (atau tempel di SQL Editor Supabase)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Operator: hanya user Supabase Auth yang terdaftar di sini boleh mengakses
-- data operasional. Ditambahkan manual oleh admin lewat SQL Editor.
-- ---------------------------------------------------------------------------
create table public.operators (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  created_at  timestamptz not null default now()
);

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.operators where user_id = auth.uid());
$$;

revoke all on function public.is_operator() from public, anon;
grant execute on function public.is_operator() to authenticated;

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  raw_text        text not null check (char_length(raw_text) between 5 and 5000),
  submitted_at    timestamptz not null default now(),
  incident_type   text check (incident_type in
                    ('banjir','tanah_longsor','gempa_bumi','kebakaran','angin_kencang','lainnya')),
  location_text   text check (location_text is null or char_length(location_text) <= 200),
  normalized_area text check (normalized_area is null or char_length(normalized_area) <= 200),
  status          text not null default 'pending_review'
                    check (status in ('pending_review','verified','rejected')),
  fingerprint     char(64) not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  duplicate_of    uuid references public.reports (id) on delete set null,
  extraction_json jsonb,
  created_at      timestamptz not null default now(),
  verified_at     timestamptz,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  -- Laporan terverifikasi wajib punya waktu verifikasi, jenis kejadian, dan lokasi.
  constraint reports_verified_consistency check (
    (status = 'verified' and verified_at is not null
       and incident_type is not null and normalized_area is not null)
    or (status <> 'verified' and verified_at is null)
  ),
  constraint reports_not_self_duplicate check (duplicate_of is null or duplicate_of <> id)
);

-- A. Duplikat persis: satu fingerprint hanya boleh tercatat sekali.
create unique index reports_fingerprint_key on public.reports (fingerprint);
-- B. Pencarian potensi duplikat (area + jenis kejadian).
create index reports_area_type_idx on public.reports (normalized_area, incident_type)
  where status <> 'rejected';
create index reports_status_submitted_idx on public.reports (status, submitted_at desc);
create index reports_duplicate_of_idx on public.reports (duplicate_of);

-- ---------------------------------------------------------------------------
-- report_needs
-- ---------------------------------------------------------------------------
create table public.report_needs (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.reports (id) on delete cascade,
  item           text not null check (char_length(item) between 1 and 80),
  quantity       numeric(12,2) check (quantity is null or (quantity > 0 and quantity <= 1000000)),
  unit           text check (unit is null or unit in
                   ('dus','botol','liter','kg','karung','paket','lembar','unit','buah')),
  quantity_basis text not null default 'unknown'
                   check (quantity_basis in ('additional','total','unknown')),
  evidence_quote text check (evidence_quote is null or char_length(evidence_quote) <= 500),
  verified       boolean not null default false,
  constraint report_needs_quantity_requires_unit check (quantity is null or unit is not null)
);

create index report_needs_report_id_idx on public.report_needs (report_id);
create index report_needs_agg_idx on public.report_needs (item, unit)
  where verified and quantity_basis = 'additional';

-- ---------------------------------------------------------------------------
-- inventory
-- ---------------------------------------------------------------------------
create table public.inventory (
  id                 uuid primary key default gen_random_uuid(),
  item               text not null check (char_length(item) between 1 and 80),
  area               text not null check (char_length(area) between 1 and 200),
  unit               text not null check (unit in
                       ('dus','botol','liter','kg','karung','paket','lembar','unit','buah')),
  available_quantity numeric(14,2) not null check (available_quantity >= 0),
  updated_at         timestamptz not null default now(),
  constraint inventory_area_item_unit_key unique (area, item, unit)
);

-- ---------------------------------------------------------------------------
-- Row Level Security: hanya operator terautentikasi. Tidak ada akses anon.
-- Tidak ada policy DELETE pada reports (laporan tidak pernah dihapus,
-- termasuk yang diduga duplikat — gunakan status 'rejected').
-- ---------------------------------------------------------------------------
alter table public.operators    enable row level security;
alter table public.reports      enable row level security;
alter table public.report_needs enable row level security;
alter table public.inventory    enable row level security;

revoke all on public.operators, public.reports, public.report_needs, public.inventory from anon;

create policy operators_select_self on public.operators
  for select to authenticated using (user_id = auth.uid());

create policy reports_select on public.reports
  for select to authenticated using (public.is_operator());
create policy reports_insert on public.reports
  for insert to authenticated with check (public.is_operator());
create policy reports_update on public.reports
  for update to authenticated using (public.is_operator()) with check (public.is_operator());

create policy report_needs_select on public.report_needs
  for select to authenticated using (public.is_operator());
create policy report_needs_insert on public.report_needs
  for insert to authenticated with check (public.is_operator());
create policy report_needs_update on public.report_needs
  for update to authenticated using (public.is_operator()) with check (public.is_operator());
-- Diperlukan saat operator mengganti daftar kebutuhan ketika review.
create policy report_needs_delete on public.report_needs
  for delete to authenticated using (public.is_operator());

create policy inventory_select on public.inventory
  for select to authenticated using (public.is_operator());
create policy inventory_insert on public.inventory
  for insert to authenticated with check (public.is_operator());
create policy inventory_update on public.inventory
  for update to authenticated using (public.is_operator()) with check (public.is_operator());

-- ---------------------------------------------------------------------------
-- Fungsi transaksional (SECURITY INVOKER: RLS tetap berlaku untuk pemanggil).
-- ---------------------------------------------------------------------------
create or replace function public.create_report_with_needs(p_report jsonb, p_needs jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_operator() then
    raise exception 'not an operator' using errcode = '42501';
  end if;

  insert into public.reports (
    raw_text, submitted_at, incident_type, location_text, normalized_area,
    status, fingerprint, duplicate_of, extraction_json, verified_at
  ) values (
    p_report->>'raw_text',
    coalesce((p_report->>'submitted_at')::timestamptz, now()),
    p_report->>'incident_type',
    p_report->>'location_text',
    p_report->>'normalized_area',
    coalesce(p_report->>'status', 'pending_review'),
    p_report->>'fingerprint',
    (p_report->>'duplicate_of')::uuid,
    p_report->'extraction_json',
    (p_report->>'verified_at')::timestamptz
  ) returning id into v_id;

  insert into public.report_needs (report_id, item, quantity, unit, quantity_basis, evidence_quote, verified)
  select v_id, n->>'item', (n->>'quantity')::numeric, n->>'unit',
         coalesce(n->>'quantity_basis', 'unknown'), n->>'evidence_quote',
         coalesce((n->>'verified')::boolean, false)
  from jsonb_array_elements(coalesce(p_needs, '[]'::jsonb)) as n;

  return v_id;
end;
$$;

create or replace function public.update_report_with_needs(p_id uuid, p_report jsonb, p_needs jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_operator() then
    raise exception 'not an operator' using errcode = '42501';
  end if;

  update public.reports set
    incident_type   = p_report->>'incident_type',
    location_text   = p_report->>'location_text',
    normalized_area = p_report->>'normalized_area',
    status          = p_report->>'status',
    duplicate_of    = (p_report->>'duplicate_of')::uuid,
    verified_at     = (p_report->>'verified_at')::timestamptz
  where id = p_id and status <> 'rejected';

  if not found then
    raise exception 'report not found or not editable' using errcode = 'P0002';
  end if;

  delete from public.report_needs where report_id = p_id;

  insert into public.report_needs (report_id, item, quantity, unit, quantity_basis, evidence_quote, verified)
  select p_id, n->>'item', (n->>'quantity')::numeric, n->>'unit',
         coalesce(n->>'quantity_basis', 'unknown'), n->>'evidence_quote',
         coalesce((n->>'verified')::boolean, false)
  from jsonb_array_elements(coalesce(p_needs, '[]'::jsonb)) as n;
end;
$$;

revoke all on function public.create_report_with_needs(jsonb, jsonb) from public, anon;
revoke all on function public.update_report_with_needs(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_report_with_needs(jsonb, jsonb) to authenticated;
grant execute on function public.update_report_with_needs(uuid, jsonb, jsonb) to authenticated;
