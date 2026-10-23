import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DEFAULT_BRIEF, normalizeBrief, formattedPrompt, draftChanges, inspectDraft, paletteFromPixels} from '../public/studio.mjs';
import {DEMO_DRAFT} from '../public/demo.mjs';
import {parseOutput,validateTurn,buildMessages,askProvider} from '../src/provider.mjs';
import {validateProject} from '../src/projects.mjs';

const result=()=>({title:'局部调整',reply:'把主体换成猫，其他保持。',draft:structuredClone(DEMO_DRAFT),suggestions:[],observations:[],understanding:'只修改主体与必要的构图',assumptions:['建议保持当前比例'],editedFields:['subject','composition']});
test('old projects get compatible creative defaults and malformed enum values are rejected',()=>{
  assert.deepEqual(normalizeBrief(),DEFAULT_BRIEF);
  for(const bad of [{referenceMode:'unknown'},{target:'javascript:'},{editMode:'all'},{goal:'x'.repeat(801)},null])assert.throws(()=>normalizeBrief(bad));
});
test('focused edits preserve every field outside the declared change plan',()=>{
  const raw=result();raw.draft.fields.subject={zh:'窗边的猫',en:'A cat by the window'};raw.draft.fields.style={zh:'被意外改成油画',en:'Unwanted oil painting'};raw.draft.aspectRatio='16:9';
  const output=parseOutput(JSON.stringify(raw),DEMO_DRAFT,[],normalizeBrief());
  assert.equal(output.draft.fields.subject.zh,'窗边的猫');assert.deepEqual(output.draft.fields.style,DEMO_DRAFT.fields.style);assert.equal(output.draft.aspectRatio,'4:5');
  assert.equal(output.understanding,raw.understanding);assert.deepEqual(output.assumptions,raw.assumptions);
});
test('redesign permits broader updates while locks remain enforced',()=>{
  const raw=result();raw.draft.fields.style={zh:'水彩',en:'Watercolor'};raw.draft.fields.lighting={zh:'霓虹灯',en:'Neon'};
  const output=parseOutput(JSON.stringify(raw),DEMO_DRAFT,['lighting'],normalizeBrief({editMode:'redesign'}));
  assert.equal(output.draft.fields.style.zh,'水彩');assert.deepEqual(output.draft.fields.lighting,DEMO_DRAFT.fields.lighting);
});
test('invalid change plans are rejected and legacy complete model output remains compatible',()=>{
  const raw=result();raw.editedFields=['__proto__'];assert.throws(()=>parseOutput(JSON.stringify(raw),DEMO_DRAFT,[]));
  delete raw.editedFields;assert.ok(parseOutput(JSON.stringify(raw),null,[]).draft);assert.throws(()=>parseOutput(JSON.stringify(raw),DEMO_DRAFT,[]));
});
test('Midjourney export appends supported parameters and neutralizes accidental parameter text in fields',()=>{
  const draft=structuredClone(DEMO_DRAFT);draft.fields.subject.en='A cat --seed 123';draft.avoid.en='watermarks, text --v 999';
  const text=formattedPrompt(draft,'en','midjourney');assert.ok(text.includes('--ar 4:5'));assert.ok(text.includes('--no watermarks'));assert.ok(!text.includes('--seed'));assert.ok(!text.includes('--v '));
  assert.equal((text.match(/--ar/g)||[]).length,1);
  assert.ok(!formattedPrompt(draft,'en','universal').includes('--ar 4:5'));
});
test('text checks report missing bilingual information without assigning fake quality scores',()=>{
  const draft=structuredClone(DEMO_DRAFT);draft.fields.subject.en='';draft.fields.composition={zh:'',en:''};
  const issues=inspectDraft(draft);assert.ok(issues.some(i=>i.key==='subject'));assert.ok(issues.some(i=>i.key==='composition'));assert.deepEqual(inspectDraft(DEMO_DRAFT),[]);
});
test('version comparisons include exact field, negative and ratio changes',()=>{
  const next=structuredClone(DEMO_DRAFT);next.fields.subject.zh='猫';next.avoid.zh='文字';next.aspectRatio='9:16';
  assert.deepEqual(draftChanges(DEMO_DRAFT,next).map(d=>d.key),['subject','avoid','aspectRatio']);assert.deepEqual(draftChanges(DEMO_DRAFT,DEMO_DRAFT),[]);
});
test('local palette extraction ignores transparent pixels and returns image-derived distinct colors',()=>{
  assert.deepEqual(paletteFromPixels(Uint8ClampedArray.from([255,0,0,255,255,0,0,255,0,0,255,255,0,255,0,0])),['#ff0000','#0000ff']);
  assert.deepEqual(paletteFromPixels(new Uint8ClampedArray()),[]);
});
test('creative goals, reference roles and edit policy reach the provider context',()=>{
  const turn=validateTurn({message:'更自然一点',messages:[],locks:[],scope:['lighting'],brief:{goal:'做一张产品封面',purpose:'product',referenceMode:'composition',editMode:'refine',target:'midjourney'}});
  const messages=buildMessages(turn);assert.ok(messages[0].content.includes('editedFields'));assert.ok(messages.at(-1).content[0].text.includes('做一张产品封面'));assert.ok(messages.at(-1).content[0].text.includes('composition'));
});
test('native JSON mode is opt-in and sends no extra requests',async()=>{
  let calls=0,payload;
  await askProvider({baseUrl:'https://provider.example/v1',apiKey:'fake',model:'vision',jsonMode:true},validateTurn({message:'一只猫',messages:[],locks:[],scope:[]}),{fetchImpl:async(url,options)=>{calls++;payload=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result())}}]}));}});
  assert.equal(calls,1);assert.deepEqual(payload.response_format,{type:'json_object'});
});
test('project validation preserves coaching metadata, defaults old data and strips unrelated secret fields',()=>{
  const id=randomUUID(),p={id,title:'旧创作',mode:'live',created:Date.now(),updated:Date.now(),scope:[],locks:[],messages:[{role:'assistant',text:'建议',understanding:'理解',assumptions:['推测'],changeLabels:['更新主体']}],revisions:[{id:randomUUID(),created:Date.now(),draft:DEMO_DRAFT,changes:['第一版']}],observations:[],apiKey:'do-not-keep'};
  const output=validateProject(p,id);assert.deepEqual(output.brief,DEFAULT_BRIEF);assert.equal(output.apiKey,undefined);assert.deepEqual(output.messages[0].assumptions,['推测']);assert.equal(output.schemaVersion,2);
});
