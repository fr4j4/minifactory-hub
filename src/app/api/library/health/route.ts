import { getDb,s } from '@/db';
export const dynamic='force-dynamic';
export async function GET(){try{await(await getDb()).select({id:s.librarySources.id}).from(s.librarySources).limit(1);return Response.json({ok:true,environment:process.env.MF_TEST_DEPLOYMENT==='1'?'library-test':'default'},{headers:{'cache-control':'no-store'}});}catch{return Response.json({ok:false},{status:503});}}
