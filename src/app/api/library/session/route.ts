import { getSession } from '@/lib/auth';
export async function GET(){const u=await getSession();return Response.json(u?{owner:`${u.workspaceId}:${u.id}`}:{},{status:u?200:401,headers:{'cache-control':'no-store'}});}
