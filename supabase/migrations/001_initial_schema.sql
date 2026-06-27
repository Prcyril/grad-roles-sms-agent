-- ═══════════════════════════════════════════════════════════════
-- JobAgent — Supabase schema
-- Run this in your Supabase SQL editor or via the migrate script
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── jobs ────────────────────────────────────────────────────────
-- Every scraped job listing. url_hash is the dedup key.
create table if not exists jobs (
  id           uuid        primary key default gen_random_uuid(),
  url          text        not null,
  url_hash     text        not null unique,   -- MD5 of url, dedup key
  title        text        not null,
  company      text        not null,
  source       text        not null,          -- e.g. "GradConnection"
  location     text        not null,
  type         text        not null,          -- "Internship" | "Grad Role" etc
  industry     text        not null default 'Tech',
  salary       text,
  closing_date timestamptz,
  description  text,
  scraped_at   timestamptz not null default now()
);

create index if not exists jobs_url_hash_idx    on jobs (url_hash);
create index if not exists jobs_source_idx      on jobs (source);
create index if not exists jobs_closing_date_idx on jobs (closing_date)
  where closing_date is not null;

-- ── user_prefs ──────────────────────────────────────────────────
-- Single row for Cyril. Keyed by phone for inbound SMS commands.
create table if not exists user_prefs (
  id             uuid      primary key default gen_random_uuid(),
  phone          text      not null unique,   -- E.164 e.g. +614XXXXXXXX
  name           text      not null default 'Cyril',
  industries     text[]    not null default array['Tech','FinTech','SaaS'],
  job_types      text[]    not null default array['Internship','Grad Role'],
  locations      text[]    not null default array['Sydney','Melbourne','Remote'],
  keywords       text               default 'Software Engineer, Product Manager, Data Analyst, ML Engineer',
  active_sources int                default 21,
  frequency      text      not null default 'Monday',
  paused         boolean   not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── sent_digests ────────────────────────────────────────────────
-- Log of every digest SMS sent. jobs is JSONB array of full job objects.
-- job_hashes is used for "don't re-send" logic.
create table if not exists sent_digests (
  id          uuid        primary key default gen_random_uuid(),
  jobs        jsonb       not null default '[]',    -- Full ranked job objects
  job_hashes  text[]      not null default '{}',    -- url_hash of each job
  sms_body    text        not null,
  sent_at     timestamptz not null default now(),
  dry_run     boolean     not null default false
);

create index if not exists sent_digests_sent_at_idx on sent_digests (sent_at desc);

-- ── applications ────────────────────────────────────────────────
-- Tracks Cyril's application pipeline via SMS commands.
-- status: saved | applied | online_assessment | interview | offer | skipped | starred
create table if not exists applications (
  id         uuid        primary key default gen_random_uuid(),
  job_url    text        not null,
  job_title  text        not null,
  company    text        not null,
  phone      text        not null,
  status     text        not null default 'saved',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (job_url, phone)
);

create index if not exists applications_phone_idx  on applications (phone);
create index if not exists applications_status_idx on applications (status);

-- ── deadline_alerts ─────────────────────────────────────────────
-- Tracks which deadline SMS alerts have already been sent.
-- Prevents duplicate "closes in 7 days" alerts on repeat scans.
create table if not exists deadline_alerts (
  id           uuid        primary key default gen_random_uuid(),
  job_url_hash text        not null,
  alert_type   text        not null,   -- "7-day" | "48-hour"
  alerted_at   timestamptz not null default now(),
  unique (job_url_hash, alert_type)
);

-- ── cover_letters ───────────────────────────────────────────────
-- Phase 5: Generated cover letter drafts (reserved for future use)
create table if not exists cover_letters (
  id        uuid        primary key default gen_random_uuid(),
  job_url   text        not null,
  job_title text        not null,
  company   text        not null,
  phone     text        not null,
  content   text        not null,
  created_at timestamptz not null default now()
);

-- ── Seed: default user prefs ────────────────────────────────────
-- Replace +614XXXXXXXXX with your actual AU mobile number.
-- Run once during setup.
insert into user_prefs (phone, name)
values ('+614XXXXXXXXX', 'Cyril')
on conflict (phone) do nothing;
