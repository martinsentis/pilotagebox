-- =====================================================================
-- Migration 0002 — Rapprochement bancaire (réel)
-- Tables relationnelles : on agrège/filtre par mois et catégorie.
-- Réf. spec : MODULE_RAPPROCHEMENT.md (repo frontend)
--
-- Le réel est rattaché au PROJET (pas à un scénario) : c'est une donnée
-- constatée, partagée, qu'on compare ensuite au scénario de son choix.
-- =====================================================================

-- ---------------------------------------------------------------------
-- import_batches : un lot = un fichier d'extract importé
-- ---------------------------------------------------------------------
create table if not exists import_batches (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  bank_label      text,                       -- ex: "Compte courant AlloBox"
  file_name       text not null,
  period_start    date,                       -- bornes de l'extract
  period_end      date,
  line_count      integer not null default 0,
  imported_at     timestamptz not null default now()
);

create index if not exists idx_import_batches_project on import_batches(project_id);

-- ---------------------------------------------------------------------
-- bank_transactions : une ligne bancaire
-- amount_ttc est SIGNÉ (crédit > 0, débit < 0) — vérité bancaire.
-- amount_ht est dérivé via vat_rate (du label rattaché, ou défaut).
-- target_type/target_id pointent vers le cockpit (label précis OU catégorie).
-- ---------------------------------------------------------------------
create table if not exists bank_transactions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  batch_id          uuid not null references import_batches(id) on delete cascade,

  transaction_date  date not null,
  period_month      text not null,            -- "YYYY-MM" pour agrégation mensuelle

  raw_label         text not null,            -- libellé brut d'origine
  signature         text not null,            -- libellé normalisé STABLE (IDs/dates retirés) → clé de matching

  amount_ttc        numeric(14,2) not null,   -- signé
  vat_rate          numeric(5,4) not null default 0.20,
  amount_ht         numeric(14,2) not null,   -- = amount_ttc / (1 + vat_rate)

  -- Rattachement (cf. spec §7) : deux niveaux
  -- ⚠️ target_id doit être un identifiant STABLE (code/nom normalisé du label,
  -- ou code catégorie), PAS un uuid interne : les datasets de scénarios sont
  -- clonés, donc un uuid de label changerait d'un scénario à l'autre.
  target_type       text check (target_type in ('LABEL','CATEGORY')),
  target_id         text,                     -- code label stable OU code catégorie (IMMOBILIER, MARKETING…)

  classification    text check (classification in ('RECURRENT','PONCTUEL','EXCLU')),
  status            text not null default 'SUGGESTED' check (status in ('SUGGESTED','CONFIRMED')),

  -- Déduplication : rang d'occurrence pour ne PAS écraser les doublons légitimes
  -- du même jour (ex: plusieurs "Frais de rejet 9,80 €" le même jour).
  occurrence_rank   integer not null default 1,
  dedup_key         text not null,            -- hash(date+montant+signature+rank+project)

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (project_id, dedup_key)
);

create index if not exists idx_bank_tx_project_month on bank_transactions(project_id, period_month);
create index if not exists idx_bank_tx_signature      on bank_transactions(project_id, signature);
create index if not exists idx_bank_tx_status         on bank_transactions(project_id, status);

drop trigger if exists trg_bank_tx_updated_at on bank_transactions;
create trigger trg_bank_tx_updated_at
  before update on bank_transactions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- categorization_rules : MÉMOIRE DE SIGNATURES PERSISTANTE
-- Une signature validée une fois est retenue → les imports suivants
-- pré-catégorisent automatiquement les signatures connues.
-- ---------------------------------------------------------------------
create table if not exists categorization_rules (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  signature       text not null,              -- signature normalisée (clé)
  target_type     text check (target_type in ('LABEL','CATEGORY')),
  target_id       text,
  classification  text check (classification in ('RECURRENT','PONCTUEL','EXCLU')),
  vat_rate        numeric(5,4) default 0.20,  -- hérité du label si applicable
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (project_id, signature)
);

create index if not exists idx_rules_project on categorization_rules(project_id);

drop trigger if exists trg_rules_updated_at on categorization_rules;
create trigger trg_rules_updated_at
  before update on categorization_rules
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — mono-utilisateur (authentifié = accès total)
-- ---------------------------------------------------------------------
alter table import_batches        enable row level security;
alter table bank_transactions     enable row level security;
alter table categorization_rules  enable row level security;

drop policy if exists "authenticated full access" on import_batches;
create policy "authenticated full access" on import_batches
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on bank_transactions;
create policy "authenticated full access" on bank_transactions
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on categorization_rules;
create policy "authenticated full access" on categorization_rules
  for all to authenticated using (true) with check (true);
