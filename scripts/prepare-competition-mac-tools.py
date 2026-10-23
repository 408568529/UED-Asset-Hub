#!/usr/bin/env python3
"""Maintainer-only native tools preparation. No user DATA or installed runtime is read."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import tarfile
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--destination', required=True, type=Path)
args = parser.parse_args()
root = args.destination.resolve()
source = Path(__file__).resolve().parent.parent
if platform.system() != 'Darwin' or platform.machine() != 'arm64':
    raise SystemExit('Native macOS Apple Silicon is required.')
if root.exists():
    raise SystemExit('Tool preparation directory must be new.')
root.mkdir()
contract = json.loads((source / 'service/macos/competition-tools.json').read_text())
for name in ['node', 'git']:
    item = contract[name]
    archive = root / item['url'].rsplit('/', 1)[1]
    partial = archive.with_name(archive.name + '.incomplete')
    with urllib.request.urlopen(item['url'], timeout=60) as response, partial.open('wb') as target:
        while chunk := response.read(1024 * 1024):
            target.write(chunk)
    if hashlib.sha256(partial.read_bytes()).hexdigest() != item['archiveSha256']:
        raise SystemExit('Pinned tool archive SHA-256 mismatch.')
    partial.rename(archive)
    with tarfile.open(archive) as package:
        for member in package.getmembers():
            if member.name.startswith('/') or '..' in Path(member.name).parts:
                raise SystemExit('Unsafe official archive member.')
        package.extractall(root)
node_root = root / 'node-v22.23.2-darwin-arm64'
node = node_root / 'bin/node'
if hashlib.sha256(node.read_bytes()).hexdigest() != contract['node']['executableSha256']:
    raise SystemExit('Node executable does not match the verified official distribution.')
git_source = root / 'git-2.53.0'
git_root = root / 'git-tool'
flags = ['prefix=' + str(git_root), 'NO_GETTEXT=YesPlease', 'NO_CURL=YesPlease', 'NO_TCLTK=YesPlease', 'NO_OPENSSL=YesPlease', 'NO_PERL=YesPlease', 'NO_PYTHON=YesPlease', 'RUNTIME_PREFIX=YesPlease']
with (root / 'git-build.log').open('w') as log:
    subprocess.run(['make', '-j2', *flags], cwd=git_source, stdout=log, stderr=subprocess.STDOUT, check=True)
    subprocess.run(['make', 'install', *flags], cwd=git_source, stdout=log, stderr=subprocess.STDOUT, check=True)
git = git_root / 'bin/git'
subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', str(git)], check=True, capture_output=True)
version = subprocess.check_output([str(git), '--version'], text=True).strip()
assert version == 'git version 2.53.0'
libraries = subprocess.check_output(['/usr/bin/otool', '-L', str(git)], text=True)
linked_paths = '\n'.join(libraries.splitlines()[1:])
if '/opt/homebrew/' in linked_paths or '/usr/local/' in linked_paths or '/private/tmp/' in linked_paths:
    raise SystemExit('Portable Git links to a build-host-only library.')
assert 'arm64' in subprocess.check_output(['/usr/bin/lipo', '-archs', str(git)], text=True)
receipt = {'schemaVersion': 1, 'platform': 'darwin-arm64', 'nodeRoot': str(node_root), 'node': str(node), 'git': str(git), 'nodeArchiveSha256': contract['node']['archiveSha256'], 'nodeExecutableSha256': contract['node']['executableSha256'], 'gitArchiveSha256': contract['git']['archiveSha256'], 'gitExecutableSha256': hashlib.sha256(git.read_bytes()).hexdigest(), 'gitSourceArchive': str(root / 'git-2.53.0.tar.xz'), 'gitLicense': str(git_source / 'COPYING'), 'gitBuildFlags': flags, 'gitLinkedLibraries': libraries}
(root / 'tools-preparation.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'result': 'PASS', 'receipt': str(root / 'tools-preparation.json'), 'platform': 'darwin-arm64'}))
