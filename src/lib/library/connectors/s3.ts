import { S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { relativeKey, safeName, type Connector, type RemoteEntry } from './types';
export async function s3Connector(c: Record<string, any>, s: Record<string, any>): Promise<Connector> {
    const client = new S3Client({ region: c.region || 'us-east-1', endpoint: c.endpoint || undefined, forcePathStyle: !!c.endpoint, credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey, sessionToken: s.sessionToken } });
    const Bucket = c.bucket;
    const prefix = (c.root || '').replace(/^\/+|\/+$/g, '');
    const key = (id: string) => [prefix, relativeKey(id)].filter(Boolean).join('/');
    const stat = async (id: string): Promise<RemoteEntry> => { const r = await client.send(new HeadObjectCommand({ Bucket, Key: key(id) })); return { id, name: id.split('/').at(-1)!, directory: false, size: Number(r.ContentLength || 0), revision: `:${r.ETag || ''}:${r.LastModified?.toISOString() || ''}`, downloadable: r.StorageClass !== 'GLACIER' && r.StorageClass !== 'DEEP_ARCHIVE' }; };
    return { root: '', capabilities: { rename: false, mkdir: false, upload: true, trash: false }, stat,
        async list(parent, cursor) { const Prefix = key(parent); const r = await client.send(new ListObjectsV2Command({ Bucket, Prefix: Prefix ? Prefix + '/' : '', Delimiter: '/', ContinuationToken: cursor, MaxKeys: 100 })); const strip = (k: string) => prefix ? k.slice(prefix.length + 1) : k; return { entries: [...(r.CommonPrefixes || []).map(p => ({ id: strip(p.Prefix!).replace(/\/$/, ''), name: p.Prefix!.split('/').at(-2)!, directory: true, size: 0, revision: 'folder' })), ...(r.Contents || []).filter(x => !x.Key!.endsWith('/')).map(x => ({ id: strip(x.Key!), name: x.Key!.split('/').at(-1)!, directory: false, size: Number(x.Size || 0), revision: `:${x.ETag || ''}:${x.LastModified?.toISOString() || ''}`, downloadable: x.StorageClass !== 'GLACIER' && x.StorageClass !== 'DEEP_ARCHIVE' }))], cursor: r.NextContinuationToken }; },
        async read(id) { const r = await client.send(new GetObjectCommand({ Bucket, Key: key(id) })); return r.Body as Readable; },
        async upload(parent, name, local) { safeName(name); const id = [parent, name].filter(Boolean).join('/'); await client.send(new PutObjectCommand({ Bucket, Key: key(id), Body: fs.createReadStream(local), ContentLength: (await fsp.stat(local)).size, IfNoneMatch: '*' })); return id; },
        async close() { client.destroy(); },
    };
}
