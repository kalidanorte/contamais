/* ---------------- storage helpers ---------------- */
function loadJSON(key, fb){ try{ const r=localStorage.getItem(key); return r?JSON.parse(r):fb; }catch(e){ return fb; } }
function saveJSON(key, v){ try{ localStorage.setItem(key, JSON.stringify(v)); }catch(e){} }

const K = { CLIENTS:'cm:clients', DAYS:'cm:days', ROUTINES:'cm:routines', OCC:'cm:occ-status', SUP:'cm:occ-suppressed', HIST:'cm:history' };

function getClients(){ const existing = loadJSON(K.CLIENTS, null); return existing || seedClients(); }
function saveClients(list){ saveJSON(K.CLIENTS, list); }
function seedClients(){
  const seed = [{
    id:'c-joao', nome:'João da Silva', email:'joao.silva@email.com', contato:'(11) 98888-4321',
    chegou:'Indicação — Marcelo Andrade', empresa:'Silva Contabilidade', cargo:'Sócio-diretor',
    endereco:'Rua das Acácias, 210 — São Paulo/SP', motivo:'Contratação de serviço de assessoria',
    interesse:'Alto — busca fechar ainda este mês', info:'Prefere contato por telefone.',
    historico:[{data:new Date().toISOString().slice(0,10), texto:'Registro criado (dado de exemplo)'}]
  }];
  saveClients(seed);
  return seed;
}

function getAllDays(){ return loadJSON(K.DAYS, {}); }
function getDayRaw(dateKey){
  const all = getAllDays();
  return all[dateKey] || { blocks:[], looseTasks:[] };
}
function saveDayRaw(dateKey, day){
  const all = getAllDays();
  all[dateKey] = day;
  saveJSON(K.DAYS, all);
}

function getRoutines(){ const existing = loadJSON(K.ROUTINES, null); return existing || seedRoutines(); }
function saveRoutines(list){ saveJSON(K.ROUTINES, list); }
function seedRoutines(){
  const seed = [{ id:'r-msg', nome:'Conferir mensagens', dias:[1,2,3,4,5], horario:'08:00', inicio:'2026-01-01', termino:null, bloco:null, status:'ativa' }];
  saveRoutines(seed);
  return seed;
}

function getOccStatus(rid, dk){ const m = loadJSON(K.OCC, {}); return m[rid+'|'+dk] || 'pendente'; }
function setOccStatus(rid, dk, status){ const m = loadJSON(K.OCC, {}); m[rid+'|'+dk] = status; saveJSON(K.OCC, m); }
function isSuppressed(rid, dk){ const m = loadJSON(K.SUP, {}); return !!m[rid+'|'+dk]; }
function suppress(rid, dk){ const m = loadJSON(K.SUP, {}); m[rid+'|'+dk] = true; saveJSON(K.SUP, m); }

function logHistory(dateKey, text, color){
  const h = loadJSON(K.HIST, []);
  h.unshift({ date: dateKey, ts: Date.now(), text, color: color || 'var(--slate)' });
  saveJSON(K.HIST, h.slice(0, 500));
}

