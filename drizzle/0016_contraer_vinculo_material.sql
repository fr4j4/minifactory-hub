-- contraer: la información ya vive en material_filament_links (migración 0015)
ALTER TABLE "materials" DROP COLUMN "filament_profile_id";