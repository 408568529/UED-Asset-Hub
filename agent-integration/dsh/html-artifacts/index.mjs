import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HtmlArtifacts } from './store.mjs';
import { createHtmlHttp } from './http.mjs';
export const name = 'html-artifacts';
export const inject = ['tools','systemPrompt','webServer','agents'];
const folder = path.dirname(fileURLToPath(import.meta.url));
export function toolDefinitions(store, copyTemplate) {
  const identity = exec => { if (!exec.agent) throw Error('HTML 成果需要当前 Agent 会话。'); return String(exec.agent.id); };
  const string = description => ({ type:'string', description });
  return [
    { name:'html_from_template', description:'Copy the existing Haldur list-page HTML and complete runtime resources into this session artifact. No template source enters model context; original Skill is read-only. Call once per artifact id, then inspect and patch the returned version. Local prototype data only; GenUI remains available for new React UI.', parameters:{ artifact_id:{ ...string('Stable lowercase kebab-case name, such as return-list.'), required:true }, title:{...string('Human-readable result title.'), required:true} }, execute:async(args, exec)=>store.create(identity(exec),args.artifact_id,args.title,await copyTemplate()) },
    { name:'html_inspect', description:'Inspect an owned HTML artifact. With no region/anchor/offset returns only file hashes and named anchors. Read list.rows/list.columns/page.heading or one unique literal anchor to see a bounded excerpt, not the whole template. Use its path and sha256 for exact patches. Offsets are UTF-16 indices.', parameters:{ artifact_id:{...string('Artifact id returned by html_from_template.'),required:true}, version_id:string('Pinned version; omitted selects current.'), path:string('Plain root-relative file path; omitted selects the template entry.'), region:string('Optional named region returned by inspection.'), anchor:string('Optional unique literal text, never a regex.'), offset:{type:'number',description:'Optional bounded excerpt start.'}, max_chars:{type:'number',description:'100–16000; default8000.'} }, execute:async(args,exec)=>store.inspect(identity(exec),args.artifact_id,args), isConcurrencySafe:()=>true },
    { name:'html_patch', description:'Apply 1–8 exact local text replacements to a copied artifact, with base version and original file hashes. Never writes back to Skill. Each old_text must occur exactly once. Read the relevant anchor first, modify business fields/rows/columns/actions without restating the full template. Saves a new version; invalid HTML/script syntax preserves the last good version. Then call html_present.', parameters:{ artifact_id:{...string('Owned artifact.'),required:true}, base_version:{...string('Current version from inspection.'),required:true}, changes:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{path:{type:'string',required:true},sha256:{type:'string',required:true},old_text:{type:'string',required:true},new_text:{type:'string',required:true}}}} }, execute:async(args,exec)=>store.patch(identity(exec),args.artifact_id,args.base_version,args.changes) },
    { name:'html_present', description:'Deliver an owned HTML version as a persistent preview card with fullscreen/new-tab and complete ZIP download. Does not compile or convert HTML into React. Call as final step after patching and checking the required excerpts; existing local JavaScript/relative CSS run inside the sandbox. Do not claim a visual/browser check unless actually performed.', parameters:{artifact_id:{...string('Owned artifact.'),required:true},version_id:string('Exact version; omitted selects current.')}, execute:async(args,exec)=>store.receipt((await store.version((await import('./store.mjs')).scopedId(identity(exec),args.artifact_id),args.version_id,identity(exec))).manifest), isConcurrencySafe:()=>true, present:true }
  ];
}
export async function apply(ctx) {
  const bindings = JSON.parse(await fs.readFile(path.join(folder,'runtime-bindings.json'),'utf8'));
  const { defineTool } = await import(pathToFileURL(bindings.tools).href);
  const { SessionId } = await import(pathToFileURL(bindings.session).href);
  const store = new HtmlArtifacts(path.join(process.env.DSH_HOME,'html-artifacts')); await store.init();
  const copyTemplate = async () => {
    const base = new URL(process.env.ASSET_HUB_MCP_URL);
    if (base.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(base.hostname)) throw Error('模板复制接口未配置。');
    const response = await fetch(new URL('/html-template/list-page',base),{signal:AbortSignal.timeout(14000)});
    if (!response.ok || !response.body) throw Error('完整模板或资源暂时不可用，请稍后重试。');
    const reader=response.body.getReader(), chunks=[];let size=0;
    try { for(;;){const value=await reader.read();if(value.done)break;size+=value.value.length;if(size>24*1024*1024)throw Error('模板包超过复制预算。');chunks.push(value.value);} }
    finally {await reader.cancel();}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  ctx.webServer.register({kind:'prefix',path:'/html-artifacts',handler:createHtmlHttp({store,publicOrigin:bindings.publicOrigin,archiveModule:bindings.archive,resolveSession:id=>ctx.agents.get(SessionId(id))})});
  ctx.systemPrompt.section({name:'tool:html-artifacts',order:119,text:'HTML artifact delivery is an authorized parallel channel to GenUI. For an existing Haldur list-page template use html_from_template → html_inspect relevant named/literal anchors → html_patch exact local changes → html_present. Do not convert that template to React or read the entire template into context. GenUI source/build rules apply to genui_* calls, not this HTML channel; GenUI remains appropriate for newly generated React UI. Skill source remains read-only. Reuse the returned artifact/version ids for later edits. Inspect file hashes before patching; missing anchors are gaps, never permission to fabricate a successful change. html_present is the final delivery card. Use only local prototype data; real business APIs are not connected.'});
  for (const tool of toolDefinitions(store,copyTemplate)) {
    ctx.tools.register(defineTool({name:tool.name,description:tool.description,parameters:tool.parameters,isConcurrencySafe:tool.isConcurrencySafe,output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value,null,2)+(tool.present?'\n<!--ued-html-receipt:'+Buffer.from(JSON.stringify({card:'html-artifact',artifactId:value.artifact_id,versionId:value.version_id,title:value.title})).toString('base64url')+'-->':'')}],...(tool.present?{presentationMeta:(_args,value)=>({card:'html-artifact',artifactId:value.artifact_id,versionId:value.version_id,title:value.title})}:{})},async execute(args,exec){try{const value=await tool.execute(args,exec);if(tool.present)exec.concludeTurn();return value;}catch(error){ctx.logger?.warn('HTML artifact operation failed: '+tool.name);throw Error(error instanceof Error&&!/ENOENT|EACCES|[A-Z]:\\|\/Users\//.test(error.message)?error.message:'HTML 成果操作未完成；原资料和已发布版本保持不变。');}}}));
  }
}
