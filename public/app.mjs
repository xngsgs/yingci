import { FIELD_DEFS, FIELD_KEYS, describeChanges } from './shared.mjs';
import { hydrateIcons, icon } from './icons.mjs';
import { saveProject, listProjects, loadProject, deleteProject } from './storage.mjs';
import { DEMO_DRAFT, DEMO_CHOICES, DEMO_REPLY, DEMO_OBSERVATIONS, demoResult } from './demo.mjs';
import { DEFAULT_BRIEF, PURPOSES, REFERENCE_MODES, normalizeBrief, formattedPrompt, draftChanges, inspectDraft, paletteFromPixels } from './studio.mjs';
import { FEEDBACK_ISSUES } from './feedback.mjs';
import { mountWorkspace } from './workspace.mjs';
import { discardPendingTurn } from './requests.mjs';

const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
let project, config = { configured: false }, language = 'zh', promptView = 'preview', busy = false, controller, editKey, toastTimer, saveQueue = Promise.resolve();
let workspace;
let pendingTurn = null;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4200); }
function showDialog(id) { if (!$(id).open) $(id).showModal(); }
function currentDraft() { return project.revisions.at(-1)?.draft || null; }
function blankProject() { return { id: crypto.randomUUID(), title: '新的画面', mode: 'live', created: Date.now(), updated: Date.now(), reference: null, scope: ['composition','lighting','palette','style'], locks: [], messages: [], revisions: [], observations: [], brief:structuredClone(DEFAULT_BRIEF) }; }
function rememberId() { try { localStorage.setItem('yingci-last-project', project.id); } catch { /* Project files remain the primary store. */ } }
function persist() {
  project.updated = Date.now(); const snapshot = structuredClone(project); rememberId();
  $('save-state').textContent = '正在保存';
  saveQueue = saveQueue.catch(() => {}).then(() => saveProject(snapshot)).then(() => {
    if (project.id === snapshot.id) $('save-state').textContent = '已保存在本机';
  }).catch(error => { console.error('本机保存失败', error?.name, error?.message); $('save-state').textContent = '本机保存失败'; toast('本机保存未完成，请确认服务仍在运行，并导出重要提示词。'); });
  return saveQueue;
}
async function api(path, body, method = 'POST', signal) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-Yingci-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  let data;
  try { data = await response.json(); } catch { throw new Error('本机服务没有返回数据，请检查服务是否仍在运行。'); }
  if (!response.ok) throw new Error(data.error || '请求未完成，请重试。');
  return data;
}
function cancelRequest() {
  controller?.abort(); controller = null; busy = false;
  const restored = discardPendingTurn(pendingTurn,project?.id);
  if(restored!==null)$('message-input').value=restored;
  pendingTurn = null; renderBusy();
}
function renderBusy() {
  $('send-message').hidden = busy; $('cancel-message').hidden = !busy;
  $('message-input').disabled = busy;
  document.querySelectorAll('.suggestion').forEach(button => button.disabled = busy);
  $('messages').setAttribute('aria-busy', String(busy));
  $('aspect-ratio').disabled = busy;
  $('open-versions').disabled = busy || !project?.revisions.length;
  for (const id of ['edit-brief','output-target','undo-latest','compare-versions','rename-project']) $(id).disabled = busy;
  if(project) { $('undo-latest').disabled=busy||project.revisions.length<2; $('compare-versions').disabled=busy||project.revisions.length<2; }
  document.querySelectorAll('.lock-button,.field-text,.scope-option,.quick-action').forEach(button=>button.disabled=busy);
  for(const id of ['edit-avoid','attach-top','replace-reference','remove-reference','backup-project','import-project'])$(id).disabled=busy;
  workspace?.renderBusy(busy);
}
function renderMode() {
  const demo = project.mode === 'demo';
  $('connection-label').textContent = config.configured ? '模型已配置' : '连接模型';
  $('open-settings').classList.toggle('configured', config.configured);
  $('mode-badge').textContent = config.testMode ? '隔离联调' : demo ? '示例体验' : '自由创作';
  $('mode-description').textContent = config.testMode ? '当前是模拟模型测试页，返回值用于验证功能，不代表真实 AI 效果。' : demo ? '预设对话，带你了解整个创作过程。不会调用模型。' : config.configured ? '参考图与对话仅在发送时交给你选择的模型。' : '连接视觉模型，就能开始自己的图片分析与自由对话。';
  $('banner-action').textContent = demo && config.configured ? '继续自由创作' : config.configured ? '查看连接' : '连接自己的模型';
  $('composer-mode').textContent = demo ? '预设示例' : config.configured ? '自由对话' : '等待连接模型';
  $('privacy-note').textContent = demo ? '示例无需联网调用模型' : '发送时会上传参考图至所连接模型';
}
function renderReference() {
  const ref = project.reference;
  $('reference-preview').hidden = !ref; $('reference-caption').hidden = !ref; $('upload-empty').hidden = !!ref;
  if (ref) { const source=ref.dataUrl||ref.assetPath; if($('reference-image').getAttribute('src')!==source)$('reference-image').src=source; $('reference-image').alt = ref.name; $('reference-name').textContent = ref.name; }
  else { $('reference-image').removeAttribute('src'); $('palette-section').hidden=true; $('reference-size').textContent=''; }
  $('scope-options').replaceChildren(...FIELD_DEFS.map(field => {
    const button = el('button', 'scope-option'); button.type = 'button'; button.setAttribute('aria-pressed', String(project.scope.includes(field.key)));
    button.append(icon(project.scope.includes(field.key) ? 'check' : 'plus'), document.createTextNode(field.label));
    button.addEventListener('click', () => { if (busy) return; project.scope = project.scope.includes(field.key) ? project.scope.filter(k => k !== field.key) : [...project.scope, field.key]; renderReference(); persist(); });
    return button;
  }));
  $('observation-source').textContent = project.observations.length ? project.mode === 'demo' ? '示例拆解' : 'AI 分析' : '';
  if (!project.observations.length) $('observations').replaceChildren(el('p','helper', ref ? '发送想法后，助手会结合参考图寻找画面线索。' : '有参考图时，我们会一起看看它的光线、配色与构图。'));
  else $('observations').replaceChildren(...project.observations.map(observation => {
    const row = el('div','observation'), glyph = el('span','observation-icon'); glyph.append(icon(observation.label.includes('光') ? 'light' : observation.label.includes('色') ? 'palette' : 'image'));
    const body = el('div'), heading = el('strong','',observation.label);
    if (observation.certainty === 'inferred') heading.append(el('span','inference','推测'));
    body.append(heading, el('p','',observation.text)); row.append(glyph,body); return row;
  }));
}
function renderMessages(scroll = false) {
  const container = $('messages');
  const lastAssistant = project.messages.findLastIndex(message => message.role === 'assistant');
  container.replaceChildren();
  if (!project.messages.length) {
    const welcome = el('div','welcome-message'); welcome.append(el('h3','','你脑海里，是什么画面？'),el('p','','不完整也没关系。说一个主体、一种感觉，或者上传一张你喜欢的参考图，我们就能开始。'));
    const choices = el('div','welcome-ideas');
    ['我想画一只在窗边睡觉的猫','帮我设计一张安静的咖啡馆图片','还没想好，你帮我找找方向'].forEach(text => { const button = el('button','',text); button.addEventListener('click', () => { $('message-input').value = text; $('message-input').focus(); }); choices.append(button); });
    welcome.append(choices); container.append(welcome);
  }
  project.messages.forEach((message, index) => {
    if (message.role === 'note') { container.append(el('p','helper', message.text)); return; }
    const article = el('article',`message ${message.role}`), meta = el('div','message-meta');
    if (message.role === 'assistant') { const image = el('img'); image.src = '/assets/mark.svg'; image.alt = ''; meta.append(image, document.createTextNode('映词')); if (message.demo) meta.append(el('span','','预设示例')); }
    else meta.append(document.createTextNode('你'));
    article.append(meta,el('div','message-copy',message.text));
    if (message.understanding) article.insertBefore(el('div','understanding',message.understanding),article.lastChild);
    if (message.assumptions?.length) { const details=el('details','assumptions'),list=el('ul');details.append(el('summary','',`我补充的建议（${message.assumptions.length}）`));message.assumptions.forEach(text=>list.append(el('li','',text)));details.append(list);article.append(details); }
    if (message.changeLabels?.length) {const labels=el('div','change-labels');message.changeLabels.forEach(text=>labels.append(el('span','',text)));article.append(labels);}
    if (message.suggestions?.length && index === lastAssistant) {
      const suggestions = el('div','suggestions');
      message.suggestions.forEach(text => { const button = el('button','suggestion',text); button.append(icon('arrow-right')); button.disabled = busy; button.addEventListener('click', () => sendMessage(text)); suggestions.append(button); });
      article.append(suggestions);
    }
    container.append(article);
  });
  if (busy) {
    const loading = el('article','message assistant loading'); loading.append(el('div','message-copy loading-dots','正在整理你的画面')); container.append(loading);
  }
  if (scroll) requestAnimationFrame(() => container.scrollTop = container.scrollHeight);
  const showQuick=lastAssistant<0 || !project.messages[lastAssistant].suggestions?.length;
  $('quick-actions').hidden=!showQuick;
  $('quick-actions').replaceChildren(...(project.mode==='demo'?DEMO_CHOICES:['更自然一些，保留现有主体','背景简洁一些，突出主体','你帮我决定一个合适的方向']).map(text=>{const button=el('button','quick-action',text);button.disabled=busy;button.addEventListener('click',()=>{$('message-input').value=text;$('message-input').focus();});return button;}));
}
function renderPrompt() {
  const draft = currentDraft(), revision = project.revisions.at(-1);
  $('prompt-empty').hidden = !!draft; $('prompt-content').hidden = !draft;
  $('version-label').textContent = revision ? `第 ${project.revisions.length} 版` : '尚无版本';
  $('open-versions').disabled = busy || !draft;
  if (!draft) return;
  $('draft-title').textContent = project.title;
  $('aspect-ratio').value = draft.aspectRatio;
  const previous = project.revisions.at(-2)?.draft;
  $('prompt-fields').replaceChildren(...FIELD_DEFS.map(field => {
    const locked = project.locks.includes(field.key), changed = previous && JSON.stringify(previous.fields[field.key]) !== JSON.stringify(draft.fields[field.key]);
    const row = el('div',`field-row${locked ? ' locked' : ''}`), heading = el('div','field-heading'), label = el('span',`field-label${changed ? ' changed' : ''}`,field.label), lock = el('button','lock-button');
    lock.append(icon(locked ? 'lock' : 'unlock')); lock.setAttribute('aria-label',`${locked ? '解锁' : '锁定'}${field.label}`); lock.title = locked ? `已锁定${field.label}，点击解锁` : `锁定${field.label}，后续对话保持不变`; lock.setAttribute('aria-pressed',String(locked)); lock.disabled = busy;
    lock.addEventListener('click', () => { project.locks = locked ? project.locks.filter(k => k !== field.key) : [...project.locks,field.key]; renderPrompt(); persist(); toast(locked ? `已解锁${field.label}` : `已锁定${field.label}，下次修改会保留`); });
    const text = el('button','field-text',draft.fields[field.key][language]); text.setAttribute('aria-label',`编辑${field.label}`); text.title = field.hint; text.disabled = busy;
    text.addEventListener('click', () => openEdit(field.key)); heading.append(label,lock); row.append(heading,text); return row;
  }));
  $('avoid-text').textContent = draft.avoid[language] || '暂无额外限制';
  $('revision-note').textContent = revision.changes.join('；');
  document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.language === language)));
  $('assembled-prompt').textContent=formattedPrompt(draft,language,project.brief.target);
  $('output-target').value=project.brief.target;
  $('output-caption').textContent=project.brief.target==='midjourney'?'已整理为 Midjourney 格式':'可以直接复制使用';
  changePromptView(promptView);
  $('locked-summary').replaceChildren(...project.locks.map(key=>{const button=el('button','locked-chip',`已锁定${FIELD_DEFS.find(f=>f.key===key).label}`);button.prepend(icon('lock'));button.disabled=busy;button.title='点击前往画面要素调整';button.addEventListener('click',()=>changePromptView('elements'));return button;}));
  if(!project.locks.length){const hint=el('button','text-button','在画面要素中，锁定满意的部分');hint.addEventListener('click',()=>changePromptView('elements'));$('locked-summary').append(hint);}
  const issues=inspectDraft(draft);
  if(issues.length)$('prompt-checks').replaceChildren(...issues.slice(0,3).map(issue=>{const button=el('button','check-issue',issue.text);button.addEventListener('click',()=>{changePromptView('elements');openEdit(issue.key);});return button;}));
  else{const pass=el('p','check-pass','关键画面要素已齐全，可继续根据生图结果调整。');pass.prepend(icon('check'));$('prompt-checks').replaceChildren(pass);}
  $('undo-latest').disabled=busy||project.revisions.length<2;$('compare-versions').disabled=busy||project.revisions.length<2;
}
function renderAll() { project.brief=normalizeBrief(project.brief); renderMode(); renderBrief(); renderReference(); renderMessages(true); renderPrompt(); workspace?.render(); renderBusy(); }
function addRevision(draft, note) {
  const changes = note ? [note] : describeChanges(currentDraft(), draft);
  project.revisions.push({ id: crypto.randomUUID(), created: Date.now(), title: project.title, draft: structuredClone(draft), changes });
}
function useResult(result, demo) {
  const changes=draftChanges(currentDraft(),result.draft);
  if(!project.customTitle)project.title = result.title; addRevision(result.draft);
  project.observations = project.reference ? result.observations : [];
  project.messages.push({ role: 'assistant', text: result.reply, suggestions: result.suggestions, demo, understanding:result.understanding||'',assumptions:result.assumptions||[],changeLabels:changes.map(c=>`更新${c.label}`) });
}
async function referenceForRequest(reference = project.reference) {
  if (!reference) return null;
  if (reference.dataUrl) return { name: reference.name, dataUrl: reference.dataUrl };
  const response = await fetch(reference.assetPath);
  if (!response.ok) throw new Error('示例参考图无法读取，请重新上传图片。');
  return { name: reference.name, dataUrl: await resizeImage(await response.blob()) };
}
async function reviewDraft(feedback, resultReference) {
  if (busy || !currentDraft()) return false;
  const session = project, sessionId = project.id;
  const body = { message: '请根据本轮效果复盘，改进当前生图提示词。', feedback, resultReference,
    draft: structuredClone(currentDraft()), locks: [...project.locks], scope: [...project.scope],
    brief: {...project.brief,editMode:'refine'}, messages: project.messages.filter(m => ['user','assistant'].includes(m.role)).slice(-24).map(({role,text})=>({role,text})) };
  const requestController = new AbortController(); controller = requestController; pendingTurn = {session,kind:'review'}; busy = true; renderAll();
  try {
    body.reference = await referenceForRequest(session.reference);
    if (requestController.signal.aborted || project.id !== sessionId) return false;
    const result = await api('/api/chat',body,'POST',requestController.signal);
    if (requestController.signal.aborted || project.id !== sessionId) return false;
    const observations = session.mode === 'demo' ? [] : session.observations;
    const issueLabels=feedback.issues.map(key=>FEEDBACK_ISSUES.find(issue=>issue.key===key).label);
    session.messages.push({role:'user',text:[issueLabels.length?`效果复盘：${issueLabels.join('、')}`:'效果复盘',feedback.notes].filter(Boolean).join('\n')});
    session.mode = 'live'; useResult(result,false); session.observations = observations;
    await persist(); return true;
  } catch (error) {
    if (requestController.signal.aborted || project.id !== sessionId) return false;
    throw error;
  } finally {
    if (controller === requestController) { controller = null; pendingTurn = null; busy = false; if (project.id === sessionId) renderAll(); }
  }
}
async function sendMessage(text) {
  const message = text.trim(); if (!message || busy) return;
  $('request-error').hidden = true;
  if (project.mode === 'demo') {
    const result = demoResult(message, currentDraft(), project.locks);
    if (result) { project.messages.push({ role: 'user', text: message, demo: true }); useResult(result,true); $('message-input').value = ''; renderAll(); persist(); return; }
    if (!config.configured) { toast('示例支持下方预设选项。连接模型后，就能自由描述你的想法。'); openSettings(); return; }
    project.mode = 'live'; project.observations = [];
  }
  if (!config.configured) { openSettings(); return; }
  const session = project, sessionId = project.id;
  const history = project.messages.filter(m => ['user','assistant'].includes(m.role)).slice(-24).map(({ role, text }) => ({ role, text }));
  const userMessage = { role: 'user', text: message };
  session.messages.push(userMessage); $('message-input').value = ''; busy = true;
  const requestController = new AbortController(); controller = requestController; pendingTurn = {session,userMessage,kind:'chat'}; renderMode(); renderMessages(true); renderBusy();
  try {
    const reference = await referenceForRequest();
    const result = await api('/api/chat', { message, messages: history, reference, draft: currentDraft(), locks: project.locks, scope: project.scope, brief:project.brief }, 'POST', requestController.signal);
    if (project.id !== sessionId || requestController.signal.aborted) return;
    useResult(result,false); persist();
  } catch (error) {
    const index = session.messages.indexOf(userMessage); if (index >= 0) session.messages.splice(index,1);
    if (project.id === sessionId && !requestController.signal.aborted) { $('message-input').value = message; $('request-error').textContent = error.message; $('request-error').hidden = false; }
  } finally {
    if (controller === requestController) { controller = null; pendingTurn = null; busy = false; if (project.id === sessionId) { renderAll(); $('message-input').focus(); } }
  }
}
async function loadExample() {
  cancelRequest();
  $('message-input').value = ''; $('request-error').hidden = true;
  project = blankProject(); project.mode = 'demo'; project.title = '雨窗边的慢时光';
  project.reference = { name: '雨窗咖啡馆 · AI 生成示例', assetPath: '/assets/cafe-reference.png' };
  project.observations = structuredClone(DEMO_OBSERVATIONS);
  project.brief={...DEFAULT_BRIEF,goal:'用雨窗与柔和暖光，做一张安静、有电影氛围的咖啡馆画面'};
  project.messages = [{ role:'user',text:'我想做一张这样的咖啡馆图片，安静一点，有电影感。',demo:true },{ role:'assistant',text:DEMO_REPLY,suggestions:DEMO_CHOICES,demo:true,understanding:'保留雨窗的氛围与冷暖光，把“电影感”落实到光线、配色和构图。',assumptions:['先以 4:5 竖版作为起点，可以在画面要素里调整。'] }];
  addRevision(DEMO_DRAFT); renderAll(); workspace?.show('studio'); document.querySelector('.prompt-panel').scrollTop = 0; document.querySelector('.reference-panel').scrollTop = 0; await persist();
}
function switchPanel(panel) { document.querySelector('.studio').dataset.activePanel = panel; document.querySelectorAll('[data-panel]').forEach(button => button.setAttribute('aria-current',String(button.dataset.panel === panel))); }
function openEdit(key) {
  if (busy || !currentDraft()) return;
  if (project.locks.includes(key)) { toast('这一项已锁定，请先点击小锁解锁后再修改。'); return; }
  editKey = key; const value = key === 'avoid' ? currentDraft().avoid : currentDraft().fields[key];
  $('edit-title').textContent = key === 'avoid' ? '编辑避免内容' : `编辑${FIELD_DEFS.find(f => f.key === key).label}`;
  $('edit-zh').value = value.zh; $('edit-en').value = value.en; showDialog('edit-dialog');
}
async function resizeImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error('图片像素过大，请先缩小后再上传。');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth*scale); canvas.height = Math.round(image.naturalHeight*scale);
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg',.86);
    if (dataUrl.length > 6*1024*1024) throw new Error('图片压缩后仍过大，请先缩小后再上传。');
    return dataUrl;
  } finally { URL.revokeObjectURL(url); }
}
async function uploadFile(file) {
  if (!file || busy) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { toast('请选择 PNG、JPG 或 WebP 图片。'); return; }
  if (file.size > 15*1024*1024) { toast('图片不能超过 15 MB，请先缩小图片。'); return; }
  try {
    const uploadSession=project.id;
    const dataUrl = await resizeImage(file);
    if(project.id!==uploadSession)return;
    if (project.mode === 'demo') { project = blankProject(); }
    project.mode = 'live'; project.reference = { name: file.name.slice(0,160), dataUrl }; project.observations = [];
    renderAll(); persist(); toast('参考图已放好，说说你想保留什么、改变什么。'); switchPanel('conversation');
  } catch (error) { toast(error.message || '图片无法读取，请换一张图片。'); }
}
function openSettings() {
  $('base-url').value = config.baseUrl || ''; $('model-name').value = config.model || ''; $('api-key').value = '';
  $('api-key').placeholder = config.hasKey ? '已保存密钥；留空可保留' : '粘贴服务商提供的 API Key';
  $('json-mode').checked=!!config.jsonMode;
  $('settings-error').hidden = true; $('connection-result').hidden = true; $('provider-preset').value = 'custom'; showDialog('settings-dialog');
}
function settingsBody() { return { baseUrl: $('base-url').value.trim(), model: $('model-name').value.trim(), apiKey: $('api-key').value.trim(),jsonMode:$('json-mode').checked }; }
async function saveSettings(event) {
  event.preventDefault(); if (!$('settings-form').reportValidity()) return;
  $('save-settings').disabled = true; $('settings-error').hidden = true;
  try { config = await api('/api/config', settingsBody(), 'PUT'); $('api-key').value = ''; $('settings-dialog').close(); renderMode(); workspace?.render(); toast('连接配置已保存在本机。发送一条消息开始创作。'); }
  catch (error) { $('settings-error').textContent = error.message; $('settings-error').hidden = false; }
  finally { $('save-settings').disabled = false; }
}
async function openProjects() {
  showDialog('projects-dialog'); $('project-list').replaceChildren(el('p','helper','正在读取本机创作……'));
  try {
    await saveQueue; const projects = await listProjects();
    $('project-list').replaceChildren(...projects.map(item => {
      const row = el('div','project-item'), thumb = el('img','project-thumb'); thumb.alt = ''; thumb.src = item.reference?.dataUrl || item.reference?.assetPath || '/assets/mark.svg';
      const button = el('button','project-open'); button.append(el('strong','',item.title),el('p','',`${item.mode === 'demo' ? '示例' : '自由创作'} · ${item.revisionCount} 个版本 · ${new Date(item.updated).toLocaleDateString('zh-CN')}`));
      button.addEventListener('click', async () => { try { const loaded=await loadProject(item.id); cancelRequest(); project = loaded; $('message-input').value = ''; $('request-error').hidden = true; rememberId(); renderAll(); workspace?.show('studio'); $('projects-dialog').close(); } catch { toast('这份创作暂时无法读取，请检查本机服务。'); } });
      const remove = el('button','icon-button'); remove.append(icon('trash')); remove.setAttribute('aria-label',`删除创作 ${item.title}`);
      remove.addEventListener('click', async () => { if (!confirm(`删除“${item.title}”的本机记录？此操作会移除它的对话、参考图和全部版本。`)) return; try { await deleteProject(item.id); if (project.id === item.id) { cancelRequest(); project = blankProject(); renderAll(); persist(); } openProjects(); } catch { toast('删除未完成，请重试。'); } });
      row.append(thumb,button,remove); return row;
    }));
  } catch { $('project-list').replaceChildren(el('p','form-error','无法读取本机记录，请确认本机服务仍在运行。')); }
}
function openVersions() {
  $('version-list').replaceChildren(...project.revisions.map((revision,index) => {
    const row = el('div','version-item'), info = el('div','version-info'); info.append(el('h3','',`第 ${index+1} 版${index === project.revisions.length-1 ? ' · 当前' : ''}`),el('p','',revision.changes.join('；')));
    const time = el('time','',new Date(revision.created).toLocaleString('zh-CN')); info.append(time);
    const restore = el('button','button secondary',index === project.revisions.length-1 ? '当前版本' : '恢复'); restore.disabled = index === project.revisions.length-1;
    restore.addEventListener('click', () => { $('versions-dialog').close();restoreRevision(index); }); row.append(info,restore); return row;
  }).reverse()); showDialog('versions-dialog');
}
async function copyPrompt() {
  try { await navigator.clipboard.writeText(formattedPrompt(currentDraft(),language,project.brief.target)); toast('已复制当前提示词'); }
  catch { toast('浏览器未允许复制，可以使用“导出提示词”保存内容。'); }
}
function exportPrompt() {
  const draft = currentDraft(); if (!draft) return;
  const text = `# ${project.title}\n\n${project.mode === 'demo' ? '> 预设示例内容，非实时 AI 分析。\n\n' : ''}## 中文提示词\n\n${formattedPrompt(draft,'zh',project.brief.target)}\n\n## English\n\n${formattedPrompt(draft,'en',project.brief.target)}\n\n---\n由映词整理 · 第 ${project.revisions.length} 版\n`;
  const blob = new Blob([text],{ type:'text/markdown;charset=utf-8' }), url = URL.createObjectURL(blob), link = el('a');
  link.href = url; link.download = `映词-${project.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,60)}-v${project.revisions.length}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); toast('提示词已导出');
}

function changePromptView(view) {
  promptView=view;
  $('prompt-preview').hidden=view!=='preview';$('element-editor').hidden=view!=='elements';
  document.querySelectorAll('[data-prompt-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.promptView===view)));
}
function renderBrief() {
  const brief=project.brief;
  $('project-name').textContent=project.title;
  $('brief-summary').textContent=brief.goal||'这次想怎么画？';
  $('brief-details').textContent=`${PURPOSES.find(p=>p.key===brief.purpose).label} · ${REFERENCE_MODES.find(r=>r.key===brief.referenceMode).label} · ${brief.editMode==='refine'?'局部微调':'重新构思'}`;
}
function openBrief() {
  const brief=project.brief;
  $('brief-goal').value=brief.goal;$('brief-purpose').value=brief.purpose;$('brief-reference').value=brief.referenceMode;$('brief-edit-mode').value=brief.editMode;
  showDialog('brief-dialog');
}
function restoreRevision(index,note) {
  if(busy)return;
  const revision=project.revisions[index];if(!revision)return;
  if(!project.customTitle)project.title=revision.title||project.title;addRevision(revision.draft,note||`恢复自第 ${index+1} 版`);
  project.messages.push({role:'note',text:`已恢复第 ${index+1} 版画面。历史版本都保留，可以继续调整。`});
  renderAll();persist();toast('已恢复，历史版本仍保留。');
}
function renderComparison() {
  const before=project.revisions[Number($('compare-before').value)],after=project.revisions[Number($('compare-after').value)];
  if(!before||!after)return;
  const changes=draftChanges(before.draft,after.draft);
  if(!changes.length){$('compare-content').replaceChildren(el('p','helper','这两个版本的画面要素相同。'));return;}
  $('compare-content').replaceChildren(...changes.map(change=>{
    const row=el('section','diff-row'),columns=el('div','diff-columns');
    row.append(el('h3','',change.label));columns.append(el('p','diff-before',change.before[language]||'未设定'),el('p','diff-after',change.after[language]||'未设定'));row.append(columns);return row;
  }));
}
function openComparison() {
  if(project.revisions.length<2)return;
  for(const id of ['compare-before','compare-after'])$(id).replaceChildren(...project.revisions.map((revision,index)=>{const option=el('option','',`第 ${index+1} 版 · ${revision.changes.join('、')}`);option.value=String(index);return option;}));
  $('compare-before').value=String(project.revisions.length-2);$('compare-after').value=String(project.revisions.length-1);renderComparison();showDialog('compare-dialog');
}
function updateReferenceInspector() {
  const image=$('reference-image');if(!project?.reference||!image.naturalWidth)return;
  try {
    const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,48,48);
    const colors=paletteFromPixels(ctx.getImageData(0,0,48,48).data);
    $('reference-size').textContent=`${image.naturalWidth} × ${image.naturalHeight} 像素`;
    $('reference-colors').replaceChildren(...colors.map(color=>{
      const button=el('button','color-chip'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
      svg.setAttribute('viewBox','0 0 32 28');svg.setAttribute('aria-hidden','true');rect.setAttribute('width','32');rect.setAttribute('height','28');rect.setAttribute('rx','6');rect.setAttribute('fill',color);svg.append(rect);
      button.append(svg,el('span','',color));button.setAttribute('aria-label',`复制颜色 ${color}`);button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(color);toast(`已复制颜色 ${color}`);}catch{toast(`颜色值：${color}`);}});return button;
    }));$('palette-section').hidden=!colors.length;
  } catch { $('palette-section').hidden=true; }
}
function downloadData(contents,type,filename) {
  const blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function backupCurrentProject() {
  if(busy)return;
  const content=JSON.stringify({format:'yingci-project',version:1,project},null,2);
  downloadData(content,'application/json;charset=utf-8',`映词-创作备份-${project.id.slice(0,8)}.json`);toast('创作备份已导出，包含参考图、对话和版本，不含模型密钥。');
}
async function importProjectFile(file) {
  if(!file||busy)return;
  if(file.size>8*1024*1024){toast('备份超过 8 MB，请选择较小的创作备份。');return;}
  try {
    const data=JSON.parse(await file.text());
    if(data.format!=='yingci-project'||data.version!==1||!data.project)throw new Error('请选择由映词导出的创作备份 JSON 文件。');
    const copy={...data.project,id:crypto.randomUUID(),created:Date.now(),updated:Date.now(),title:String(data.project.title||'导入的创作').slice(0,60)};
    await saveProject(copy);const loaded=await loadProject(copy.id);cancelRequest();project=loaded;renderAll();workspace?.show('studio');rememberId();$('projects-dialog').close();toast('创作已导入为一份新记录，原记录没有覆盖。');
  } catch(error) {toast(error.message||'备份无法读取，请检查文件是否完整。');}
}

hydrateIcons();
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click',event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } }));
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => switchPanel(button.dataset.panel)));
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => { language = button.dataset.language; renderPrompt(); }));
document.querySelectorAll('[data-prompt-view]').forEach(button=>button.addEventListener('click',()=>changePromptView(button.dataset.promptView)));
$('edit-brief').addEventListener('click',openBrief);
$('brief-form').addEventListener('submit',event=>{
  event.preventDefault();if(busy)return;const oldMode=project.brief.referenceMode;
  project.brief=normalizeBrief({...project.brief,goal:$('brief-goal').value,purpose:$('brief-purpose').value,referenceMode:$('brief-reference').value,editMode:$('brief-edit-mode').value});
  if(oldMode!==project.brief.referenceMode){if(project.brief.referenceMode==='style')project.scope=['style','palette','lighting'];else if(project.brief.referenceMode==='composition')project.scope=['composition'];else if(project.brief.referenceMode==='close')project.scope=[...FIELD_KEYS];}
  $('brief-dialog').close();renderBrief();renderReference();persist();toast('方向已保存，下一次对话会结合这些要求。');
});
$('output-target').addEventListener('change',()=>{project.brief.target=$('output-target').value;renderPrompt();persist();});
$('compare-versions').addEventListener('click',openComparison);
$('compare-before').addEventListener('change',renderComparison);$('compare-after').addEventListener('change',renderComparison);
$('undo-latest').addEventListener('click',()=>restoreRevision(project.revisions.length-2,'撤销上次修改，保留全部历史'));
$('rename-project').addEventListener('click',()=>{$('project-name-input').value=project.title;showDialog('rename-dialog');});
$('rename-form').addEventListener('submit',event=>{event.preventDefault();const title=$('project-name-input').value.trim();if(!title||busy)return;project.title=title;project.customTitle=true;$('rename-dialog').close();renderBrief();renderPrompt();persist();});
$('reference-image').addEventListener('load',updateReferenceInspector);
$('import-project').addEventListener('click',()=>$('project-input').click());$('project-input').addEventListener('change',event=>{importProjectFile(event.target.files[0]);event.target.value='';});
$('backup-project').addEventListener('click',backupCurrentProject);
$('rail-help').addEventListener('click',()=>showDialog('help-dialog'));
$('attach-top').addEventListener('click',()=>{if(!busy)$('image-input').click();});
$('open-settings').addEventListener('click',openSettings);
$('banner-action').addEventListener('click', () => { if (project.mode === 'demo' && config.configured) { project.mode = 'live'; project.observations=[]; renderAll(); persist(); $('message-input').focus(); } else openSettings(); });
$('settings-form').addEventListener('submit',saveSettings);
$('provider-preset').addEventListener('change', () => {
  const preset = $('provider-preset').value;
  $('connection-result').hidden = true;
  if (preset === 'openai') { $('base-url').value = 'https://api.openai.com/v1'; $('model-name').value = ''; $('provider-hint').textContent = '填写你账户可用的视觉模型 ID。API 调用按服务商规则计费。'; }
  else if (preset === 'qwen') { $('base-url').value = ''; $('base-url').placeholder = '粘贴百炼控制台对应地域的兼容接口地址'; $('model-name').value = ''; $('provider-hint').textContent = '从百炼控制台复制当前业务空间的接口地址和视觉模型 ID。不同地域的地址与密钥可能不同。'; }
  else if (preset === 'local') { $('base-url').value = 'http://127.0.0.1:11434/v1'; $('model-name').value = ''; $('api-key').value = 'ollama'; $('provider-hint').textContent = '需要先在本机启动服务，并拉取支持图片理解的模型。填写实际模型名称。'; }
  else $('provider-hint').textContent = '填写服务商提供的兼容接口基础地址，无需添加 /chat/completions。';
});
$('test-connection').addEventListener('click',async () => {
  if (!$('settings-form').reportValidity()) return;
  $('test-connection').disabled = true; $('settings-error').hidden = true; $('connection-result').hidden = false; $('connection-result').textContent = '正在测试文字连接……';
  try { await api('/api/test',settingsBody()); $('connection-result').textContent = '文字连接成功。保存后可用参考图验证图片理解。'; }
  catch (error) { $('connection-result').hidden = true; $('settings-error').textContent = error.message; $('settings-error').hidden = false; }
  finally { $('test-connection').disabled = false; }
});
$('open-projects').addEventListener('click',openProjects);
$('mobile-projects').addEventListener('click',openProjects);
$('new-project').addEventListener('click', () => { cancelRequest(); project = blankProject(); $('message-input').value = ''; $('request-error').hidden = true; renderAll(); persist(); workspace?.show('studio'); switchPanel('conversation'); $('message-input').focus(); });
$('load-example').addEventListener('click',loadExample);
$('conversation-help').addEventListener('click', () => showDialog('help-dialog'));
$('open-versions').addEventListener('click',openVersions);
$('composer').addEventListener('submit',event => { event.preventDefault(); sendMessage($('message-input').value); });
$('message-input').addEventListener('keydown',event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage($('message-input').value); } });
$('cancel-message').addEventListener('click', () => { cancelRequest(); renderAll(); toast('已取消，输入内容与历史消息已保留'); });
for (const id of ['empty-upload','replace-reference','attach-reference']) $(id).addEventListener('click', () => { if (!busy) $('image-input').click(); });
$('image-input').addEventListener('change',event => { uploadFile(event.target.files[0]); event.target.value = ''; });
$('reference-area').addEventListener('dragover',event => { event.preventDefault(); $('reference-area').classList.add('dragging'); });
$('reference-area').addEventListener('dragleave', () => $('reference-area').classList.remove('dragging'));
$('reference-area').addEventListener('drop',event => { event.preventDefault(); $('reference-area').classList.remove('dragging'); uploadFile(event.dataTransfer.files[0]); });
$('remove-reference').addEventListener('click', () => { if (busy) return; project.reference = null; project.observations = []; renderReference(); persist(); });
$('reference-preview').addEventListener('click', () => { if (project.reference) { $('expanded-image').src = project.reference.dataUrl || project.reference.assetPath; showDialog('image-dialog'); } });
$('copy-prompt').addEventListener('click',copyPrompt); $('export-prompt').addEventListener('click',exportPrompt);
$('edit-avoid').addEventListener('click', () => openEdit('avoid'));
$('aspect-ratio').addEventListener('change', () => { if (!currentDraft()) return; const draft = structuredClone(currentDraft()); draft.aspectRatio = $('aspect-ratio').value; addRevision(draft); renderPrompt(); persist(); });
$('edit-form').addEventListener('submit',event => { event.preventDefault(); if (busy) return; const draft = structuredClone(currentDraft()), value = { zh: $('edit-zh').value.trim(),en: $('edit-en').value.trim() }; if (editKey === 'avoid') draft.avoid = value; else draft.fields[editKey] = value; addRevision(draft); $('edit-dialog').close(); renderPrompt(); persist(); });

try { config = await api('/api/config',undefined,'GET'); }
catch { toast('本机服务暂时无法连接，请检查终端里的启动状态。'); }
try {
  const projects = await listProjects(); let lastId; try { lastId = localStorage.getItem('yingci-last-project'); } catch { /* optional */ }
  const latest=projects.find(p => p.id === lastId) || projects[0];
  if(latest) project=await loadProject(latest.id);
} catch { toast('本机记录暂时无法读取，请检查服务是否仍在运行。'); }
if (project) renderAll(); else await loadExample();
workspace = mountWorkspace({getProject:()=>project,getConfig:()=>config,isBusy:()=>busy,currentDraft,api,persist,renderAll,resizeImage,openSettings,toast,cancelRequest,switchPanel,reviewDraft,
  startDraft(title,draft,goal) {
    cancelRequest(); project=blankProject(); project.title=title; project.brief.goal=goal;
    project.messages.push({role:'note',text:'已从灵感库带入这份提示词，可以按自己的想法继续修改。'});
    addRevision(draft,'从预设或收藏建立第一版'); $('message-input').value=''; $('request-error').hidden=true; renderAll(); persist(); switchPanel('conversation');
  },
  applyDraft(draft,note) {
    if(project.mode==='demo')project.observations=[];
    project.mode='live'; addRevision(draft,note); project.messages.push({role:'note',text:note+'，其余要素和锁定内容保留。'}); renderAll(); persist();
  },
});
workspace.show(location.hash.slice(1));
document.querySelector('.prompt-panel').scrollTop = 0;