/* ---------------- date helpers ---------------- */
function todayKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function toDateObj(dk){ return new Date(dk+'T00:00:00'); }
function fromDateObj(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function addDays(dk, n){ const d=toDateObj(dk); d.setDate(d.getDate()+n); return fromDateObj(d); }
function weekdayOf(dk){ return toDateObj(dk).getDay(); }
function formatLong(dk){ const d=toDateObj(dk); const s=d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'}); return s.charAt(0).toUpperCase()+s.slice(1); }
function formatShort(dk){ const d=toDateObj(dk); return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); }
function hoursSinceDayEnd(dk){ const end = toDateObj(dk).getTime() + 24*3600*1000; return (Date.now()-end)/3600000; }
function isLocked(dk){ return hoursSinceDayEnd(dk) > 72; }
function isPast(dk){ return dk < todayKey(); }

let currentDate = todayKey();
let agendaView = 'dia';

/* ---------------- agenda computation ---------------- */
function toMin(hhmm){ const [h,m]=hhmm.split(':').map(Number); return h*60+m; }

function blockConflict(blocks, startStr, endStr){
  const s=toMin(startStr), e=toMin(endStr);
  for(const b of blocks){
    const bs=toMin(b.start), be=toMin(b.end);
    const overlaps = s < be && bs < e;
    if(!overlaps) continue;
    const contained = (s<=bs && e>=be) || (bs<=s && be>=e);
    if(contained) return { type:'nest', with:b };
    return { type:'conflict', with:b };
  }
  return null;
}

function getAgenda(dateKey){
  const day = getDayRaw(dateKey);
  const blocks = day.blocks.map(b => ({ ...b, tasks:[...b.tasks] }));
  const loose = [...day.looseTasks];
  const wd = weekdayOf(dateKey);
  getRoutines().filter(r => r.status==='ativa' && r.dias.includes(wd) && dateKey>=r.inicio && (!r.termino || dateKey<=r.termino) && !isSuppressed(r.id, dateKey))
    .forEach(r => {
      const occ = { id:'occ-'+r.id+'-'+dateKey, type:'tarefa', title:r.nome, status:getOccStatus(r.id,dateKey), isOccurrence:true, routineId:r.id, routineName:r.nome, time:r.horario };
      const target = r.bloco ? blocks.find(b => b.name === r.bloco) : null;
      if(target) target.tasks.push(occ); else loose.push(occ);
    });
  return { blocks, loose };
}

function displayStatus(task, dateKey){
  if((task.status==='pendente'||task.status==='em_andamento') && isPast(dateKey)) return 'perdida';
  return task.status;
}
const STATUS_LABEL = { pendente:'Pendente', em_andamento:'Em andamento', concluida:'Concluída', adiada:'Adiada', cancelada:'Cancelada', perdida:'Perdida' };
const STATUS_COLOR = { pendente:'var(--ink-dim)', em_andamento:'var(--brass)', concluida:'var(--moss)', adiada:'var(--slate)', cancelada:'var(--ink-dim)', perdida:'var(--wax)' };

function findTaskRef(dateKey, task){
  const day = getDayRaw(dateKey);
  for(const b of day.blocks){ const t = b.tasks.find(x=>x.id===task.id); if(t) return {store:'block', block:b, task:t, day}; }
  const t = day.looseTasks.find(x=>x.id===task.id); if(t) return {store:'loose', task:t, day};
  return null;
}

function setTaskStatus(dateKey, taskId, isOccurrence, routineId, newStatus){
  if(isLocked(dateKey)) return;
  if(isOccurrence){ setOccStatus(routineId, dateKey, newStatus); }
  else {
    const day = getDayRaw(dateKey);
    let found=null;
    day.blocks.forEach(b=>{ const t=b.tasks.find(x=>x.id===taskId); if(t){ t.status=newStatus; found=t; } });
    if(!found){ const t=day.looseTasks.find(x=>x.id===taskId); if(t){ t.status=newStatus; found=t; } }
    saveDayRaw(dateKey, day);
  }
  if(newStatus==='concluida' || newStatus==='perdida') logHistory(dateKey, (newStatus==='concluida'?'Concluída: ':'Perdida: ') + (document.getElementById('tmp')?'':''), newStatus==='concluida'?'var(--moss)':'var(--wax)');
  go('agenda');
}

let pendingMove = null;
function openMove(dateKey, taskId, isOccurrence, routineId){
  pendingMove = { dateKey, taskId, isOccurrence, routineId };
  document.getElementById('moveTargetDate').value = addDays(dateKey,1);
  openOverlay('moveOverlay');
}
function confirmMove(){
  const target = document.getElementById('moveTargetDate').value;
  if(!target || !pendingMove) return;
  const { dateKey, taskId, isOccurrence, routineId } = pendingMove;
  if(isLocked(dateKey)){ closeOverlay('moveOverlay'); return; }

  if(isOccurrence){
    const routine = getRoutines().find(r=>r.id===routineId);
    suppress(routineId, dateKey);
    const day = getDayRaw(target);
    day.looseTasks.push({ id:'task-'+Date.now(), type:'tarefa', title: routine ? routine.nome : 'Atividade', status:'pendente' });
    saveDayRaw(target, day);
    logHistory(dateKey, 'Ocorrência remarcada — virou atividade formal em '+formatShort(target), 'var(--slate)');
  } else {
    const day = getDayRaw(dateKey);
    let orig=null;
    day.blocks.forEach(b=>{ const t=b.tasks.find(x=>x.id===taskId); if(t){ t.status='perdida'; orig=t; } });
    if(!orig){ const t=day.looseTasks.find(x=>x.id===taskId); if(t){ t.status='perdida'; orig=t; } }
    saveDayRaw(dateKey, day);
    if(orig){
      const tday = getDayRaw(target);
      tday.looseTasks.push({ id:'task-'+Date.now(), type: orig.type||'tarefa', title: orig.title, status:'pendente', client: orig.client||null, time: orig.time||null, duration: orig.duration||null });
      saveDayRaw(target, tday);
      logHistory(dateKey, '"'+orig.title+'" movida para '+formatShort(target)+' (original marcada como perdida)', 'var(--wax)');
    }
  }
  closeOverlay('moveOverlay');
  go('agenda');
}

/* ---------------- rendering: task/block rows ---------------- */
function statusSelectHTML(task, dateKey, isOccurrence, routineId){
  const disp = displayStatus(task, dateKey);
  const locked = isLocked(dateKey);
  const opts = ['pendente','em_andamento','concluida','adiada','cancelada'];
  if(locked){
    return `<span class="row-title" style="color:${STATUS_COLOR[disp]};font-size:11px;flex-shrink:0;border:1px solid var(--rule);border-radius:6px;padding:2px 6px;">${STATUS_LABEL[disp]}</span>`;
  }
  const sel = opts.map(o => `<option value="${o}" ${task.status===o?'selected':''}>${STATUS_LABEL[o]}</option>`).join('');
  return `<select class="status-select" onchange="setTaskStatus('${dateKey}','${task.id}',${isOccurrence?'true':'false'},${isOccurrence?`'${routineId}'`:'null'},this.value)">${sel}</select>`;
}

function taskRowHTML(task, dateKey){
  const disp = displayStatus(task, dateKey);
  const locked = isLocked(dateKey);
  const clientChip = task.client ? `<div class="chip" onclick="openClientPanel('${task.client}')"><span class="avatar">${clientAvatar(task.client)}</span> ${clientName(task.client)}</div>` : '';
  const timeInfo = task.type==='compromisso'
    ? `<div class="row-time">${task.time||''}${task.duration?' · '+task.duration:''} · compromisso</div>`
    : (task.isOccurrence && task.time ? `<div class="row-time">${task.time} · rotina</div>` : '');
  const perdidaTag = disp==='perdida' ? `<div class="tag-perdida">Perdida${task.isOccurrence?' (ocorrência)':''}</div>` : '';
  const moveBtn = (disp==='perdida' && !locked) ? `<button class="mini-btn" onclick="openMove('${dateKey}','${task.id}',${task.isOccurrence?'true':'false'},${task.isOccurrence?`'${task.routineId}'`:'null'})">Mover para outro dia</button>` : '';
  const lockNote = locked ? `<div class="tag-locked"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Bloqueado (72h)</div>` : '';
  return `
    <div class="row">
      ${statusSelectHTML(task, dateKey, task.isOccurrence, task.routineId)}
      <div class="row-main">
        <div class="row-title ${disp==='concluida'?'done':''}">${task.title}</div>
        ${timeInfo}${clientChip}${perdidaTag}${lockNote}${moveBtn}
      </div>
    </div>`;
}

function blockHTML(block, dateKey){
  const locked = isLocked(dateKey);
  const done = block.tasks.filter(t=>t.status==='concluida').length;
  const nestNote = block.nestedIn ? `<span style="font-size:11px;color:var(--ink-dim);font-weight:400;"> · sub-bloco de ${block.nestedIn}</span>` : '';
  const inputId = 'inline-'+block.id;
  return `
    <div class="block">
      <div class="block-head">
        <div><div class="bt">${block.name}${nestNote}</div><div class="btime">${block.start} – ${block.end}</div></div>
        <div class="block-count">${done}/${block.tasks.length}</div>
      </div>
      <div class="block-body">
        ${block.tasks.map(t=>taskRowHTML(t, dateKey)).join('')}
        ${locked ? '' : `<div class="inline-add">
          <input id="${inputId}" placeholder="Adicionar tarefa neste bloco" onkeydown="if(event.key==='Enter') addInlineTask('${dateKey}','${block.id}','${inputId}')" />
          <button class="inline-add-btn" onclick="addInlineTask('${dateKey}','${block.id}','${inputId}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
        </div>`}
      </div>
    </div>`;
}

function looseTasksHTML(loose, dateKey){
  const locked = isLocked(dateKey);
  return `
    <div class="section-title">Tarefas avulsas do dia</div>
    <div class="block"><div class="block-body" style="padding-top:10px;">
      ${loose.map(t=>taskRowHTML(t, dateKey)).join('') || '<div style="font-size:13px;color:var(--ink-dim);padding:6px 0;">Nenhuma tarefa avulsa.</div>'}
      ${locked ? '' : `<div class="inline-add">
        <input id="inline-loose" placeholder="Adicionar tarefa avulsa (sem bloco)" onkeydown="if(event.key==='Enter') addInlineTask('${dateKey}',null,'inline-loose')" />
        <button class="inline-add-btn" onclick="addInlineTask('${dateKey}',null,'inline-loose')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>`}
    </div></div>`;
}

function addInlineTask(dateKey, blockId, inputId){
  if(isLocked(dateKey)) return;
  const input = document.getElementById(inputId);
  const name = input.value.trim();
  if(!name) return;
  const day = getDayRaw(dateKey);
  const task = { id:'task-'+Date.now(), type:'tarefa', title:name, status:'pendente' };
  if(blockId){ const b = day.blocks.find(x=>x.id===blockId); if(b) b.tasks.push(task); }
  else day.looseTasks.push(task);
  saveDayRaw(dateKey, day);
  go('agenda');
}

function saveNewBlock(){
  const dateKey = currentDate;
  if(isLocked(dateKey)) return;
  const name = document.getElementById('newBlockName').value.trim() || 'Novo bloco';
  const start = document.getElementById('newBlockStart').value;
  const end = document.getElementById('newBlockEnd').value;
  const msgEl = document.getElementById('blockConflictMsg');
  const day = getDayRaw(dateKey);

  if(toMin(end) <= toMin(start)){
    msgEl.innerHTML = bannerHTML('Horário inválido','O fim precisa ser depois do início.');
    return;
  }
  const conflict = blockConflict(day.blocks, start, end);
  if(conflict && conflict.type==='conflict'){
    msgEl.innerHTML = bannerHTML('Conflito de horário', `"${name}" (${start}–${end}) sobrepõe parcialmente "${conflict.with.name}" (${conflict.with.start}–${conflict.with.end}). Ajuste um dos dois horários antes de salvar.`);
    return;
  }
  msgEl.innerHTML = '';
  day.blocks.push({ id:'b-'+Date.now(), name, start, end, nestedIn: (conflict&&conflict.type==='nest')?conflict.with.name:null, tasks:[] });
  saveDayRaw(dateKey, day);
  logHistory(dateKey, 'Bloco criado: '+name+', '+start+'–'+end, 'var(--slate)');
  document.getElementById('newBlockName').value='';
  closeOverlay('addBlockOverlay');
  go('agenda');
}

function bannerHTML(title, text){
  return `<div class="banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wax)" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg><div><strong>${title}</strong>${text}</div></div>`;
}

function openCompromissoForm(){
  const dateKey = currentDate;
  const day = getDayRaw(dateKey);
  document.getElementById('compBlock').innerHTML = `<option value="">Sem bloco</option>` + day.blocks.map(b=>`<option value="${b.id}">${b.name} (${b.start}–${b.end})</option>`).join('');
  document.getElementById('compClient').innerHTML = `<option value="">Sem cliente vinculado</option>` + getClients().map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  document.getElementById('compTitle').value='';
  openOverlay('addCompromissoOverlay');
}
function saveNewCompromisso(){
  const dateKey = currentDate;
  if(isLocked(dateKey)) return;
  const title = document.getElementById('compTitle').value.trim();
  if(!title) return;
  const time = document.getElementById('compTime').value;
  const duration = document.getElementById('compDuration').value.trim();
  const blockId = document.getElementById('compBlock').value;
  const clientId = document.getElementById('compClient').value;
  const day = getDayRaw(dateKey);
  const task = { id:'task-'+Date.now(), type:'compromisso', title, time, duration, status:'pendente', client: clientId||null };
  if(blockId){ const b=day.blocks.find(x=>x.id===blockId); if(b) b.tasks.push(task); } else day.looseTasks.push(task);
  saveDayRaw(dateKey, day);
  closeOverlay('addCompromissoOverlay');
  go('agenda');
}

/* ---------------- clients ---------------- */
function clientName(id){ const c=getClients().find(x=>x.id===id); return c?c.nome:'Cliente'; }
function clientAvatar(id){ const c=getClients().find(x=>x.id===id); if(!c) return '?'; return c.nome.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }

function openClientPanel(id){
  const c = getClients().find(x=>x.id===id);
  if(!c) return;
  document.getElementById('clientPanelTitle').textContent = c.nome;
  document.getElementById('clientBody').innerHTML = `
    <div class="field"><label>E-mail</label><div class="fval">${c.email||'—'}</div></div>
    <div class="field"><label>Contato</label><div class="fval">${c.contato||'—'}</div></div>
    <div class="field"><label>De onde chegou</label><div class="fval">${c.chegou||'—'}</div></div>
    <div class="field"><label>Empresa · Cargo</label><div class="fval">${c.empresa||'—'} · ${c.cargo||'—'}</div></div>
    <div class="field"><label>Endereço</label><div class="fval">${c.endereco||'—'}</div></div>
    <div class="field"><label>Motivo da reunião</label><div class="fval">${c.motivo||'—'}</div></div>
    <div class="field"><label>Interesse</label><div class="fval">${c.interesse||'—'}</div></div>
    <div class="field"><label>Informações</label><div class="fval">${c.info||'—'}</div></div>
    <button class="add-block-btn" onclick="closeOverlay('clientOverlay'); openClientForm('${c.id}')">Editar registro</button>
    <div class="section-title">Histórico com este cliente</div>
    ${(c.historico||[]).map(h=>`<div class="hist-item"><div class="hist-dot" style="background:var(--slate)"></div><div><div class="hist-time">${h.data}</div><div class="hist-text">${h.texto}</div></div></div>`).join('') || '<div style="font-size:13px;color:var(--ink-dim);">Sem histórico ainda.</div>'}
    <div class="inline-add"><input id="newHistNote" placeholder="Adicionar entrada ao histórico" /><button class="inline-add-btn" onclick="addClientHistory('${c.id}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button></div>
  `;
  openOverlay('clientOverlay');
}
function addClientHistory(id){
  const input = document.getElementById('newHistNote');
  const text = input.value.trim();
  if(!text) return;
  const list = getClients();
  const c = list.find(x=>x.id===id);
  c.historico = c.historico || [];
  c.historico.unshift({ data: todayKey(), texto: text });
  saveClients(list);
  openClientPanel(id);
}

function openClientForm(id){
  const c = id ? getClients().find(x=>x.id===id) : null;
  document.getElementById('clientFormTitle').textContent = c ? 'Editar registro' : 'Novo registro';
  const f = (k,label,val) => `<div class="field"><label>${label}</label><input class="forminput" id="cf-${k}" value="${val?val.replace(/"/g,'&quot;'):''}" /></div>`;
  document.getElementById('clientFormBody').innerHTML = `
    ${f('nome','Nome',c?.nome)}
    ${f('email','E-mail',c?.email)}
    ${f('contato','Contato',c?.contato)}
    ${f('chegou','De onde chegou',c?.chegou)}
    ${f('empresa','Empresa',c?.empresa)}
    ${f('cargo','Cargo',c?.cargo)}
    ${f('endereco','Endereço',c?.endereco)}
    ${f('motivo','Motivo da reunião',c?.motivo)}
    ${f('interesse','Interesse',c?.interesse)}
    <div class="field"><label>Informações</label><textarea class="forminput" id="cf-info">${c?.info||''}</textarea></div>
    <button class="save-btn" onclick="saveClientForm('${id||''}')">Salvar registro</button>
  `;
  openOverlay('clientFormOverlay');
}
function saveClientForm(id){
  const get = k => document.getElementById('cf-'+k).value.trim();
  const nome = get('nome');
  if(!nome) return;
  const list = getClients();
  const data = { nome, email:get('email'), contato:get('contato'), chegou:get('chegou'), empresa:get('empresa'), cargo:get('cargo'), endereco:get('endereco'), motivo:get('motivo'), interesse:get('interesse'), info:get('info') };
  if(id){
    const c = list.find(x=>x.id===id);
    Object.assign(c, data);
    logHistory(todayKey(), 'Registro editado: '+nome, 'var(--slate)');
  } else {
    list.push({ id:'c-'+Date.now(), ...data, historico:[{data:todayKey(), texto:'Registro criado'}] });
    logHistory(todayKey(), 'Registro criado: '+nome, 'var(--slate)');
  }
  saveClients(list);
  closeOverlay('clientFormOverlay');
  go('registros');
}

