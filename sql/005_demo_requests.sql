-- "Request a demo" submissions from the marketing site (managed in super admin).
CREATE TABLE IF NOT EXISTS demo_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name       varchar(160) NOT NULL,
  city              varchar(120) NOT NULL,
  country           varchar(120) NOT NULL,
  school_type       varchar(32)  NULL,
  student_range     varchar(32)  NULL,
  bus_range         varchar(32)  NULL,
  website           varchar(255) NULL,
  contact_name      varchar(120) NOT NULL,
  contact_role      varchar(120) NOT NULL,
  email             varchar(255) NOT NULL,
  phone             varchar(32)  NOT NULL,
  preferred_contact varchar(16)  NULL,
  preferred_time    varchar(16)  NULL,
  message           text         NULL,
  status            varchar(24)  NOT NULL DEFAULT 'new',
  notes             text         NULL,
  assigned_to       varchar(120) NULL,
  source            varchar(255) NULL,
  utm               jsonb        NULL,
  ip                varchar(64)  NULL,
  user_agent        varchar(400) NULL,
  consent_at        timestamptz  NOT NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status_created ON demo_requests (status, created_at DESC);
