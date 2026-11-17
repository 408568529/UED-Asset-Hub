// Native Harness catalog/loader; the provider reads current Hub Skill through
// the existing authenticated loopback gateway. No host filesystem tool is added.
export function registerNativeHaldurSkill(ctx, gateway) {
  const base={name:'haldur-design-skill',description:'Haldur 界面设计 Skill：根据需求和截图生成、修改或评审界面与 HTML 原型，按需引用组件规范、CSS/SCSS、模板和资源。',source:'asset-hub',provider:'asset-hub-haldur',invocation:{modelInvocable:true,userInvocable:true},resourceBase:{kind:'opaque',description:'当前 Hub Haldur Skill 根目录。引用的相对文件可用 get_haldur_skill_document 按需读取；需要定位时可用 search_haldur_skill。生成内容保存在会话成果中，原资料只读。'}};
  ctx.skills.registerProvider(()=>({
    name:base.provider,
    async list(){return [{...base,rank:300,locator:'SKILL.md'}];},
    async get(candidate){
      if(candidate.locator!=='SKILL.md')return;
      let content='',offset=0,sha256;
      do{
        const q=new URLSearchParams({path:'SKILL.md',offset:String(offset)});if(sha256)q.set('sha256',sha256);
        const document=await gateway('/html-template/skill',q);
        if(sha256 && document.sha256!==sha256)throw Error('Skill 正文已更新，请重新加载。');
        sha256=document.sha256;content+=document.content;offset=document.nextOffset;
        if(content.length>4*1024*1024)throw Error('Skill 正文超出单文件读取范围。');
      }while(offset!==null);
      return {...base,content};
    }
  }));
}