/* ---------------- routines ---------------- */
const DAY_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
function openRoutineForm(id){
  const r = id ? getRoutines().find(x=>x.id===id) : null;
  document.getElementById('routineFormTitle').textContent = r ? 'Editar rotina' : 'Nova rotina';
  const selectedDays = r ? r.dias : [1,2,3,4,5];
  document.getElementById('routineFormBody').innerHTML = `
    <div class="field"><label>Nome da rotina</label><input class="forminput" id="rf-nome" value="${r?r.nome:''}" /></div>
    <div class="field"><label>Dias da semana</label>
      <div class="daychip-row" id="rf-days">
        ${DAY_LABELS.map((l,i)=>`<div class="daychip ${selectedDays.includes(i)?'on':''}" data-d="${i}" onclick="this.classList.toggle('on')">${l}</div>`).join('')}
      </div>
    </div>
    <div class="timerow">
      <div class="field"><label>Horário</label><input class="forminput" type="time" id="rf-horario" value="${r?r.horario:'08:00'}" /></div>
      <div class="field"><label>Bloco relacionado</label><input class="forminput" id="rf-bloco" placeholder="opcional" value="${r&&r.bloco?r.bloco:''}" /></div>
    </div>
    <div class="timerow">
      <div class="field"><label>Início</label><input class="forminput" type="date" id="rf-inicio" value="${r?r.inicio:todayKey()}" /></div>
      <div class="field"><label>Término (vazio = sem término)</label><input class="forminput" type="date" id="rf-termino" value="${r&&r.termino?r.termino:''}" /></div>
    </div>
    <button class="save-btn" onclick="saveRoutineForm('${id||''}')">Salvar rotina</button>
  `;
  openOverlay('routineFormOverlay');
}
function saveRoutineForm(id){
  const nome = document.getElementById('rf-nome').value.trim();
  if(!nome) return;
  const dias = Array.from(document.querySelectorAll('#rf-days .daychip.on')).map(el=>Number(el.dataset.d));
  const horario = document.getElementById('rf-horario').value;
  const bloco = document.getElementById('rf-bloco').value.trim() || null;
  const inicio = document.getElementById('rf-inicio').value;
  const termino = document.getElementById('rf-termino').value || null;
  const list = getRoutines();
  if(id){ const r=list.find(x=>x.id===id); Object.assign(r,{nome,dias,horario,bloco,inicio,termino}); }
  else list.push({ id:'r-'+Date.now(), nome, dias, horario, bloco, inicio, termino, status:'ativa' });
  saveRoutines(list);
  logHistory(todayKey(), (id?'Rotina editada: ':'Rotina criada: ')+nome, 'var(--slate)');
  closeOverlay('routineFormOverlay');
  go('rotinas');
}
function toggleRoutine(id, newStatus){ const list=getRoutines(); const r=list.find(x=>x.id===id); r.status=newStatus; saveRoutines(list); go('rotinas'); }
function deleteRoutine(id){ saveRoutines(getRoutines().filter(x=>x.id!==id)); go('rotinas'); }

