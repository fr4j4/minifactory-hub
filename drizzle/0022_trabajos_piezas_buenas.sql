ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "qty_good" integer;--> statement-breakpoint
-- piezas buenas de trabajos ya cerrados (una falla parcial antigua queda sin dato)
UPDATE "print_jobs" SET "qty_good" = CASE WHEN "result" = 'exito' THEN "qty" WHEN "status" = 'fallido' THEN 0 END WHERE "qty_good" IS NULL AND "status" IN ('terminado', 'fallido');--> statement-breakpoint
-- líneas en cola cuyo único trabajo se canceló (antes cancelar no las devolvía a «pendiente»): se pueden planificar otra vez
UPDATE "order_items" oi SET "status" = 'pendiente' WHERE oi."status" = 'en_cola' AND NOT EXISTS (
  SELECT 1 FROM "job_items" ji JOIN "print_jobs" pj ON pj."id" = ji."job_id" WHERE ji."order_item_id" = oi."id" AND pj."status" <> 'cancelado' AND pj."deleted_at" IS NULL
);
