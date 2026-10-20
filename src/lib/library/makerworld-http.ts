import {body,request} from './connectors/http';

export class MakerworldError extends Error {
  constructor(readonly code:string,message:string,readonly retryAfter=0){super(message);}
}

/** Provider text is classified, never echoed: it may contain account information. */
export function classifyMakerworld(status:number,data:any,text='',retryAfter=0):never {
  const hint=String(data?.error||data?.message||'').toLowerCase();
  if(status===429||/too many|rate limit|frequen/.test(hint))throw new MakerworldError('rate_limit','Bambu ha limitado los intentos. Espera un minuto antes de volver a intentarlo.',retryAfter||60);
  const htmlChallenge = !data && /cloudflare|challenge-platform|just a moment/i.test(text);
  const apiChallenge = (status === 418 && ('captchaId' in (data || {}) || /captcha|robot/.test(hint))) || /captcha required|confirm.*not.*robot/.test(hint);
  if(htmlChallenge || apiChallenge)throw new MakerworldError('browser_required','Bambu exige verificar esta red en su navegador. Puedes asociar una sesión ya iniciada usando la opción «Sesión del navegador». No vuelvas a solicitar códigos mientras dure el bloqueo.',300);
  if(/code.*(expired|invalid|incorrect)|verification code|verify code/.test(hint))throw new MakerworldError('invalid_code','El código no es válido o caducó. Revísalo o solicita uno nuevo.');
  if(status===401||/please log|please login|token.*(invalid|expired)|unauthorized/.test(hint))throw new MakerworldError('authentication','La sesión no es válida o ha caducado. Vuelve a conectar tu cuenta.');
  if(status===403)throw new MakerworldError('permission','Bambu rechazó esta solicitud. Puedes continuar desde el navegador o comprobar los permisos del modelo.');
  if(status>=500)throw new MakerworldError('unavailable','Bambu no está disponible en este momento. Vuelve a intentarlo en unos minutos.');
  if(status===400||/password|account|credential/.test(hint))throw new MakerworldError('credentials','No se pudo iniciar sesión con ese correo y contraseña. Si usas Google, Apple o Facebook, elige «Acceder desde el navegador».');
  throw new MakerworldError('provider_response','Bambu devolvió una respuesta no reconocida. Prueba el acceso desde el navegador.');
}

export async function makerworldJson(url:string,options:Parameters<typeof request>[1]={}) {
  let response;
  try{response=await request(url,{...options,timeoutMs:15000,acceptHttpErrors:true,headers:{Accept:'application/json','User-Agent':'MiniFactory/1.0',...options.headers}});}
  catch{throw new MakerworldError('network','No se pudo contactar con Bambu en 15 segundos. Comprueba la conexión e inténtalo de nuevo.');}
  let text:string;
  try{text=await body(response,2*1024*1024);}catch{throw new MakerworldError('network','La respuesta de Bambu se interrumpió. Vuelve a intentarlo.');}
  let data:any;try{data=text?JSON.parse(text):{};}catch{classifyMakerworld(response.statusCode||502,null,text);}
  // Bambu can return the next authentication step alongside a non-2xx status.
  if((response.statusCode||500)>=400 && !(response.statusCode===400 && ['verifyCode','tfa'].includes(data?.loginType))) {
    classifyMakerworld(response.statusCode||500,data,text,Math.min(900,Number(response.headers['retry-after'])||0));
  }
  if(data?.error && !data?.accessToken && !data?.loginType)classifyMakerworld(response.statusCode||200,data,text);
  return data;
}
