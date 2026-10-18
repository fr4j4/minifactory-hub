CREATE TABLE library_sources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, deleted_at timestamptz, name text NOT NULL, kind text NOT NULL, config jsonb NOT NULL DEFAULT '{}', secret text, enabled boolean NOT NULL DEFAULT true, writable boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'new', error text, last_scan_at timestamptz);
--> statement-breakpoint
CREATE TABLE library_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, deleted_at timestamptz, source_id uuid NOT NULL REFERENCES library_sources(id), remote_id text NOT NULL, parent_id text, path text NOT NULL, name text NOT NULL, directory boolean NOT NULL DEFAULT false, revision text NOT NULL, size text NOT NULL DEFAULT '0', downloadable boolean NOT NULL DEFAULT true, model_id uuid REFERENCES model_files(id), version_id uuid REFERENCES file_versions(id), state text NOT NULL DEFAULT 'available', seen_scan_id uuid);
--> statement-breakpoint
CREATE TABLE library_scans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, deleted_at timestamptz, source_id uuid NOT NULL REFERENCES library_sources(id), status text NOT NULL DEFAULT 'queued', checkpoint jsonb NOT NULL, count integer NOT NULL DEFAULT 0, error text, finished_at timestamptz);
--> statement-breakpoint
CREATE TABLE library_operations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, deleted_at timestamptz, kind text NOT NULL, status text NOT NULL DEFAULT 'planned', input jsonb NOT NULL, result jsonb, error text);
--> statement-breakpoint
CREATE TABLE library_collections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, deleted_at timestamptz, name text NOT NULL);
--> statement-breakpoint
CREATE TABLE library_collection_models (collection_id uuid NOT NULL REFERENCES library_collections(id), model_id uuid NOT NULL REFERENCES model_files(id), PRIMARY KEY(collection_id, model_id));
--> statement-breakpoint
CREATE UNIQUE INDEX library_entry_identity ON library_entries(source_id, remote_id);
--> statement-breakpoint
CREATE INDEX library_entry_model ON library_entries(model_id);
--> statement-breakpoint
CREATE INDEX library_entry_parent ON library_entries(source_id, parent_id);
--> statement-breakpoint
CREATE UNIQUE INDEX library_collection_name ON library_collections(workspace_id, name);
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN lease_until timestamptz, ADD COLUMN owner text;
--> statement-breakpoint
CREATE INDEX model_files_search_name ON model_files (workspace_id, updated_at, id);
