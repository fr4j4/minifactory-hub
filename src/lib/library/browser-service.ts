/** Private service: no browser capability, password or provider URL is returned to the client. */
export async function browserService(id:string,action:string,method='GET',body?:unknown){
  const base=process.env.MAKERWORLD_BROWSER_URL,key=process.env.BROWSER_SERVICE_KEY;
  if(!base||!key)throw new Error('El navegador remoto no está habilitado en este despliegue. Puedes adjuntar el 3MF descargado.');
  const res=await fetch(`${base}/${id}/${action}`,{method,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(action==='file'?120000:45000)});
  if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'El navegador remoto no está disponible');}
  return res;
}
