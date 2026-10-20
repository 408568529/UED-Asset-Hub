#!/usr/bin/env python3
"""Resolve the private Mac demo version pointer; never initialize or migrate data."""
import json
import os
from pathlib import Path
import stat
import sys

runtime = Path(sys.argv[1])
action = sys.argv[2] if len(sys.argv) > 2 else 'Open'
if action not in ['Open', 'Check', 'Stop']:
    raise SystemExit('Unsupported launcher action.')
if sys.platform != 'darwin' or not runtime.is_absolute() or runtime.resolve() != runtime:
    raise SystemExit('Invalid persistent Mac demo root.')
pointer = runtime / 'config/current-demo-version.json'
info = pointer.lstat()
if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_nlink != 1 or pointer.resolve() != pointer:
    raise SystemExit('Version pointer must be a private, unlinked file owned by this account.')
version = json.loads(pointer.read_text())
program = Path(version['programRoot'])
if version.get('schemaVersion') != 1 or not program.is_absolute() or program.resolve() != program:
    raise SystemExit('Version identity is invalid.')
environment = {key: os.environ[key] for key in ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR'] if key in os.environ}
environment['PATH'] = '/usr/bin:/bin:/usr/sbin:/sbin'
if version.get('kind') == 'v25' and program.parent == runtime / 'versions':
    manifest = json.loads((program / 'mac-demo-version.json').read_text())
    if manifest.get('source') != version.get('source'):
        raise SystemExit('Selected version does not match its manifest.')
    node = program / 'tools/node/bin/node'
    os.execve(str(node), [str(node), str(program / 'tools/mac-demo-center.mjs'), action, str(program)], environment)
elif action == 'Open' and version.get('kind') == 'legacy-recovery' and program == runtime / 'recovery-validation/workspace':
    # The retained original entry performs its own port and administrator checks.
    os.execve('/bin/bash', ['/bin/bash', str(runtime / 'config/start-recovered-3047.sh')], {**environment, 'PATH': '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'})
raise SystemExit('Unsupported demo version. Original data has not been changed.')
