import {expect,it} from 'vitest';
// Pure JS service module; no server is started when imported.
// @ts-expect-error deployment module has no TypeScript declarations
import {publicAddress} from '../../services/makerworld-browser/proxy.mjs';
it('denies internal, metadata, loopback, mapped and special IPs',()=>{
  for(const ip of ['0.0.0.0','10.0.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.1.14','100.100.100.200','198.18.0.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::','bad'])expect(publicAddress(ip),ip).toBe(false);
});
it('allows public IPv4 and global IPv6',()=>{for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])expect(publicAddress(ip),ip).toBe(true);});
