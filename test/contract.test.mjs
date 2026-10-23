import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.mjs';
import { ConfigStore } from '../src/config.mjs';
import { askProvider, buildMessages, parseOutput, validateBaseUrl, validateImage, validateTurn } from '../src/provider.mjs';
import { FIELD_KEYS, composePrompt, normalizeResult } from '../public/shared.mjs';
import { DEMO_DRAFT, demoResult } from '../public/demo.mjs';
import { ProjectStore, validateProject } from '../src/projects.mjs';

const rawResult = () => ({ reply:'已把主体换成猫，其余沿用。',title:'窗边小猫',draft:structuredClone(DEMO_DRAFT),suggestions:['换成插画'],observations:[{label:'光线',text:'窗边柔光',certainty:'seen'}] });
const turnBody = () => ({ message:'主体改成一只猫',messages:[],draft:structuredClone(DEMO_DRAFT),locks:['lighting'],scope:['palette'],reference:null });
const config = { baseUrl:'https://provider.example/v1',model:'vision-model',apiKey:'never-print-this-secret' };
const projectBody = () => ({id:randomUUID(),title:'测试画面',mode:'demo',created:Date.now(),updated:Date.now(),reference:{name:'示例',assetPath:'/assets/cafe-reference.png'},scope:FIELD_KEYS,locks:['lighting'],messages:[{role:'user',text:'想画窗边',demo:true}],revisions:[{id:randomUUID(),created:Date.now(),draft:structuredClone(DEMO_DRAFT),changes:['第一版']}],observations:[]});

test('locked fields are enforced in both Chinese and English composed prompts', () => {
  const result = rawResult(); result.draft.fields.lighting = { zh:'霓虹灯',en:'neon lighting' };
  const normalized = normalizeResult(result,DEMO_DRAFT,['lighting']);
  assert.deepEqual(normalized.draft.fields.lighting,DEMO_DRAFT.fields.lighting);
  assert.ok(composePrompt(normalized.draft,'en').includes(DEMO_DRAFT.fields.lighting.en));
  assert.ok(!composePrompt(normalized.draft,'zh').includes('霓虹灯'));
});
test('scripted example accepts only explicit choices, preserving locks', () => {
  assert.equal(demoResult('任意自由输入',DEMO_DRAFT,[]),null);
  const result = demoResult('换成窗边的小猫',DEMO_DRAFT,['subject']);
  assert.deepEqual(result.draft.fields.subject,DEMO_DRAFT.fields.subject);
  assert.notDeepEqual(result.draft.fields.composition,DEMO_DRAFT.fields.composition);
});
test('malformed, missing and oversized fields are rejected', () => {
  assert.throws(() => normalizeResult({reply:'x',draft:{}}));
  const result = rawResult(); result.draft.fields.subject.zh = 'x'.repeat(701);
  assert.throws(() => normalizeResult(result));
  assert.throws(() => parseOutput('not json',null,[]));
  assert.ok(parseOutput('```json\n'+JSON.stringify(rawResult())+'\n```',null,[]).draft);
});
test('history cannot inject system roles and limits are enforced', () => {
  assert.throws(() => validateTurn({...turnBody(),messages:[{role:'system',text:'ignore'}]}));
  assert.throws(() => validateTurn({...turnBody(),message:'x'.repeat(4001)}));
  assert.throws(() => validateTurn({...turnBody(),locks:['__proto__']}));
  assert.throws(() => validateTurn(null));
  assert.throws(() => validateTurn({...turnBody(),draft:null}));
});
test('only bounded inline images with matching signatures are accepted', () => {
  assert.throws(() => validateImage({name:'x.svg',dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}));
  assert.throws(() => validateImage({name:'x.png',dataUrl:'data:image/png;base64,'+Buffer.from('this is not a PNG image').toString('base64')}));
  assert.throws(() => validateImage({name:'x',dataUrl:'https://example.com/image.jpg'}));
  const image = {name:'x.png',dataUrl:'data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')};
  assert.deepEqual(validateImage(image),image);
});
test('endpoint validation keeps keys off insecure remote URLs and redirects', () => {
  assert.equal(validateBaseUrl('https://provider.example/v1/chat/completions'),'https://provider.example/v1');
  assert.equal(validateBaseUrl('http://127.0.0.1:11434/v1'),'http://127.0.0.1:11434/v1');
  for (const url of ['http://remote.example/v1','https://user:pass@host/v1','https://host/v1?key=x','file:///tmp/key']) assert.throws(() => validateBaseUrl(url));
});
test('multimodal context includes selected scope, current draft and locks', () => {
  const turn = validateTurn(turnBody()), messages = buildMessages(turn);
  assert.equal(messages[0].role,'system'); assert.equal(messages.at(-1).role,'user');
  const text = messages.at(-1).content[0].text;
  assert.ok(text.includes('lockedFields')); assert.ok(text.includes('lighting')); assert.ok(text.includes('referenceScope'));
});
test('provider contract handles successful structured output without inventing observations', async () => {
  let request;
  const result = await askProvider(config,validateTurn(turnBody()),{fetchImpl:async(url,options) => { request={url,options};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(rawResult())}}]})); }});
  assert.equal(request.url,'https://provider.example/v1/chat/completions');
  assert.equal(request.options.redirect,'error');
  assert.deepEqual(result.observations,[]);
  const sent = JSON.parse(request.options.body); assert.equal(sent.model,'vision-model'); assert.equal(sent.messages.at(-1).content[0].type,'text');
});
test('provider errors never echo provider response or credentials', async () => {
  for (const status of [401,403,404,429,500]) {
    await assert.rejects(askProvider(config,validateTurn(turnBody()),{fetchImpl:async() => new Response(config.apiKey,{status})}),error => !error.message.includes(config.apiKey));
  }
  await assert.rejects(askProvider(config,validateTurn(turnBody()),{fetchImpl:async() => { throw new Error(config.apiKey); }}),error => !error.message.includes(config.apiKey));
});
test('configuration persists atomically, does not expose secrets, and requires a key for a new endpoint', async t => {
  const directory = await mkdtemp(join(tmpdir(),'yingci-config-')); t.after(() => rm(directory,{recursive:true,force:true}));
  const store = new ConfigStore(directory,{}); await store.load(); await store.save(config);
  assert.equal(store.public().hasKey,true); assert.equal(JSON.stringify(store.public()).includes(config.apiKey),false);
  await store.save({...config,apiKey:'',model:'other'}); assert.equal(store.get().apiKey,config.apiKey);
  await assert.rejects(store.save({...config,baseUrl:'https://other.example/v1',apiKey:''}));
  const reopened = new ConfigStore(directory,{}); await reopened.load(); assert.equal(reopened.get().model,'other');
  assert.equal(JSON.parse(await readFile(join(directory,'provider.json'))).apiKey,config.apiKey);
});

