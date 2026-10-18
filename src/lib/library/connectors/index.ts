import { localConnector } from './local';
import type { Connector, SourceKind } from './types';
export async function connector(kind: SourceKind, config: Record<string, any>, secret: Record<string, any>): Promise<Connector> {
    switch (kind) {
        case 'managed-local': return (await import('./managed')).managedConnector();
        case 'local': return localConnector(config.root);
        case 'ftp':
        case 'ftps':
        case 'sftp': return (await import('./transfer')).transferConnector(kind, config, secret);
        case 'drive': return (await import('./drive')).driveConnector(config, secret);
        case 'webdav': return (await import('./webdav')).webdavConnector(config, secret);
        case 's3': return (await import('./s3')).s3Connector(config, secret);
        case 'onedrive':
        case 'dropbox': return (await import('./cloud')).cloudConnector(kind, config, secret);
        default: throw new Error('Tipo de fuente desconocido');
    }
}
