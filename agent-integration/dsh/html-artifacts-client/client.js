window.__ModuleLoader__.load({id:'@ued/html-artifacts-client',factory:require=>{
  const React=require('react'),h=React.createElement;
  function meta(block){
    let value=block?.meta;
    if(block?.isError)return;
    if(value?.card!=='html-artifact'){
      const markers=(block?.content??[]).filter(x=>x.type==='text').flatMap(x=>x.text.split(/\r?\n/)).filter(x=>x.startsWith('<!--ued-html-receipt:')&&x.endsWith('-->'));
      if(markers.length!==1||markers[0].length>4096)return;
      try{const b=markers[0].slice(21,-3).replace(/-/g,'+').replace(/_/g,'/');value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b.padEnd(Math.ceil(b.length/4)*4,'=')),x=>x.charCodeAt(0))));}catch{return;}
    }
    if(value?.card==='html-artifact'&&typeof value.title==='string'&&value.title.length<=200&&/^[a-z0-9][a-z0-9-]{2,79}$/.test(value.artifactId)&&/^v-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.versionId))return value;
  }
  async function access(value,sessionId,signal){
    const request=()=>fetch('/html-artifacts/host-control/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({artifact_id:value.artifactId,version_id:value.versionId,session_id:String(sessionId)}),signal});
    let response=await request();
    if(response.status===403){
      const resumed=await fetch('/api/session.models',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID?.()??String(Date.now()),method:'session.models',payload:{sessionId:String(sessionId)}}),signal});
      if(resumed.ok)response=await request();
    }
    const result=await response.json();if(!response.ok)throw Error(result.error??'预览暂不可用。');
    for(const key of ['preview_url','app_url','download_url']){const u=new URL(result[key],location.origin);if(u.origin!==location.origin||!u.pathname.startsWith('/html-artifacts/'))throw Error('预览链接无效。');}
    return result;
  }
  const css='.ued-html-card{border:1px solid var(--dsw-alias-border-l1,#444);border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-base,#171717);color:inherit;margin:12px 0}.ued-html-head{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,#444)}.ued-html-title{flex:1;min-width:140px}.ued-html-title strong{display:block;font-size:14px}.ued-html-title small{opacity:.65;font-size:11px}.ued-html-card button,.ued-html-card a{font:inherit;font-size:12px;cursor:pointer;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l1,#777);border-radius:6px;padding:5px 9px;text-decoration:none}.ued-html-card iframe{display:block;width:100%;height:580px;border:0;background:#fff}.ued-html-card:fullscreen{display:flex;flex-direction:column;width:100vw;height:100dvh;border:0;border-radius:0}.ued-html-card:fullscreen iframe{flex:1;height:auto;min-height:0}.ued-html-status{padding:24px;font-size:13px;opacity:.8}.ued-html-note{padding:7px 14px;font-size:11px;opacity:.65;border-top:1px solid var(--dsw-alias-border-l1,#444)}';
  function HtmlCard({block,sessionId}){
    const value=meta(block),[links,setLinks]=React.useState(null),[error,setError]=React.useState(''),[attempt,retry]=React.useState(0),ref=React.useRef(null);
    React.useEffect(()=>{setLinks(null);setError('');if(!value)return;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);access(value,sessionId,controller.signal).then(setLinks).catch(e=>{if(!controller.signal.aborted)setError(e.message);else setError('预览加载超时，请重试。');}).finally(()=>clearTimeout(timer));return()=>{clearTimeout(timer);controller.abort();};},[value?.artifactId,value?.versionId,String(sessionId),attempt]);
    if(!value)return h('div',{className:'ued-html-status'},block?.isError?'HTML 成果交付未完成，请查看上方操作结果。':'正在准备 HTML 成果…');
    return h('section',{className:'ued-html-card',ref,'aria-label':'HTML 成果：'+value.title},h('style',null,css),h('div',{className:'ued-html-head'},h('div',{className:'ued-html-title'},h('strong',null,value.title),h('small',null,'HTML 成果 · '+value.versionId.slice(0,10))),h('button',{onClick:()=>retry(x=>x+1)},'刷新'),h('button',{onClick:()=>ref.current?.requestFullscreen?.().catch(()=>setError('当前浏览器不支持全屏，请在新标签打开。'))},'全屏'),links&&h('a',{href:links.app_url,target:'_blank',rel:'noopener noreferrer'},'新标签打开'),links&&h('a',{href:links.download_url,download:true},'下载 ZIP')),error&&!links?h('div',{className:'ued-html-status',role:'alert'},error):links?h('iframe',{title:value.title,src:links.preview_url,sandbox:'allow-scripts allow-downloads allow-modals allow-forms',allow:'fullscreen *',referrerPolicy:'no-referrer',loading:'lazy'}):h('div',{className:'ued-html-status',role:'status'},'正在加载 HTML 预览…'),h('div',{className:'ued-html-note'},error&&links?error:'原生 HTML 预览 · 保留模板样式和本地交互 · 历史版本独立保存'));
  }
  return {inject:['slots'],apply(ctx){ctx.slots.inject('tool.call.toolview',function*(){yield ctx.slots.register({name:'tool.call.toolview',key:'html_present'},HtmlCard);});}};
}});
