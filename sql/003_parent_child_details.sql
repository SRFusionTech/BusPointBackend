-- Migration: class/section master + child details on parent accounts
-- (run once on production after deploying this release)

-- 1. Class master — integer ids; a school has only a handful of classes
CREATE TABLE IF NOT EXISTS school_classes (
  id          serial PRIMARY KEY,
  school_id   uuid NOT NULL,
  name        varchar(30) NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_classes_school_id ON school_classes (school_id);
-- Same school can't have the same class twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_classes_school_name ON school_classes (school_id, name);

-- 2. Sections per class — removed with their class
CREATE TABLE IF NOT EXISTS class_sections (
  id          serial PRIMARY KEY,
  class_id    int NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  name        varchar(10) NOT NULL,
  sort_order  int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_class_sections_class_id ON class_sections (class_id);
-- Same class can't have the same section twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sections_class_name ON class_sections (class_id, name);

-- 3. Child details on parent accounts
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS child_name       varchar DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS child_class_id   int     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS child_section_id int     DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_users_child_class_id ON users (child_class_id);
