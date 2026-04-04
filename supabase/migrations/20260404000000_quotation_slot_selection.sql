-- Stores which pricing slot a client chose from a quotation, recorded at conversion time.
create table if not exists public.quotation_slot_selections (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  slot_index  integer not null default 0,
  created_at  timestamptz default now(),
  created_by  uuid references auth.users(id),
  unique(lead_id)
);

alter table public.quotation_slot_selections enable row level security;

create policy "Authenticated users can manage slot selections"
  on public.quotation_slot_selections for all
  to authenticated using (true) with check (true);
