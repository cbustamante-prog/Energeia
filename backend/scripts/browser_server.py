"""Disposable local API for browser QA. Never connects to a configured database.

Run from backend: uv run python scripts/browser_server.py
Use --port to choose another local port. The database is deleted when stopped.
"""
import argparse
import os
from pathlib import Path
import secrets
import sys
import tempfile

import uvicorn


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='energeia-browser-') as directory:
        os.environ['DATABASE_URL'] = f'sqlite:///{directory}/qa.sqlite'
        os.environ['FRONTEND_URL'] = 'http://localhost:5173'
        os.environ['API_PUBLIC_URL'] = f'http://localhost:{args.port}'
        os.environ['CORS_ORIGINS'] = 'http://localhost:5173,http://127.0.0.1:5173'
        os.environ['JWT_SECRET'] = secrets.token_urlsafe(48)
        # Clear external credentials even if the developer has a local .env file.
        for name in ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID',
                     'GITHUB_CLIENT_SECRET', 'SMTP_HOST', 'SMTP_USERNAME',
                     'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'):
            os.environ[name] = ''
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from app.main import Base, app, engine
        Base.metadata.create_all(engine)
        uvicorn.run(app, host='0.0.0.0', port=args.port)
        engine.dispose()


if __name__ == '__main__':
    main()
