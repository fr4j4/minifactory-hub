-- Cola global: `print_jobs.position` pasa de ser el orden dentro de cada máquina a ser el orden de UNA sola cola
-- (machine_id ahora es solo la asignación, y puede ser NULL = sin asignar).
-- Migración de datos segura:
--  · no borra ni cambia ningún valor salvo `position`, y solo de los trabajos vivos (en_cola / imprimiendo / pausado, sin borrar);
--  · conserva el orden relativo dentro de cada máquina (ordena por la posición antigua), así que el código anterior sigue funcionando con estos datos;
--  · es idempotente: volver a ejecutarla deja exactamente el mismo resultado.
-- `dims` (nullable) guarda las dimensiones de la pieza para sugerir máquinas que la admitan; los trabajos existentes quedan en NULL.
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "dims" jsonb;--> statement-breakpoint
UPDATE "print_jobs" AS p SET "position" = r.rn
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "workspace_id"
    ORDER BY CASE "status" WHEN 'imprimiendo' THEN 0 WHEN 'pausado' THEN 1 ELSE 2 END, "position", "created_at", "id"
  )::int AS rn
  FROM "print_jobs"
  WHERE "deleted_at" IS NULL AND "status" IN ('en_cola', 'imprimiendo', 'pausado')
) AS r
WHERE p."id" = r."id" AND p."position" <> r.rn;
