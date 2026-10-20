CREATE TABLE library_details (model_id uuid PRIMARY KEY REFERENCES model_files(id), data jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE library_assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, deleted_at timestamptz, model_id uuid NOT NULL REFERENCES model_files(id), version_id uuid, role text NOT NULL, name text NOT NULL, storage_key text, entry_id uuid, data jsonb NOT NULL DEFAULT '{}');
--> statement-breakpoint
CREATE INDEX library_asset_model ON library_assets(model_id);
--> statement-breakpoint
CREATE TABLE library_photo_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, deleted_at timestamptz, model_id uuid NOT NULL REFERENCES model_files(id), photo_id uuid NOT NULL REFERENCES photos(id), version_id uuid, data jsonb NOT NULL DEFAULT '{}');
--> statement-breakpoint
CREATE UNIQUE INDEX library_photo_link ON library_photo_links(model_id,photo_id);
--> statement-breakpoint
CREATE TABLE library_cache (version_id uuid PRIMARY KEY REFERENCES file_versions(id), source_id uuid NOT NULL REFERENCES library_sources(id), storage_key text NOT NULL, bytes double precision NOT NULL, pinned boolean NOT NULL DEFAULT false, durable boolean NOT NULL DEFAULT false, accessed_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz);
--> statement-breakpoint
CREATE INDEX library_search_name ON model_files(workspace_id,lower(name));
--> statement-breakpoint
CREATE INDEX library_search_tags ON model_files USING gin(tags);
--> statement-breakpoint
CREATE INDEX library_updated ON model_files(workspace_id,updated_at,id);
--> statement-breakpoint
INSERT INTO library_photo_links(workspace_id,model_id,photo_id) SELECT workspace_id,model_file_id,id FROM photos WHERE model_file_id IS NOT NULL ON CONFLICT DO NOTHING;

--> statement-breakpoint
INSERT INTO library_sources(workspace_id,name,kind,config,status,writable) SELECT id,'Almacenamiento administrado','managed-local','{"visibility":"workshop","allowAi":true}'::jsonb,'connected',false FROM workspaces ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO library_entries(workspace_id,source_id,remote_id,parent_id,path,name,revision,size,model_id,version_id) SELECT v.workspace_id,ls.id,v.id::text,'',v.model_file_id::text||'-v'||v.number||'.'||v.format,v.model_file_id::text||'-v'||v.number||'.'||v.format,coalesce(v.sha256,v.id::text),v.size::text,v.model_file_id,v.id FROM file_versions v JOIN library_sources ls ON ls.workspace_id=v.workspace_id AND ls.kind='managed-local' WHERE v.storage_key<>'' AND v.meta->'remote' IS NULL ON CONFLICT DO NOTHING;

--> statement-breakpoint
CREATE UNIQUE INDEX library_managed_single ON library_sources(workspace_id) WHERE kind='managed-local';
