// HTTPS-only egress gateway. Resolve once and pin the tunnel to a public address.
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
export function publicAddress(ip){
  if(net.isIP(ip)===4){
    const [a,b]=ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
  }
  // Only global unicast IPv6; reject special-purpose/documentation ranges too.
  return net.isIP(ip)===6&&/^[23]/i.test(ip)&&!/^2001:(?:0*:|0*2:|0*10:|0*20:|db8:)/i.test(ip)&&!/^2002:/i.test(ip);
}
export function startProxy(port=3128){
  const server=http.createServer((_q,r)=>{r.writeHead(405);r.end();});
  server.on('connect',async(req,client,head)=>{
    let upstream;
    client.on('error',()=>upstream?.destroy());
    try{
      const u=new URL(`https://${req.url}`),host=u.hostname.replace(/^\[|\]$/g,'');
      if(u.port&&u.port!=='443'||u.username||u.password)throw Error();
      const addresses=await dns.lookup(host,{all:true});
      if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error();
      upstream=net.connect({host:addresses[0].address,family:addresses[0].family,port:443});
      upstream.setTimeout(120000,()=>upstream.destroy());
      upstream.on('error',()=>client.destroy());
      client.on('close',()=>upstream.destroy());
      upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
    }catch{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
  });
  return server.listen(port,'0.0.0.0');
}
if(process.argv[1]?.endsWith('/proxy.mjs'))startProxy();
