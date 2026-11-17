import { access, copyFile, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
export const htmlRuntimePackages = {
  'html-artifacts': ['package.json','index.mjs','store.mjs','regions.mjs','http.mjs'],
  'html-artifacts-client': ['package.json','index.mjs','client.js']
};
export async function installHtmlArtifacts({ projectDir, runtimePaths, ensureRuntimeSubdirectory, publicOrigin }) {
  const require = createRequire(path.join(projectDir,'package.json'));
  const runtimeRequire = createRequire(path.join(process.env.DSH_RUNTIME_SOURCE_DIR || process.env.DSH_SOURCE_DIR,'apps/cli/package.json'));
  const bindings = { archive:require.resolve('archiver'), tools:runtimeRequire.resolve('@deepseek-ai/dsh-tools'), session:runtimeRequire.resolve('@deepseek-ai/dsh-session'), publicOrigin:new URL(publicOrigin).origin };
  for (const [name, files] of Object.entries(htmlRuntimePackages)) {
    const destination = await ensureRuntimeSubdirectory({ dataRoot:runtimePaths.dataRoot, agentRoot:runtimePaths.agentRoot, relativePath:`dsh-home/profiles/web/node_modules/@ued/${name}` });
    for (const file of files) {
      const source = path.join(projectDir,'agent-integration/dsh',name,file), target=path.join(destination,file);
      await access(source);
      try { if ((await lstat(target)).isSymbolicLink()) throw Error('HTML runtime module cannot be a link.'); } catch(error) { if(error.code!=='ENOENT')throw error; }
      await copyFile(source,target);
    }
    if (name === 'html-artifacts') {
      const target=path.join(destination,'runtime-bindings.json');
      try { if ((await lstat(target)).isSymbolicLink()) throw Error('HTML runtime binding cannot be a link.'); } catch(error) { if(error.code!=='ENOENT')throw error; }
      await writeFile(target,JSON.stringify(bindings),{mode:0o600});
    }
  }
}