function nextOccurrence(r){
  for(let i=0;i<60;i++){
    const dk = addDays(todayKey(), i);
    if(r.dias.includes(weekdayOf(dk)) && dk>=r.inicio && (!r.termino||dk<=r.termino) && !isSuppressed(r.id,dk)) return dk===todayKey() ? 'hoje' : formatShort(dk);
  }
  return '—';
}

/* ---------------- history (área de acessibilidade) ---------------- */
let histFilterMode = 'hoje';
function histRange(){
  const t = todayKey();
  if(histFilterMode==='hoje') return [t,t];
  if(histFilterMode==='semana') return [addDays(t,-6), t];
  if(histFilterMode==='mes') return [addDays(t,-29), t];
  return [addDays(t,-364), t];
}
function renderHist(){
  document.getElementById('histFilter').innerHTML = ['hoje','semana','mes','ano'].map(m=>
    `<button class="viewtab ${histFilterMode===m?'active':''}" onclick="histFilterMode='${m}'; renderHist();">${m==='mes'?'Mês':m.charAt(0).toUpperCase()+m.slice(1)}</button>`
  ).join('');
  const [start,end] = histRange();
  const items = loadJSON(K.HIST, []).filter(h => h.date>=start && h.date<=end);
  document.getElementById('histList').innerHTML = items.map(h=>`
    <div class="hist-item"><div class="hist-dot" style="background:${h.color}"></div>
      <div><div class="hist-time">${formatShort(h.date)}</div><div class="hist-text">${h.text}</div></div>
    </div>`).join('') || '<div style="font-size:13px;color:var(--ink-dim);">Sem eventos nesse período.</div>';
}
document.getElementById('histBtn').onclick = () => { renderHist(); openOverlay('histOverlay'); };

