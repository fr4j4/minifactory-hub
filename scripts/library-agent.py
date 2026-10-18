#!/usr/bin/env python3
"""Read-only WebDAV bridge for explicitly authorized desktop folders.
Connect through HTTPS reverse proxy / SSH tunnel; never exposes a whole drive by default.
Usage: LIBRARY_AGENT_PASSWORD=... python3 scripts/library-agent.py --root ~/Models --port 8766
"""
import argparse, base64, hashlib, hmac, os, pathlib, stat, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from xml.sax.saxutils import escape

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',required=True)
    parser.add_argument('--listen',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8766)
    parser.add_argument('--password-env',default='LIBRARY_AGENT_PASSWORD')
    args=parser.parse_args(); root=pathlib.Path(args.root).resolve(strict=True)
    password=os.environ.get(args.password_env,'')
    if len(password)<20: parser.error('Set a password of at least 20 characters in the selected environment variable')
    expected='Basic '+base64.b64encode(('agent:'+password).encode()).decode()
    class Handler(BaseHTTPRequestHandler):
        server_version='MiniFactoryLibraryAgent/1'
        def authorized(self):
            if not hmac.compare_digest(self.headers.get('Authorization',''),expected):
                self.send_response(401);self.send_header('WWW-Authenticate','Basic realm="Library agent"');self.end_headers();return False
            return True
        def resolve(self):
            raw=urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
            parts=pathlib.PurePosixPath(raw).parts
            if any(p in ('..','.') or '\\' in p or '\x00' in p for p in parts):raise ValueError('Invalid path')
            current=root
            for p in parts:
                if p=='/':continue
                if p.startswith('.'):raise ValueError('Hidden path')
                current=current/p
                if current.is_symlink():raise ValueError('Symlink forbidden')
            result=current.resolve(strict=True)
            if result!=root and root not in result.parents:raise ValueError('Outside root')
            return result
        def do_OPTIONS(self):
            if not self.authorized():return
            self.send_response(200);self.send_header('Allow','OPTIONS, PROPFIND, GET');self.send_header('DAV','1');self.end_headers()
        def do_PROPFIND(self):
            if not self.authorized():return
            try:
                target=self.resolve();depth=self.headers.get('Depth','1')
                if depth not in ('0','1'):self.send_error(403);return
                paths=[target]
                if depth=='1' and target.is_dir():paths += [p for p in target.iterdir() if not p.name.startswith('.') and not p.is_symlink()]
                rows=[]
                for p in paths:
                    info=p.stat();relative=p.relative_to(root).as_posix();href='/'+urllib.parse.quote('' if relative=='.' else relative)+('/' if p.is_dir() and p!=root else '')
                    etag=hashlib.sha256(f'{info.st_dev}:{info.st_ino}:{info.st_size}:{info.st_mtime_ns}'.encode()).hexdigest()
                    rows.append(f'<d:response><d:href>{escape(href)}</d:href><d:propstat><d:prop><d:displayname>{escape(p.name)}</d:displayname><d:resourcetype>{"<d:collection/>" if p.is_dir() else ""}</d:resourcetype><d:getcontentlength>{info.st_size}</d:getcontentlength><d:getetag>"{etag}"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>')
                body=('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">'+''.join(rows)+'</d:multistatus>').encode();self.send_response(207);self.send_header('Content-Type','application/xml');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            except (ValueError,OSError):self.send_error(404)
        def do_GET(self):
            if not self.authorized():return
            try:
                target=self.resolve()
                # O_NOFOLLOW closes final-component symlink races where available.
                if os.open in os.supports_dir_fd and hasattr(os,'O_NOFOLLOW'):
                    parent_fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
                    try:
                        relative=target.relative_to(root).parts
                        if not relative:raise ValueError('Not a file')
                        for part in relative[:-1]:
                            next_fd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent_fd);os.close(parent_fd);parent_fd=next_fd
                        fd=os.open(relative[-1],os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent_fd)
                    finally:os.close(parent_fd)
                else:
                    raise ValueError('This platform requires a filesystem bridge with no-follow support')
                with os.fdopen(fd,'rb') as source:
                    info=os.fstat(source.fileno())
                    if not stat.S_ISREG(info.st_mode):self.send_error(404);return
                    self.send_response(200);self.send_header('Content-Length',str(info.st_size));self.send_header('Content-Type','application/octet-stream');self.end_headers()
                    while True:
                        chunk=source.read(65536)
                        if not chunk:break
                        self.wfile.write(chunk)
            except (ValueError,OSError):self.send_error(404)
        def log_message(self,fmt,*values):pass
    server=ThreadingHTTPServer((args.listen,args.port),Handler)
    print(f'Library agent ready on {args.listen}:{server.server_port}; read-only root: {root}',flush=True)
    server.serve_forever()
if __name__=='__main__':main()
