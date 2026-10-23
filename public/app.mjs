import { FIELD_DEFS, FIELD_KEYS, composePrompt, describeChanges } from './shared.mjs';
import { hydrateIcons, icon } from './icons.mjs';
import { saveProject, listProjects, loadProject, deleteProject } from './storage.mjs';
import { DEMO_DRAFT, DEMO_CHOICES, DEMO_REPLY, DEMO_OBSERVATIONS, demoResult } from './demo.mjs';

const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
let project, config = { configured: false }, language = 'zh', busy = false, controller, editKey, toastTimer, saveQueue = Promise.resolve();
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4200); }
function showDialog(id) { if (!$(id).open) $(id).showModal(); }
function currentDraft() { return project.revisions.at(-1)?.draft || null; }
function blankProject() { return { id: crypto.randomUUID(), title: '新的画面', mode: 'live', created: Date.now(), updated: Date.now(), reference: null, scope: ['composition','lighting','palette','style'], locks: [], messages: [], revisions: [], observations: [] }; }
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
function cancelRequest() { controller?.abort(); controller = null; busy = false; renderBusy(); }
function renderBusy() {
  $('send-message').hidden = busy; $('cancel-message').hidden = !busy;
  $('message-input').disabled = busy;
  document.querySelectorAll('.suggestion').forEach(button => button.disabled = busy);
  $('messages').setAttribute('aria-busy', String(busy));
  $('aspect-ratio').disabled = busy;
  $('open-versions').disabled = busy || !project?.revisions.length;
}
function renderMode() {
  const demo = project.mode === 'demo';
  $('connection-label').textContent = config.configured ? '模型已连接' : '连接模型';
  $('open-settings').classList.toggle('configured', config.configured);
  $('mode-description').textContent = demo ? '示例体验：使用预设对话演示流程，不调用 AI。' : config.configured ? '自由创作：发送时，参考图与对话将交给你连接的 AI 模型。' : '连接一个视觉模型，就能分析自己的参考图、自由对话。';
  $('banner-action').textContent = demo && config.configured ? '继续自由创作' : config.configured ? '查看连接' : '连接自己的模型';
  $('composer-mode').textContent = demo ? '预设示例' : config.configured ? '自由对话' : '等待连接模型';
  $('privacy-note').textContent = demo ? '示例无需联网调用模型' : '发送时会上传参考图至所连接模型';
}
function renderReference() {
  const ref = project.reference;
  $('reference-preview').hidden = !ref; $('reference-caption').hidden = !ref; $('upload-empty').hidden = !!ref;
  if (ref) { $('reference-image').src = ref.dataUrl || ref.assetPath; $('reference-image').alt = ref.name; $('reference-name').textContent = ref.name; }
  else { $('reference-image').removeAttribute('src'); }
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
}
function renderAll() { renderMode(); renderReference(); renderMessages(true); renderPrompt(); renderBusy(); }
function addRevision(draft, note) {
  const changes = note ? [note] : describeChanges(currentDraft(), draft);
  project.revisions.push({ id: crypto.randomUUID(), created: Date.now(), title: project.title, draft: structuredClone(draft), changes });
}
function useResult(result, demo) {
  project.title = result.title; addRevision(result.draft);
  project.observations = project.reference ? result.observations : [];
  project.messages.push({ role: 'assistant', text: result.reply, suggestions: result.suggestions, demo });
}
async function referenceForRequest() {
  if (!project.reference) return null;
  if (project.reference.dataUrl) return { name: project.reference.name, dataUrl: project.reference.dataUrl };
  const response = await fetch(project.reference.assetPath);
  if (!response.ok) throw new Error('示例参考图无法读取，请重新上传图片。');
  return { name: project.reference.name, dataUrl: await resizeImage(await response.blob()) };
}
async function sendMessage(text) {
  const message = text.trim(); if (!message || busy) return;
  $('request-error').hidden = true;
  if (project.mode === 'demo') {
    const result = demoResult(message, currentDraft(), project.locks);
    if (result) { project.messages.push({ role: 'user', text: message, demo: true }); useResult(result,true); $('message-input').value = ''; renderAll(); persist(); return; }
    if (!config.configured) { toast('示例支持下方预设选项。连接模型后，就能自由描述你的想法。'); openSettings(); return; }
    project.mode = 'live';
  }
  if (!config.configured) { openSettings(); return; }
  const session = project, sessionId = project.id;
  const history = project.messages.filter(m => ['user','assistant'].includes(m.role)).slice(-24).map(({ role, text }) => ({ role, text }));
  const userMessage = { role: 'user', text: message };
  session.messages.push(userMessage); $('message-input').value = ''; busy = true;
  const requestController = new AbortController(); controller = requestController; renderMode(); renderMessages(true); renderBusy();
  try {
    const reference = await referenceForRequest();
    const result = await api('/api/chat', { message, messages: history, reference, draft: currentDraft(), locks: project.locks, scope: project.scope }, 'POST', requestController.signal);
    if (project.id !== sessionId || requestController.signal.aborted) return;
    useResult(result,false); persist();
  } catch (error) {
    const index = session.messages.indexOf(userMessage); if (index >= 0) session.messages.splice(index,1);
    if (project.id === sessionId && !requestController.signal.aborted) { $('message-input').value = message; $('request-error').textContent = error.message; $('request-error').hidden = false; }
  } finally {
    if (controller === requestController) { controller = null; busy = false; if (project.id === sessionId) { renderAll(); $('message-input').focus(); } }
  }
}
async function loadExample() {
  cancelRequest();
  project = blankProject(); project.mode = 'demo'; project.title = '雨窗边的慢时光';
  project.reference = { name: '雨窗咖啡馆 · AI 生成示例', assetPath: '/assets/cafe-reference.png' };
  project.observations = structuredClone(DEMO_OBSERVATIONS);
  project.messages = [{ role:'user',text:'我想做一张这样的咖啡馆图片，安静一点，有电影感。',demo:true },{ role:'assistant',text:DEMO_REPLY,suggestions:DEMO_CHOICES,demo:true }];
  addRevision(DEMO_DRAFT); renderAll(); document.querySelector('.prompt-panel').scrollTop = 0; document.querySelector('.reference-panel').scrollTop = 0; await persist();
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
    const dataUrl = await resizeImage(file);
    if (project.mode === 'demo') { project = blankProject(); }
    project.mode = 'live'; project.reference = { name: file.name.slice(0,160), dataUrl }; project.observations = [];
    renderAll(); persist(); toast('参考图已放好，说说你想保留什么、改变什么。'); switchPanel('conversation');
  } catch (error) { toast(error.message || '图片无法读取，请换一张图片。'); }
}
function openSettings() {
  $('base-url').value = config.baseUrl || ''; $('model-name').value = config.model || ''; $('api-key').value = '';
  $('api-key').placeholder = config.hasKey ? '已保存密钥；留空可保留' : '粘贴服务商提供的 API Key';
  $('settings-error').hidden = true; $('connection-result').hidden = true; $('provider-preset').value = 'custom'; showDialog('settings-dialog');
}
function settingsBody() { return { baseUrl: $('base-url').value.trim(), model: $('model-name').value.trim(), apiKey: $('api-key').value.trim() }; }
async function saveSettings(event) {
  event.preventDefault(); if (!$('settings-form').reportValidity()) return;
  $('save-settings').disabled = true; $('settings-error').hidden = true;
  try { config = await api('/api/config', settingsBody(), 'PUT'); $('api-key').value = ''; $('settings-dialog').close(); renderMode(); toast('连接配置已保存在本机。发送一条消息开始创作。'); }
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
      button.addEventListener('click', async () => { try { const loaded=await loadProject(item.id); cancelRequest(); project = loaded; $('message-input').value = ''; $('request-error').hidden = true; rememberId(); renderAll(); $('projects-dialog').close(); } catch { toast('这份创作暂时无法读取，请检查本机服务。'); } });
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
    restore.addEventListener('click', () => { project.title = revision.title || project.title; addRevision(revision.draft,`恢复自第 ${index+1} 版`); project.messages.push({ role:'note',text:`已恢复第 ${index+1} 版画面。后续对话会基于恢复后的版本。` }); $('versions-dialog').close(); renderAll(); persist(); toast('已恢复，原有版本仍保留。'); }); row.append(info,restore); return row;
  }).reverse()); showDialog('versions-dialog');
}
async function copyPrompt() {
  try { await navigator.clipboard.writeText(composePrompt(currentDraft(),language)); toast('已复制当前提示词'); }
  catch { toast('浏览器未允许复制，可以使用“导出提示词”保存内容。'); }
}
function exportPrompt() {
  const draft = currentDraft(); if (!draft) return;
  const text = `# ${project.title}\n\n${project.mode === 'demo' ? '> 预设示例内容，非实时 AI 分析。\n\n' : ''}## 中文提示词\n\n${composePrompt(draft,'zh')}\n\n## English\n\n${composePrompt(draft,'en')}\n\n---\n由映词整理 · 第 ${project.revisions.length} 版\n`;
  const blob = new Blob([text],{ type:'text/markdown;charset=utf-8' }), url = URL.createObjectURL(blob), link = el('a');
  link.href = url; link.download = `映词-${project.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,60)}-v${project.revisions.length}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); toast('提示词已导出');
}

hydrateIcons();
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click',event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } }));
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => switchPanel(button.dataset.panel)));
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => { language = button.dataset.language; renderPrompt(); }));
$('open-settings').addEventListener('click',openSettings);
$('banner-action').addEventListener('click', () => { if (project.mode === 'demo' && config.configured) { project.mode = 'live'; renderMode(); persist(); $('message-input').focus(); } else openSettings(); });
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
$('new-project').addEventListener('click', () => { cancelRequest(); project = blankProject(); $('message-input').value = ''; $('request-error').hidden = true; renderAll(); persist(); switchPanel('conversation'); $('message-input').focus(); });
$('load-example').addEventListener('click',loadExample);
$('conversation-help').addEventListener('click', () => showDialog('help-dialog'));
$('open-versions').addEventListener('click',openVersions);
$('composer').addEventListener('submit',event => { event.preventDefault(); sendMessage($('message-input').value); });
$('message-input').addEventListener('keydown',event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage($('message-input').value); } });
$('cancel-message').addEventListener('click', () => { const pending=project.messages.at(-1); cancelRequest(); if(pending?.role==='user'){project.messages.pop();$('message-input').value=pending.text;} renderMessages(true); toast('已取消，输入内容已保留'); });
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
document.querySelector('.prompt-panel').scrollTop = 0;