/* ---------------- overlay helpers ---------------- */
function closeOverlay(id){ document.getElementById(id).classList.remove('open'); }
function openOverlay(id){ document.getElementById(id).classList.add('open'); }

/* ---------------- screens ---------------- */
const screens = {
  home: { title:'CONTAMAIS', render: () => {
    const { blocks, loose } = getAgenda(todayKey());
    let total=0, done=0;
    blocks.forEach(b=>b.tasks.forEach(t=>{total++; if(t.status==='concluida') done++;}));
    loose.forEach(t=>{total++; if(t.status==='concluida') done++;});
    const pct = total ? Math.round(done/total*100) : 0;
    return `
      <div class="hero" onclick="go('agenda')">
        <div class="label">Agenda de hoje</div>
        <div class="date serif">${formatLong(todayKey())}</div>
        <div class="progress-row"><div class="ptrack"><div class="pfill" style="width:${pct}%"></div></div><div class="pnum">${done}/${total}</div></div>
      </div>
      <div class="grid2">
        <div class="tile" onclick="go('registros')"><div class="ticon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/></svg></div><div class="tname">Registros</div><div class="tsub">Pessoas e empresas</div></div>
        <div class="tile" onclick="go('rotinas')"><div class="ticon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div><div class="tname">Rotinas</div><div class="tsub">Atividades recorrentes</div></div>
      </div>`;
  }},

  agenda: { title:'Agenda', render: () => {
    if(agendaView==='dia') return renderAgendaDay();
    if(agendaView==='semana') return renderAgendaWeek();
    return renderAgendaMonth();
  }},

  registros: { title:'Registros', render: () => {
    const q = (document.getElementById('clientSearch')?.value || '').toLowerCase();
    const clients = getClients().filter(c => !q || c.nome.toLowerCase().includes(q) || (c.empresa||'').toLowerCase().includes(q));
    return `
      <div class="searchbar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input id="clientSearch" placeholder="Buscar por nome ou empresa" oninput="go('registros')" value="${q}" />
      </div>
      ${clients.map(c=>`
        <div class="client-row" onclick="openClientPanel('${c.id}')">
          <div class="avatar-lg">${clientAvatar(c.id)}</div>
          <div><div class="cname">${c.nome}</div><div class="cmeta">${c.empresa||'Sem empresa vinculada'}</div></div>
        </div>`).join('') || '<div style="font-size:13px;color:var(--ink-dim);padding:12px 0;">Nenhum registro encontrado.</div>'}
      <button class="fab" aria-label="Novo registro" onclick="openClientForm(null)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
    `;
  }},

  rotinas: { title:'Rotinas', render: () => {
    const list = getRoutines();
    return list.map(r => `
      <div class="routine-row">
        <div class="routine-top">
          <div><div class="routine-name" onclick="openRoutineForm('${r.id}')">${r.nome}</div>
          <div class="routine-freq">${r.dias.map(d=>DAY_LABELS[d]).join(' · ')} · ${r.horario} · próxima ${nextOccurrence(r)}</div></div>
          <span class="pill" ${r.status==='pausada'?'style="color:var(--ink-dim)"':''}>${r.status==='ativa'?'Ativa':'Pausada'}</span>
        </div>
        <div class="routine-actions">
          <button onclick="openRoutineForm('${r.id}')">Editar</button>
          ${r.status==='ativa' ? `<button onclick="toggleRoutine('${r.id}','pausada')">Pausar</button>` : `<button onclick="toggleRoutine('${r.id}','ativa')">Reativar</button>`}
          <button onclick="deleteRoutine('${r.id}')">Excluir</button>
        </div>
      </div>`).join('') + `<button class="fab" aria-label="Nova rotina" onclick="openRoutineForm(null)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>`;
  }}
};

