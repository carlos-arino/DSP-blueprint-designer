"""Servidor local sin caché (así el navegador siempre carga la última versión de los .js).

Uso: python tools/serve.py [puerto]   (por defecto 8765) y abre http://127.0.0.1:8765
"""
import os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'http://127.0.0.1:{port}')
    ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
