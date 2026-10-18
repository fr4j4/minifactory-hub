import { requireUser } from './auth';
import { can } from './perm';
import { WORKSPACE_ID } from '@/db';

export async function integrationUser() {
  const user=await requireUser();
  if(user.workspaceId!==WORKSPACE_ID || !(can(user,'archivos','C') || can(user,'maquinas','C'))) throw new Error('No tienes permiso para asociar cuentas.');
  return user;
}
