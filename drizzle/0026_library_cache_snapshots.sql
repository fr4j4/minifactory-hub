INSERT INTO library_cache(version_id,source_id,storage_key,bytes,durable)
SELECT v.id,ls.id,v.storage_key,v.size,true FROM file_versions v
JOIN library_sources ls ON ls.id::text=v.meta->'remote'->>'sourceId'
WHERE v.storage_key<>'' ON CONFLICT DO NOTHING;
