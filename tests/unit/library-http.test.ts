import { describe,it,expect } from 'vitest';
import { Readable } from 'node:stream';
import { request,body } from '@/lib/library/connectors/http';
describe('public download boundaries',()=>{
 it('rejects local and metadata targets before connecting',async()=>{for(const url of ['https://127.0.0.1/file.stl','https://[::1]/file.stl','https://169.254.169.254/latest/','file:///etc/passwd','https://user:password@example.com/file'])await expect(request(url)).rejects.toThrow();});
 it('bounds response bodies during reading',async()=>{await expect(body(Readable.from([Buffer.alloc(8),Buffer.alloc(8)]) as any,10)).rejects.toThrow('grande');});
});