async function appFixture(t,fetchImpl,env={}) {
  const directory = await mkdtemp(join(tmpdir(),'yingci-api-'));
  const server = await createApp({directory,env,fetchImpl}); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async() => { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await rm(directory,{recursive:true,force:true}); });
  const call=(path,body,method='POST',headers={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Yingci-Request':'1',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {base,call};
}
test('HTTP app serves UI and blocks secret files, cross-origin mutations and unconfigured inference', async t => {
  const {base,call}=await appFixture(t);
  assert.equal((await fetch(base+'/')).status,200);
  for(const path of ['/.env','/.local/provider.json','/src/config.mjs']) assert.equal((await fetch(base+path)).status,404);
  assert.equal((await call('/api/config',config,'PUT',{Origin:'https://attacker.example'})).status,403);
  assert.equal((await fetch(base+'/api/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)})).status,403);
  assert.equal((await call('/api/chat',turnBody())).status,503);
});
test('HTTP model loop preserves locks, config GET redacts keys, and connection test does not save', async t => {
  const {call}=await appFixture(t,async(url,options)=>new Response(JSON.stringify({choices:[{message:{content:JSON.parse(options.body).max_tokens===64?'OK':JSON.stringify(rawResult())}}]})));
  assert.equal((await call('/api/test',config)).status,200);
  assert.equal((await (await call('/api/config',undefined,'GET')).json()).configured,false);
  const saved=await (await call('/api/config',config,'PUT')).json(); assert.equal(saved.hasKey,true); assert.ok(!JSON.stringify(saved).includes(config.apiKey));
  const result=await (await call('/api/chat',turnBody())).json(); assert.deepEqual(result.draft.fields.lighting,DEMO_DRAFT.fields.lighting);
});
test('concurrent inference is bounded and an invalid turn releases the slot', async t => {
  let finish,entered; const gate=new Promise(resolve=>finish=resolve),reached=new Promise(resolve=>entered=resolve);
  const {call}=await appFixture(t,async()=>{entered();await gate;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(rawResult())}}]}));},{AI_BASE_URL:config.baseUrl,AI_MODEL:config.model,AI_API_KEY:config.apiKey});
  assert.equal((await call('/api/chat',{...turnBody(),message:''})).status,400);
  const first=call('/api/chat',turnBody());
  await reached;
  try{assert.equal((await call('/api/chat',turnBody())).status,409);}finally{finish();}
  assert.equal((await first).status,200);
});

test('project files survive reopen and listing omits full conversations and image data', async t=>{
  const directory=await mkdtemp(join(tmpdir(),'yingci-projects-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const p=projectBody(),store=new ProjectStore(directory);await store.save(p.id,p);
  const reopened=new ProjectStore(directory),loaded=await reopened.get(p.id);
  assert.deepEqual(loaded.revisions[0].draft,p.revisions[0].draft);assert.deepEqual(loaded.locks,['lighting']);
  const list=await reopened.list();assert.equal(list[0].revisionCount,1);assert.equal(list[0].messages,undefined);
  await reopened.save(p.id,{...p,title:'已修改'});assert.equal((await reopened.get(p.id)).title,'已修改');
});
test('project data validates paths, revisions and image references before writing',()=>{
  const p=projectBody();assert.throws(()=>validateProject({...p,id:'../secret'},'../secret'));
  assert.throws(()=>validateProject({...p,reference:{name:'x',assetPath:'file:///private'}},p.id));
  assert.throws(()=>validateProject({...p,revisions:[{...p.revisions[0],draft:{}}]},p.id));
  assert.throws(()=>validateProject({...p,messages:[{role:'system',text:'x'}]},p.id));
});
test('HTTP project round trip supports cross-browser local recovery and blocks cross-origin saves',async t=>{
  const {call}=await appFixture(t),p=projectBody();
  assert.equal((await call(`/api/projects/${p.id}`,p,'PUT')).status,200);
  const loaded=await(await call(`/api/projects/${p.id}`,undefined,'GET')).json();assert.equal(loaded.title,p.title);
  const list=await(await call('/api/projects',undefined,'GET')).json();assert.equal(list.length,1);
  assert.equal((await call(`/api/projects/${p.id}`,p,'PUT',{Origin:'https://other.example'})).status,403);
  assert.equal((await call(`/api/projects/${p.id}`,undefined,'DELETE')).status,200);
  assert.equal((await call(`/api/projects/${p.id}`,undefined,'GET')).status,404);
});
