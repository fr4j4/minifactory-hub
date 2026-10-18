import { z } from 'zod';
export const SourcePolicy = z.object({
  include: z.array(z.string().max(200)).max(40).default([]),
  exclude: z.array(z.string().max(200)).max(40).default([]),
  maxDepth: z.number().int().min(0).max(100).default(30),
  maxFileMiB: z.number().min(1).max(500).default(500),
  cacheMiB: z.number().min(0).max(1048576).default(2048),
  reserveMiB: z.number().min(64).max(1048576).default(256),
  bytesPerSecond: z.number().int().min(0).max(1073741824).default(0),
  mode: z.enum(['index','ondemand','copy','offline']).default('ondemand'),
  visibility: z.enum(['workshop','restricted']).default('workshop'),
  users: z.array(z.string().uuid()).max(100).default([]),
  roles: z.array(z.string().max(30)).max(20).default([]),
}).passthrough();
export function policy(config: Record<string, any>) { return SourcePolicy.parse(config); }
export function glob(pattern:string, value:string) {
  const tokens=pattern.split(/(\*\*|\*|\?)/g);
  return new RegExp('^'+tokens.map(t=>t==='**'?'.*':t==='*'?'[^/]*':t==='?'?'[^/]':t.replace(/[.+^${}()|[\]\\]/g,'\\$&')).join('')+'$','i').test(value);
}
export function included(config:Record<string,any>, name:string, directory:boolean) {
  const p=policy(config); const depth=name.split('/').length-1;
  if(depth>p.maxDepth || p.exclude.some(g=>glob(g,name)))return false;
  return directory || !p.include.length || p.include.some(g=>glob(g,name));
}
