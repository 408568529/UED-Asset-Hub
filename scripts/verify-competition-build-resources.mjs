import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runBuild, cleanupBuild, processIdentity } from './competition-build-resources.mjs';
assert.notEqual(processIdentity({pid: 7, started: 'old', command: 'same'}), processIdentity({pid: 7, started: 'new', command: 'same'}), 'Reused PID and command must not inherit ownership');
const scope = await realpath(await mkdtemp(path.join(tmpdir(), 'ued-resource-test-')));
const digest = value => createHash('sha256').update(value).digest('hex');
try {
  const work = path.join(scope, 'one');
  const command = `const f=require('fs'),p=require('path');f.mkdirSync(${JSON.stringify(work)});for(const name of ['source','payload','temp'])f.mkdirSync(p.join(${JSON.stringify(work)},name));f.writeFileSync(p.join(${JSON.stringify(work)},'source','intermediate'),'owned');f.writeFileSync(p.join(${JSON.stringify(work)},'temp','sample'),'temporary');`;
  const record = await runBuild({ scope, work, disposable: ['source','payload','temp'], command: process.execPath, args: ['-e', command] });
  await assert.rejects(runBuild({scope,work,disposable:[],command:process.execPath}), /already exists/);
  const final = path.join(scope,'saved'); await mkdir(final);
  const files=[]; const zipHash=digest('actual-zip-fixture');
  for(const [role,value] of Object.entries({zip:'actual-zip-fixture',sha256:zipHash+'  archive.zip\n',manifest:'{"source":"fixture"}',acceptance:'{"newMachine":"NOT_VERIFIED"}',dependencies:'verified-fixture'})){
    const file=path.join(final,role);await writeFile(file,value);files.push({role,path:file,sha256:digest(value)});
  }
  const gate=path.join(final,'gate.json');await writeFile(gate,JSON.stringify({schemaVersion:1,files,protectedPaths:[path.join(work,'payload')]}));
  await writeFile(files[0].path,'tampered');await assert.rejects(cleanupBuild(record,gate),/hash mismatch/);await access(path.join(work,'source'));
  await writeFile(files[0].path,'actual-zip-fixture');
  await mkdir(path.join(work,'temp','dsh-home'));await writeFile(path.join(work,'temp','dsh-home','preserved'),'state');
  const result=await cleanupBuild(record,gate);assert.equal(typeof result.usedBeforeCleanup,'number');assert.equal(typeof result.usedAfterCleanup,'number');assert.equal(typeof result.buildDisk.maximumUsedObserved,'number');assert.equal(result.removed.length,1);assert.equal(result.skipped.length,2);await assert.rejects(access(path.join(work,'source')));await access(files[0].path);await access(path.join(work,'temp','dsh-home','preserved'));
  const failed=path.join(scope,'failed');await assert.rejects(runBuild({scope,work:failed,disposable:['source'],command:process.execPath,args:['-e',`require('fs').mkdirSync(${JSON.stringify(failed)});process.exit(7)`]}),/Build failed/);await access(failed);
  const other=path.join(scope,'other'), slow=path.join(scope,'slow');
  const running=runBuild({scope,work:slow,disposable:[],command:process.execPath,args:['-e','setTimeout(()=>{},1200)']});
  await new Promise(r=>setTimeout(r,300));await assert.rejects(runBuild({scope,work:other,disposable:[],command:process.execPath,args:['-e','']}),e=>e.code==='EEXIST');await running;
  const linked=path.join(scope,'link');await symlink(final,linked,process.platform==='win32'?'junction':'dir');
  await assert.rejects(runBuild({scope:linked,work:path.join(linked,'new'),disposable:[],command:process.execPath}),/Linked/);
  console.log('PASS: ownership, exclusive build lock, reused owned cache, failure retention, evidence tamper, referenced/protected directories, bounded cleanup, disk accounting, linked ancestors.');
} finally { await rm(scope,{recursive:true,force:true}); }
