import type { Readable } from 'node:stream';
export type SourceKind = 'managed-local' | 'local' | 'drive' | 'ftp' | 'ftps' | 'sftp' | 'webdav' | 's3' | 'onedrive' | 'dropbox';
export interface RemoteEntry {
    id: string;
    name: string;
    directory: boolean;
    size: number;
    revision: string;
    downloadable?: boolean;
}
export interface Connector {
    root: string;
    capabilities: {
        rename: boolean;
        mkdir: boolean;
        upload: boolean;
        trash: boolean;
    };
    list(parent: string, cursor?: string): Promise<{
        entries: RemoteEntry[];
        cursor?: string;
    }>;
    stat(id: string): Promise<RemoteEntry>;
    read(id: string): Promise<Readable>;
    move?(id:string,parent:string,name:string):Promise<string>;
    rename?(id: string, name: string): Promise<string>;
    mkdir?(parent: string, name: string): Promise<string>;
    upload?(parent: string, name: string, localPath: string): Promise<string>;
    trash?(id: string, token?: string): Promise<string | void>;
    restore?(id:string,parent:string,name:string):Promise<string>;
    changes?(cursor?:string):Promise<{cursor:string;changed:boolean}>;
    close(): Promise<void>;
}
export function safeName(name: string) {
    if (!name || name.length > 200 || /[\\/\x00-\x1f]/.test(name) || name === '.' || name === '..' || name.startsWith('.'))
        throw new Error('Nombre de archivo inválido');
    return name;
}
export function relativeKey(key: string) {
    if (key.includes('\\') || key.includes('\0') || key.startsWith('/') || key.split('/').some(x => x === '..'))
        throw new Error('Ruta fuera de la fuente');
    return key;
}
export const readOnly = { rename: false, mkdir: false, upload: false, trash: false };
