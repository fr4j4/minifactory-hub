-- Las imágenes de modelos 3D (importadas o subidas desde la ficha) dejan de mezclarse con las fotos de trabajos.
ALTER TABLE photos ADD COLUMN scope text NOT NULL DEFAULT 'job';--> statement-breakpoint
UPDATE photos SET scope = 'model' WHERE deleted_at IS NULL AND (tags @> '["imagen de origen"]'::jsonb OR storage_key LIKE 'photos/imported/%');--> statement-breakpoint
CREATE INDEX photos_scope_ix ON photos (workspace_id, scope);
