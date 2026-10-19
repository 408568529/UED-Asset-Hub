import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { snapshotDependencyTree, restoreDependencyLinks } from './competition-dependency-tree.mjs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { prepareCompetitionPackage } from './competition-prepare-package.mjs';
import { localDistributionEnvironment } from './competition-launcher.mjs';
const [packageRoot, sourceRoot, git] = process.argv.slice(2);
if (!packageRoot || !sourceRoot || !git) throw new Error('Provide a prepared package, official pinned DSH source and portable Git executable.');
const environment = localDistributionEnvironment({ ASSET_HUB_RUNTIME_DIR: path.join(packageRoot, 'unused-test-runtime'), HOST_PORT: '3247' }, packageRoot, path.join(packageRoot, 'unused-test-data'));
assert.equal(environment.GIT_CONFIG_GLOBAL, process.platform === 'win32' ? 'NUL' : os.devNull);
assert.equal(execFileSync(git, ['-C', sourceRoot, 'rev-parse', 'HEAD'], { env: environment, encoding: 'utf8' }).trim(), 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e');
assert.equal(execFileSync(git, ['-C', sourceRoot, 'status', '--porcelain=v1'], { env: environment, encoding: 'utf8' }).trim(), '');
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ued-git-source-test-')));
try {
  const cleanSource = path.join(temporary, 'clean-source'), restored = path.join(temporary, 'restored');
  execFileSync(git, ['clone', '--no-hardlinks', '--no-checkout', '--config', 'core.symlinks=true', sourceRoot, cleanSource], { env: environment, stdio: 'pipe' });
  execFileSync(git, ['-C', cleanSource, 'checkout', '--detach', 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'], { env: environment, stdio: 'pipe' });
  const links = await snapshotDependencyTree(cleanSource, restored);
  await restoreDependencyLinks(restored, links, null, true);
  assert.equal(execFileSync(git, ['-C', restored, 'status', '--porcelain=v1'], { env: environment, encoding: 'utf8' }).trim(), '');
} finally { await rm(temporary, { recursive: true, force: true }); }
await prepareCompetitionPackage(packageRoot);
console.log('PASS: portable native Git ignores inherited global configuration and validates exact clean pinned DSH source. Restored Git-tracked directory symlinks also preserve a clean checkout; complete package source/runtime authority validation passed; no credentials read or services started.');
