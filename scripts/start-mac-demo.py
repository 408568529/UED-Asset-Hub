#!/usr/bin/env python3
"""Load protected local credentials; the existing Host Supervisor owns services."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import stat
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--config', required=True, type=Path)
parser.add_argument('--login', required=True, type=Path)
parser.add_argument('--check', action='store_true', help='Validate without starting services')
args = parser.parse_args()
workspace = Path(__file__).resolve().parent.parent
try:
    if sys.platform != 'darwin':
        raise ValueError('Mac demo requires macOS')
    info = args.login.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Login file must be owned by the current user and mode 0600')
    config = json.loads(args.config.read_text())
    auth = json.loads(args.login.read_text())
    if config.get('UED_LOCAL_DEMO_MODE') != 'true':
        raise ValueError('Explicit persistent demo opt-in required')
    if any(key in config for key in ['ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'AGENT_GATEWAY_TOKEN']):
        raise ValueError('Secrets must not be stored in the host config')
    env = {key: value for key, value in os.environ.items()
           if key in ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM']}
    env.update(config)
    for key in ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'ADMIN_SESSION_SECURE']:
        if not isinstance(auth.get(key), str) or not auth[key]:
            raise ValueError('Protected login configuration is incomplete')
        env[key] = auth[key]
    env['NODE_ENV'] = 'production'
    env['AGENT_GATEWAY_TOKEN'] = secrets.token_urlsafe(32)
    runtime = Path(config['UED_LOCAL_DEMO_ROOT'])
    env['PATH'] = str(runtime / 'tools') + ':' + env.get('PATH', '/usr/local/bin:/usr/bin:/bin')
    checked = subprocess.run(['node', '--input-type=module', '-e',
        'import {resolveHostSecurityConfig} from "./scripts/host-security-config.mjs";resolveHostSecurityConfig(process.env);'],
        cwd=workspace, env=env, capture_output=True)
    if checked.returncode:
        raise ValueError('Host security validation failed; check loopback origin, DATA path and protected login config')
    if args.check:
        print('Persistent Mac demo configuration valid; no services started.')
    else:
        # Next standalone output omits public assets; the viewer needs haldur-preview.js.
        standalone = workspace / '.next-local-test/standalone'
        if not (standalone / 'server.js').is_file():
            raise ValueError('Standalone build is missing')
        shutil.copytree(workspace / 'public', standalone / 'public', dirs_exist_ok=True)
        os.chdir(workspace)
        os.execvpe('npm', ['npm', 'run', 'start:host'], env)
except (OSError, ValueError, KeyError):
    # Never interpolate file contents, credentials or inherited process output.
    raise SystemExit('Persistent Mac demo configuration rejected. No services started.')
