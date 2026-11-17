import assert from'node:assert/strict';
import{registerNativeHaldurSkill}from'../agent-integration/dsh/html-artifacts/native-skill.mjs';
let provider;const requests=[];registerNativeHaldurSkill({skills:{registerProvider(factory){provider=factory({});}}},async(route,query)=>{requests.push([route,query.get('path'),query.get('offset')]);return query.get('offset')==='0'?{content:'# Skill\n',sha256:'same',nextOffset:8}:{content:'Current instructions',sha256:'same',nextOffset:null};});
const catalog=await provider.list();assert.equal(catalog[0].name,'haldur-design-skill');assert.equal(catalog[0].resourceBase.kind,'opaque');assert.ok(!JSON.stringify(catalog).includes('D:'));
const value=await provider.get(catalog[0]);assert.equal(value.content,'# Skill\nCurrent instructions');assert.equal(requests.length,2);assert.ok(requests.every(x=>x[1]==='SKILL.md'));
let changed;registerNativeHaldurSkill({skills:{registerProvider(factory){changed=factory({});}}},async(_route,q)=>q.get('offset')==='0'?{content:'one',sha256:'one',nextOffset:3}:{content:'two',sha256:'two',nextOffset:null});await assert.rejects(changed.get((await changed.list())[0]),/更新/);
console.log('PASS_NATIVE_HARNESS_SKILL_PROVIDER_FULL_BODY_AND_HASH');
