// Maintainer build only. Ordinary installations consume these prepared offline assets.
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'delivery/competition/center');
await mkdir(out,{recursive:true});
const result=await build({absWorkingDir:root,entryPoints:['scripts/competition-center-ui.tsx'],bundle:true,minify:true,jsx:'automatic',platform:'browser',format:'iife',target:'es2020',outfile:path.join(out,'center.js'),define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked',metafile:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=[];
for(const name of ['scripts/competition-center-ui.tsx','scripts/competition-center-layout.css','scripts/build-competition-center-ui.mjs','src/components/knowledge/KnowledgeThemeProvider.tsx','src/components/knowledge/knowledge-theme.css','package-lock.json'])inputs.push({path:name,sha256:sha(await readFile(path.join(root,name)))});
const files=[];
for(const name of Object.keys(result.metafile.outputs)){const relative=path.relative(out,path.resolve(root,name));files.push({path:relative,sha256:sha(await readFile(path.join(out,relative)))});}
await writeFile(path.join(out,'manifest.json'),JSON.stringify({schemaVersion:1,inputs,files,themeSource:'KnowledgeThemeProvider + knowledge-theme.css; existing --uedv-* tokens',offline:true},null,2)+'\n');
console.log('Offline Ant Design launcher UI prepared; existing Hub tokens retained.');
