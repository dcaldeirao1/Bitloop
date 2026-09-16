-- Run this in Supabase SQL Editor (Dashboard → SQL → New query)
-- Wallet-scoped automations (MetaMask address). Replaces the old auth.users schema.

drop table if exists public.automations cascade;

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  enabled boolean not null default true,
  vault_address text,
  trigger_config jsonb not null default '{}'::jsonb,
  action_config jsonb not null default '{}'::jsonb,
  onchain boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automations_wallet_format check (char_length(wallet_address) = 42)
);

create index automations_wallet_address_idx
  on public.automations (lower(wallet_address));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger automations_set_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();

alter table public.automations enable row level security;

create policy "Automations select by wallet"
  on public.automations for select
  using (true);

create policy "Automations insert by wallet"
  on public.automations for insert
  with check (char_length(wallet_address) = 42);

create policy "Automations update by wallet"
  on public.automations for update
  using (true)
  with check (char_length(wallet_address) = 42);

create policy "Automations delete by wallet"
  on public.automations for delete
  using (true);