function renderAgendaDay(){
  const dateKey = currentDate;
  const { blocks, loose } = getAgenda(dateKey);
  const locked = isLocked(dateKey);
  return `
    ${viewTabsHTML()}
    <div class="daynav">
      <button class="iconbtn" onclick="currentDate=addDays(currentDate,-1); go('agenda')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
      <span class="dtitle">${formatLong(dateKey)}</span>
      <button class="iconbtn" onclick="currentDate=addDays(currentDate,1); go('agenda')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>
    <input type="date" class="forminput" style="margin-bottom:14px;" value="${dateKey}" onchange="currentDate=this.value; go('agenda')" />
    ${locked ? bannerHTML('Dia bloqueado para edição', 'Já se passaram mais de 72h desde o fim deste dia.') : ''}
    <div class="section-title">Blocos e tarefas</div>
    ${blocks.map(b=>blockHTML(b, dateKey)).join('')}
    ${!locked ? `
      <button class="add-block-btn" onclick="document.getElementById('blockConflictMsg').innerHTML=''; openOverlay('addBlockOverlay')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>Adicionar bloco</button>
      <button class="add-block-btn outline2" onclick="openCompromissoForm()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>Novo compromisso</button>
    ` : ''}
    ${looseTasksHTML(loose, dateKey)}
  `;
}
function viewTabsHTML(){
  return `<div class="viewtabs">
    <button class="viewtab ${agendaView==='dia'?'active':''}" onclick="agendaView='dia'; go('agenda')">Dia</button>
    <button class="viewtab ${agendaView==='semana'?'active':''}" onclick="agendaView='semana'; go('agenda')">Semana</button>
    <button class="viewtab ${agendaView==='mes'?'active':''}" onclick="agendaView='mes'; go('agenda')">Mês</button>
  </div>`;
}
function renderAgendaWeek(){
  const start = addDays(currentDate, -weekdayOf(currentDate));
  let html = viewTabsHTML();
  for(let i=0;i<7;i++){
    const dk = addDays(start,i);
    const { blocks, loose } = getAgenda(dk);
    let total=0; blocks.forEach(b=>total+=b.tasks.length); total+=loose.length;
    html += `<div class="weekcard ${dk===todayKey()?'today':''}" onclick="currentDate='${dk}'; agendaView='dia'; go('agenda')">
      <div><div class="wday serif" style="font-weight:600;">${formatLong(dk)}</div></div>
      <div class="pill">${total} itens</div>
    </div>`;
  }
  return html;
}
function renderAgendaMonth(){
  const d = toDateObj(currentDate);
  const year = d.getFullYear(), month = d.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  let html = viewTabsHTML() + `<div class="daynav"><button class="iconbtn" onclick="currentDate=addDays(currentDate,-28); go('agenda')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button><span class="dtitle">${d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</span><button class="iconbtn" onclick="currentDate=addDays(currentDate,28); go('agenda')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button></div>`;
  html += `<div class="monthgrid">` + DAY_LABELS.map(l=>`<div class="mh">${l}</div>`).join('');
  for(let i=0;i<startOffset;i++) html += `<div class="mcell empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const dk = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const { blocks, loose } = getAgenda(dk);
    let total=0; blocks.forEach(b=>total+=b.tasks.length); total+=loose.length;
    html += `<div class="mcell ${dk===todayKey()?'today':''} ${total>0?'has-items':''}" onclick="currentDate='${dk}'; agendaView='dia'; go('agenda')">${day}</div>`;
  }
  html += `</div>`;
  return html;
}

function go(name){
  document.querySelectorAll('.tabbtn').forEach(b => b.classList.toggle('active', b.dataset.screen===name));
  document.getElementById('screenTitle').textContent = screens[name].title;
  document.getElementById('content').innerHTML = screens[name].render();
  document.getElementById('content').scrollTop = 0;
}
document.querySelectorAll('.tabbtn').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.screen)));

go('home');
