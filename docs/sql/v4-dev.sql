-- v4: apply to the Neon DEV branch (br-wild-violet-b9p5v309, database forms). Idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS login text;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_login_unique') THEN ALTER TABLE users ADD CONSTRAINT users_login_unique UNIQUE (login); END IF; END $$;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS weekly_digest boolean DEFAULT true NOT NULL;
ALTER TABLE package_templates ADD COLUMN IF NOT EXISTS expiry_rule jsonb;
ALTER TABLE package_templates ADD COLUMN IF NOT EXISTS completion_recipients jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE package_templates ADD COLUMN IF NOT EXISTS follow_up_statuses jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE package_templates ADD COLUMN IF NOT EXISTS reminders_enabled boolean DEFAULT true NOT NULL;
CREATE TABLE IF NOT EXISTS employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, id_number text NOT NULL, name text NOT NULL, email text, phone text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, CONSTRAINT employees_id_number_unique UNIQUE(id_number));
CREATE TABLE IF NOT EXISTS employee_organizations (employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE cascade, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade, project_id uuid REFERENCES projects(id) ON DELETE set null, created_at timestamp with time zone DEFAULT now() NOT NULL, CONSTRAINT employee_organizations_employee_id_organization_id_pk PRIMARY KEY(employee_id, organization_id));
ALTER TABLE requests ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id) ON DELETE set null;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS follow_up jsonb DEFAULT '{}'::jsonb NOT NULL;
create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now());
insert into schema_migrations(name) values ('v4-1-manual') on conflict do nothing;
