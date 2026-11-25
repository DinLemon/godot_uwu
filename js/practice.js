// Учебная модель редактора. Реальный Godot и его физический движок здесь не запускаются.
(function () {
  "use strict";
  const RK = window.RK;
  const clone = value => JSON.parse(JSON.stringify(value));
  const types = {
    Node: {}, Node2D: {x: 0, y: 0}, Node3D: {x: 0, y: 0, z: 0},
    Sprite2D: {x: 160, y: 100, texture: "", scale: 1, alpha: 1},
    Label: {x: 24, y: 24, text: "", font_size: 24},
    Button: {x: 24, y: 80, text: "Играть"},
    Control: {}, VBoxContainer: {}, CanvasLayer: {}, AnimationPlayer: {}, TileMapLayer: {},
    ProgressBar: {x: 24, y: 120, value: 0, max_value: 100},
    CharacterBody2D: {x: 80, y: 160, speed: 160},
    StaticBody2D: {x: 160, y: 210}, Area2D: {x: 240, y: 160},
    CollisionShape2D: {shape: "", disabled: false},
    Camera2D: {enabled: false, zoom: 1},
    Timer: {wait_time: 1, one_shot: false, autostart: false},
    MeshInstance3D: {x: 0, y: 0, z: 0, mesh: ""},
    Camera3D: {x: 0, y: 2, z: 5, current: false},
    DirectionalLight3D: {energy: 0},
  };
  const propNames = {x:"Position · X", y:"Position · Y", z:"Position · Z", texture:"Texture", scale:"Scale", alpha:"Modulate · Alpha", text:"Text", font_size:"Font Size", value:"Value", max_value:"Max Value", speed:"Speed", shape:"Shape", disabled:"Disabled", enabled:"Enabled", zoom:"Zoom", wait_time:"Wait Time", one_shot:"One Shot", autostart:"Autostart", mesh:"Mesh", current:"Current", energy:"Light Energy"};
  const choices = {texture:["", "icon.svg"], shape:["", "RectangleShape2D", "CircleShape2D"], mesh:["", "BoxMesh", "PlaneMesh"]};
  const keys = ["A", "D", "W", "Space", "ArrowLeft", "ArrowRight", "ArrowUp"];
  const tabs = ["2D", "3D", "Script"];
  const panels = ["Scene", "FileSystem", "Inspector"];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const finite = (n, fallback=0) => Number.isFinite(Number(n)) ? Math.max(-10000, Math.min(10000, Number(n))) : fallback;
  function propsFor(type, input={}) {
    return Object.fromEntries(Object.entries(types[type]).map(([key, value]) => [key,
      typeof value === "boolean" ? input[key] === true : typeof value === "number" ? finite(input[key] ?? value, value) :
      choices[key] ? (choices[key].includes(input[key]) ? input[key] : value) : String(input[key] ?? value).slice(0, 120)]));
  }
  function initial(config) {
    return {v:1, nodes:clone(config.nodes || []), selected:config.nodes?.[0]?.id || null, tab:"2D", panel:"Scene", visited:[], actions:[], connections:[], timeline:{target:"", property:"alpha", duration:1, loop:false, keys:[]}, tiles:Array(40).fill("empty"), brush:"ground", code:config.code||'extends Node\n\nfunc _ready():\n\tprint("Привет, Godot!")', output:"", evidence:null, passed:false};
  }
  function restore(config, raw) {
    const state = initial(config);
    if (!raw || raw.v !== 1 || !Array.isArray(raw.nodes)) return state;
    const ids = new Set(); state.nodes = [];
    for (const node of raw.nodes.slice(0,40)) {
      if (!node || !own(types,node.type) || !/^[a-zA-Z0-9_-]{1,40}$/.test(node.id) || ids.has(node.id)) continue;
      if (node.parent != null && !ids.has(node.parent)) continue;
      if (node.parent == null && state.nodes.some(n=>n.parent==null)) continue;
      ids.add(node.id);
      state.nodes.push({id:node.id, type:node.type, name:String(node.name||node.type).slice(0,40), parent:node.parent ?? null, props:propsFor(node.type,node.props), script:typeof node.script==='string'?node.script.slice(0,80):"", template:node.template === "coin" ? "coin" : ""});
    }
    state.selected = ids.has(raw.selected)?raw.selected:state.nodes[0]?.id || null;
    state.tab = tabs.includes(raw.tab)?raw.tab:"2D";
    state.panel = panels.includes(raw.panel)?raw.panel:"Scene";
    state.visited = Array.isArray(raw.visited)?raw.visited.filter(x=>panels.includes(x)||tabs.includes(x)):[];
    state.actions = Array.isArray(raw.actions)?raw.actions.slice(0,24).filter(a=>a&&/^[a-z][a-z0-9_]{0,39}$/.test(a.name)).map(a=>({name:a.name,keys:Array.isArray(a.keys)?[...new Set(a.keys.filter(k=>keys.includes(k)))]:[]})):[];
    state.connections = Array.isArray(raw.connections)?raw.connections.slice(0,20).filter(c=>c&&ids.has(c.from)&&ids.has(c.target)&&c.signal==='pressed'&&c.behavior==='label').map(c=>({from:c.from,target:c.target,signal:'pressed',behavior:'label'})):[];
    const t=raw.timeline;
    if (t && typeof t==='object') state.timeline={target:ids.has(t.target)?t.target:"",property:["alpha","x"].includes(t.property)?t.property:"alpha",duration:Math.max(.1,finite(t.duration,1)),loop:t.loop===true,keys:Array.isArray(t.keys)?t.keys.slice(0,20).filter(k=>k&&Number.isFinite(k.time)&&Number.isFinite(k.value)).map(k=>({time:Math.max(0,finite(k.time)),value:finite(k.value)})):[]};
    if(Array.isArray(raw.tiles)&&raw.tiles.length===40) state.tiles=raw.tiles.map(x=>["ground","coin","empty"].includes(x)?x:"empty");
    state.brush=["ground","coin","empty"].includes(raw.brush)?raw.brush:"ground";
    state.code=typeof raw.code==='string'?raw.code.slice(0,8000):state.code;
    state.passed=raw.passed===true;
    // Runtime evidence is recomputed, never trusted from an imported progress file.
    return state;
  }
  const nodeBy = (s,id) => s.nodes.find(n=>n.id===id);
  const hasShape = (s,node) => s.nodes.some(n=>n.parent===node.id&&n.type==='CollisionShape2D'&&n.props.shape&&!n.props.disabled);
  function run(state) {
    const actor=state.nodes.find(n=>n.type==='CharacterBody2D');
    const floor=state.nodes.find(n=>n.type==='StaticBody2D'&&hasShape(state,n));
    let stdout="", scriptOk=false;
    if(state.nodes.some(n=>n.script)) {
      try {const result=RK.runGd(state.code);scriptOk=!!result.ok;stdout=result.ok?result.stdout:result.stderr;} catch(e){stdout="Не удалось выполнить скрипт.";}
    }
    return {ran:true, grounded:!!(actor&&hasShape(state,actor)&&floor&&floor.props.y>actor.props.y), x:actor?.props.x ?? 80, collected:[], pressed:false, timer:false, stdout, scriptOk};
  }
  function reduce(config, previous, action) {
    const s=clone(previous); const n=nodeBy(s,s.selected);
    const invalidate=()=>{s.evidence=null;s.output="";};
    switch(action.type) {
      case "select": if(nodeBy(s,action.id))s.selected=action.id; break;
      case "panel": if(panels.includes(action.value)){s.panel=action.value;s.visited=[...new Set([...s.visited,action.value])];} break;
      case "tab": if(tabs.includes(action.value)){s.tab=action.value;s.visited=[...new Set([...s.visited,action.value])];} break;
      case "add": {
        if(!own(types,action.nodeType)||s.nodes.length>=40)break;
        const parent=action.parent ?? s.selected;
        if(s.nodes.length&&!nodeBy(s,parent))break;
        let index=1; while(nodeBy(s,'n'+index))index++;
        const id='n'+index; s.nodes.push({id,type:action.nodeType,name:action.nodeType,parent:s.nodes.length?parent:null,props:propsFor(action.nodeType),script:""});s.selected=id;invalidate();break;
      }
      case "set": if(n&&own(types[n.type],action.key)){n.props=propsFor(n.type,{...n.props,[action.key]:action.value});invalidate();} break;
      case "rename": if(n&&String(action.value).trim()){n.name=String(action.value).trim().slice(0,40);invalidate();} break;
      case "remove": {
        if(!n)break;const removed=new Set([n.id]); let size;
        do{size=removed.size;s.nodes.forEach(x=>{if(removed.has(x.parent))removed.add(x.id);});}while(size!==removed.size);
        s.nodes=s.nodes.filter(x=>!removed.has(x.id));s.connections=s.connections.filter(c=>!removed.has(c.from)&&!removed.has(c.target));
        s.selected=s.nodes[0]?.id||null;if(removed.has(s.timeline.target))s.timeline.target="";invalidate();break;
      }
      case "script": if(n){n.script=String(action.value||'main.gd').slice(0,80);s.tab='Script';invalidate();}break;
      case "code": s.code=String(action.value).slice(0,8000);invalidate();break;
      case "instance": {
        if(!n||s.nodes.length>36)break;
        let index=1;while(nodeBy(s,'coin'+index))index++;
        const id='coin'+index;
        s.nodes.push({id,type:'Area2D',name:'Coin'+index,parent:n.id,props:propsFor('Area2D',{x:80+index*48,y:160}),script:'',template:'coin'},
          {id:id+'sprite',type:'Sprite2D',name:'Sprite2D',parent:id,props:propsFor('Sprite2D',{texture:'icon.svg'}),script:''},
          {id:id+'shape',type:'CollisionShape2D',name:'CollisionShape2D',parent:id,props:propsFor('CollisionShape2D',{shape:'CircleShape2D'}),script:''});invalidate();break;
      }
      case "action": {const name=String(action.name||'').trim();if(/^[a-z][a-z0-9_]{0,39}$/.test(name)&&s.actions.length<24&&!s.actions.some(a=>a.name===name)){s.actions.push({name,keys:[]});invalidate();}break;}
      case "bind": {const a=s.actions.find(a=>a.name===action.name);if(a&&keys.includes(action.key)){a.keys=[...new Set([...a.keys,action.key])];invalidate();}break;}
      case "unbind": {const a=s.actions.find(a=>a.name===action.name);if(a){a.keys=a.keys.filter(k=>k!==action.key);invalidate();}break;}
      case "connect": if(n?.type==='Button'&&nodeBy(s,action.target)?.script){s.connections=s.connections.filter(c=>c.from!==n.id);s.connections.push({from:n.id,target:action.target,signal:'pressed',behavior:'label'});invalidate();}break;
      case "timeline": if(['target','property','duration','loop'].includes(action.key)){s.timeline[action.key]=action.value;s.timeline.duration=Math.max(.1,finite(s.timeline.duration,1));invalidate();}break;
      case "key": {const time=Number(action.time),value=Number(action.value);if(Number.isFinite(time)&&Number.isFinite(value)&&time>=0&&time<=s.timeline.duration&&s.timeline.keys.length<20){s.timeline.keys=s.timeline.keys.filter(k=>Math.abs(k.time-time)>.0001);s.timeline.keys.push({time,value});s.timeline.keys.sort((a,b)=>a.time-b.time);invalidate();}break;}
      case "removeKey": s.timeline.keys.splice(action.index,1);invalidate();break;
      case "brush": if(['ground','coin','empty'].includes(action.value))s.brush=action.value;break;
      case "paint": if(Number.isInteger(action.index)&&action.index>=0&&action.index<40){s.tiles[action.index]=s.brush;invalidate();}break;
      case "run": s.evidence=run(s);s.output=s.evidence.stdout|| (s.evidence.grounded?'Персонаж стоит на полу. Форма столкновения работает.':'Предпросмотр запущен.');break;
      case "move": {
        if(!s.evidence?.ran)break;const direction=action.direction===-1?-1:1;
        if(config.mode==='input'&&!s.actions.some(a=>a.name===(direction<0?'move_left':'move_right')&&a.keys.length)){s.output='Для этого направления пока не назначены клавиши.';break;}
        s.evidence.x=Math.max(16,Math.min(304,s.evidence.x+direction*32));
        s.nodes.filter(n=>n.type==='Area2D').forEach(n=>{if(Math.abs(n.props.x-s.evidence.x)<28&&hasShape(s,n)&&!s.evidence.collected.includes(n.id))s.evidence.collected.push(n.id);});
        s.output='Позиция X: '+s.evidence.x+'. Собрано монет: '+s.evidence.collected.length;break;
      }
      case "press": if(s.evidence?.ran){s.evidence.pressed=s.nodes.some(n=>n.type==='Label')&&s.connections.some(c=>nodeBy(s,c.from)?.type==='Button'&&nodeBy(s,c.target)?.script);s.output=s.evidence.pressed?'Label: Работает!':'Кнопка нажата, но сигнал не подключён или в сцене нет Label.';}break;
      case "timer": if(s.evidence?.ran){s.evidence.timer=s.nodes.some(n=>n.type==='Timer'&&n.props.autostart&&n.props.wait_time>0&&n.props.wait_time<=3);s.output=s.evidence.timer?'timeout — прошло 3 учебные секунды.':'Timer не запустился или ещё не дошёл до timeout.';}break;
      case "check": break;
      default: return previous;
    }
    return s;
  }
  function matches(s,node,pattern) {
    if(!node||node.type!==pattern.type)return false;
    if(pattern.script&&!node.script)return false;
    if(pattern.template&&node.template!==pattern.template)return false;
    for(const [key,rule] of Object.entries(pattern.props||{})) {
      const value=node.props[key];
      if(rule.nonempty&&!String(value??'').trim())return false;
      if(own(rule,'eq')&&value!==rule.eq)return false;
      if(own(rule,'min')&&!(value>=rule.min))return false;
      if(own(rule,'max')&&!(value<=rule.max))return false;
    }
    return (pattern.children||[]).every(p=>s.nodes.some(child=>child.parent===node.id&&matches(s,child,p)));
  }
  function evaluate(config,s) {
    const results=config.goals.map(goal=>{
      let ok=false;
      if(goal.kind==='node')ok=s.nodes.filter(n=>matches(s,n,goal.pattern)).length>=(goal.count||1);
      else if(goal.kind==='visit')ok=goal.values.every(v=>s.visited.includes(v));
      else if(goal.kind==='action')ok=s.actions.some(a=>a.name===goal.name&&goal.keys.every(k=>a.keys.includes(k)));
      else if(goal.kind==='run')ok=!!s.evidence?.ran;
      else if(goal.kind==='print')ok=!!s.evidence?.scriptOk&&!!s.evidence.stdout?.trim();
      else if(goal.kind==='grounded')ok=!!s.evidence?.grounded;
      else if(goal.kind==='signal')ok=!!s.evidence?.pressed;
      else if(goal.kind==='timer')ok=!!s.evidence?.timer;
      else if(goal.kind==='collect')ok=s.evidence?.grounded&&s.evidence.collected.length>=(goal.count||1);
      else if(goal.kind==='timeline') {
        const t=s.timeline;
        ok=nodeBy(s,t.target)?.type==='Sprite2D'&&t.property==='alpha'&&t.loop&&t.keys.some(k=>Math.abs(k.time)<.001&&k.value>=.99)&&t.keys.some(k=>Math.abs(k.time-t.duration)<.001&&k.value<=.05);
      } else if(goal.kind==='tiles') {
        // A traversable ground strip under columns 1..6, plus a coin above that strip.
        ok=Array.from({length:6},(_,i)=>33+i).every(i=>s.tiles[i]==='ground')&&s.tiles.some((v,i)=>v==='coin'&&i%8>=1&&i%8<=6&&Math.floor(i/8)===3);
      }
      return {ok:!!ok,label:goal.label,hint:goal.hint};
    });
    return {ok:results.every(r=>r.ok),results};
  }
  RK.Practice={types,initial,restore,reduce,evaluate,matches};

  // Rendering intentionally uses native form controls: every operation also works without dragging.
  const esc=RK.esc;
  const button=(action,label,extra='')=>`<button type="button" class="lab-button" data-action="${action}" ${extra}>${esc(label)}</button>`;
  const option=(value,label,selected)=>`<option value="${esc(value)}"${selected?' selected':''}>${esc(label)}</option>`;
  function render(id,host,storage={}) {
    const config=window.GODOT_PRACTICE?.[id]; if(!config)return;
    let state=restore(config,storage.read?.(id)),dialog=null,message='',checked=false,hintIndex=0;
    const root=document.createElement('section'); root.className='practice-lab';root.setAttribute('aria-label',config.title);host.appendChild(root);
    const dispatch=(action,repaint=true)=>{state=reduce(config,state,action);if(!['select','panel','tab','brush'].includes(action.type)){checked=false;message='';}storage.write?.(id,state);if(repaint)paint();else{root.querySelector('.lab-feedback').textContent='';root.querySelector('.lab-feedback').className='lab-feedback';root.querySelectorAll('.lab-goals>div').forEach(el=>el.className='');root.querySelector('.lab-output output').textContent=state.output||'Изменено. Запусти предпросмотр ещё раз.';const work=root.querySelector('.lab-workspace');if(state.tab!=='Script'&&!['input','tiles','animation'].includes(config.mode))work.innerHTML=preview();if(config.mode==='animation'){root.querySelector('[data-scrub]')?.setAttribute('max',state.timeline.duration);root.querySelector('input[name=time]')?.setAttribute('max',state.timeline.duration);}}};
    function tree() {
      const depth=n=>{let d=0;while(n.parent&&d<40){d++;n=nodeBy(state,n.parent);if(!n)break;}return d;};
      return state.nodes.length?state.nodes.map(n=>button('select',n.name,`data-id="${n.id}" aria-pressed="${n.id===state.selected}" style="--depth:${depth(n)}"`)).join(''):'<p class="lab-empty">Сцена пока пустая. Создай корневой узел.</p>';
    }
    function field(n,key,value) {
      const attrs=`data-prop="${key}" aria-label="${esc(propNames[key]||key)}"`;
      const input=typeof value==='boolean'?`<input type="checkbox" ${attrs}${value?' checked':''}>`:choices[key]?`<select ${attrs}>${choices[key].map(v=>option(v,v||'Не задано',v===value)).join('')}</select>`:`<input ${attrs} type="${typeof value==='number'?'number':'text'}" value="${esc(value)}" ${typeof value==='number'?'step="any" min="-10000" max="10000" required':''}>`;
      return `<label class="lab-field"><span>${esc(propNames[key]||key)}</span>${input}</label>`;
    }
    function inspector() {
      const n=nodeBy(state,state.selected);if(!n)return '<p class="lab-empty">Выбери узел в Scene.</p>';
      return `<p class="lab-node-type">${esc(n.type)}</p><label class="lab-field"><span>Node name</span><input data-name value="${esc(n.name)}" maxlength="40" aria-label="Node name"></label>${Object.entries(n.props).map(([k,v])=>field(n,k,v)).join('')}<p class="small">Script: ${esc(n.script||'не прикреплён')}</p>${button('script','Attach Script')}${n.type==='Button'?button('signal','Signals · pressed → Connect'):''}`;
    }
    function preview() {
      const x=state.evidence?.x;
      const nodes=state.nodes.filter(n=>['Sprite2D','CharacterBody2D','StaticBody2D','Area2D','Label','Button','ProgressBar'].includes(n.type));
      const scene=nodes.map(n=>{
        if(n.parent&&['CharacterBody2D','Area2D'].includes(nodeBy(state,n.parent)?.type))return '';
        const px=n.type==='CharacterBody2D'&&x!=null?x:n.props.x??30;
        const py=n.props.y??30;
        if(n.type==='Label')return `<text x="${px}" y="${py+20}" font-size="${Math.max(8,Math.min(40,n.props.font_size))}" fill="currentColor">${esc(state.evidence?.pressed?'Работает!':n.props.text)}</text>`;
        if(n.type==='StaticBody2D')return `<rect x="${px-120}" y="${py}" width="240" height="16" rx="3" fill="#85b89f"/>`;
        if(n.type==='Area2D')return state.evidence?.collected.includes(n.id)?'':`<circle cx="${px}" cy="${py}" r="10" fill="#f1ca71"/>`;
        if(n.type==='Button')return `<g><rect x="${px}" y="${py}" width="105" height="30" rx="5" fill="#82b5d8"/><text x="${px+8}" y="${py+20}" font-size="14" fill="#182431">${esc(n.props.text)}</text></g>`;
        if(n.type==='ProgressBar')return `<g><rect x="${px}" y="${py}" width="120" height="18" fill="#425467"/><rect x="${px}" y="${py}" width="${120*Math.max(0,Math.min(1,n.props.value/Math.max(1,n.props.max_value)))}" height="18" fill="#85b89f"/></g>`;
        return `<image href="assets/${n.type==='CharacterBody2D'?'fox-godot-960.webp':'godot.svg'}" x="${px-18}" y="${py-24}" width="40" height="40" opacity="${n.props.alpha??1}"/>`;
      }).join('');
      const camera=state.nodes.some(n=>n.type==='Camera2D'&&n.props.enabled)?'<rect x="8" y="8" width="304" height="218" fill="none" stroke="#bba3df" stroke-dasharray="5 4"/>':'';
      if(state.tab==='3D')return `<svg viewBox="0 0 320 240" role="img" aria-label="Упрощённый предпросмотр 3D-сцены"><path d="m20 170 140-70 140 70-140 60Z" fill="#8cafad"/>${state.nodes.some(n=>n.type==='MeshInstance3D'&&n.props.mesh==='BoxMesh')?'<path d="m125 100 35-18 35 18-35 18Z" fill="#d4bfed"/><path d="m125 100 35 18v48l-35-18Z" fill="#a58bc9"/><path d="m160 118 35-18v48l-35 18Z" fill="#7b69a0"/>':''}<text x="12" y="28" fill="currentColor" font-size="14">3D · учебная модель</text></svg>`;
      return `<svg viewBox="0 0 320 240" role="img" aria-label="Предпросмотр собранной сцены"><defs><pattern id="grid-${id}" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="currentColor" opacity=".10"/></pattern></defs><rect width="320" height="240" fill="url(#grid-${id})"/>${camera}${scene}</svg>`;
    }
    function inputMap() {
      return `<div class="lab-settings"><h4>Project Settings · Input Map</h4><form data-form="action"><label>Add New Action<input name="action" aria-label="Add New Action" required pattern="[a-z][a-z0-9_]*" maxlength="40"></label><button class="lab-button">Add</button></form>${state.actions.map(a=>`<div class="lab-action-row"><strong>${esc(a.name)}</strong><div>${a.keys.map(k=>button('unbind',k+' ×',`data-name="${esc(a.name)}" data-key="${k}" aria-label="Убрать ${k} у ${esc(a.name)}"`)).join('')}</div>${button('bind','+ Клавиша',`data-name="${esc(a.name)}"`)}</div>`).join('')}</div>`;
    }
    function timeline() {
      const t=state.timeline;
      return `<div class="lab-timeline"><h4>AnimationPlayer · blink</h4><label>Узел<select data-timeline="target" aria-label="Узел анимации">${option('','Выбери Sprite2D',!t.target)}${state.nodes.filter(n=>n.type==='Sprite2D').map(n=>option(n.id,n.name,t.target===n.id)).join('')}</select></label><label>Свойство<select data-timeline="property" aria-label="Свойство анимации">${option('alpha','modulate:a',t.property==='alpha')}${option('x','position:x',t.property==='x')}</select></label><label>Длина, с<input type="number" min="0.1" max="10" step="0.1" data-timeline="duration" value="${t.duration}" aria-label="Длина анимации"></label><label><input type="checkbox" data-timeline="loop"${t.loop?' checked':''}> Loop</label><form data-form="key"><label>Время<input name="time" aria-label="Время ключа" type="number" min="0" max="${t.duration}" step="0.1" required value="0"></label><label>Значение<input name="value" aria-label="Значение ключа" type="number" min="0" max="1" step="0.1" required value="1"></label><button class="lab-button">Добавить ключ</button></form><div class="lab-key-list">${t.keys.map((k,i)=>button('removeKey',k.time+' c → '+k.value+' ×',`data-index="${i}"`)).join('')}</div><label>Курсор времени<input type="range" min="0" max="${t.duration}" step="0.05" value="0" data-scrub aria-label="Курсор времени анимации"></label><div class="lab-animation-sample"><img src="assets/godot.svg" alt="Предпросмотр анимации"></div></div>`;
    }
    function tileMap() {
      return `<div class="lab-tiles"><h4>TileMapLayer · рисуй клетки</h4><div class="lab-brushes">${[['ground','Земля'],['coin','Монета'],['empty','Ластик']].map(([v,l])=>button('brush',l,`data-value="${v}" aria-pressed="${state.brush===v}"`)).join('')}</div><p class="small">Собери пол под столбцами 2–7 в нижнем ряду. Монету поставь прямо над ним. Клетки доступны с клавиатуры.</p><div class="lab-tile-grid" role="group" aria-label="Поле уровня 8 на 5">${state.tiles.map((v,i)=>button('paint',v==='coin'?'●':v==='ground'?'■':'·',`data-index="${i}" data-tile="${v}" aria-label="Строка ${Math.floor(i/8)+1}, столбец ${i%8+1}: ${v==='ground'?'земля':v==='coin'?'монета':'пусто'}"`)).join('')}</div></div>`;
    }
    function dialogHTML() {
      if(!dialog)return '';
      let body='';
      if(dialog.type==='add')body=`<form data-form="node"><label>Search<input name="search" data-search aria-label="Поиск типа узла" placeholder="Например, Label" autocomplete="off"></label><label>Тип узла<select name="type" size="6" required aria-label="Тип нового узла">${Object.keys(types).map((t,i)=>option(t,t,i===0)).join('')}</select></label><p class="small">Родитель: ${esc(nodeBy(state,state.selected)?.name||'корень сцены')}</p><button class="lab-button">Create</button></form>`;
      if(dialog.type==='bind')body=`<form data-form="bind"><p>Действие: <b>${esc(dialog.name)}</b></p><label>Клавиша<select name="key" aria-label="Клавиша действия">${keys.map(k=>option(k,k,false)).join('')}</select></label><button class="lab-button">OK</button></form>`;
      if(dialog.type==='script')body=`<form data-form="script"><label>Path<input name="path" value="main.gd" aria-label="Путь скрипта" required pattern="[A-Za-z0-9_/-]+[.]gd"></label><button class="lab-button">Create · Attach</button></form>`;
      if(dialog.type==='signal')body=`<form data-form="signal"><p>pressed → _on_button_pressed()</p><label>Узел-получатель со скриптом<select name="target" aria-label="Получатель сигнала">${state.nodes.filter(n=>n.script).map(n=>option(n.id,n.name,false)).join('')}</select></label><p class="small">Подготовленный обработчик меняет текст Label на «Работает!». В Godot его тело пишут в скрипте.</p><button class="lab-button">Connect</button></form>`;
      return `<div class="lab-dialog" role="dialog" aria-label="${esc({add:'Create New Node',bind:'Настройка клавиши',script:'Attach Node Script',signal:'Connect a Signal'}[dialog.type])}"><div class="lab-dialog-head"><strong>${esc({add:'Create New Node',bind:'Input Event',script:'Attach Node Script',signal:'Connect a Signal'}[dialog.type])}</strong>${button('cancel','Закрыть')}</div>${body}</div>`;
    }
    function paint() {
      const assessment=evaluate(config,state);
      const n=nodeBy(state,state.selected);
      root.innerHTML=`<div class="lab-heading"><img src="assets/fox-godot-960.webp" width="64" height="54" alt=""><div><span class="lab-eyebrow">Практика в браузере</span><h3>${esc(config.title)}</h3></div></div><p>${esc(config.brief)}</p><p class="lab-model-note">Учебная модель Godot 4. Здесь проверяется состояние сцены; полноценный редактор и физика Godot не запускаются. Затем повтори действия в Godot.</p><div class="lab-goals" aria-label="Цели задания">${assessment.results.map(r=>`<div class="${checked?(r.ok?'lab-goal-ok':'lab-goal-missing'):''}">${checked?(r.ok?'✓':'○'):'·'} ${esc(r.label)}</div>`).join('')}</div>
      <div class="lab-editor"><div class="lab-toolbar"><span>Godot · учебная сцена</span>${['2D','3D','Script'].map(t=>button('tab',t,`data-value="${t}" aria-pressed="${state.tab===t}"`)).join('')}${button('run','▶ F6 · Запустить')}</div><div class="lab-scene"><div class="lab-panel-heading">${button('panel','Scene',`data-value="Scene"`)}${button('add','+ Узел')}${button('remove','Удалить',!n?'disabled':'')}</div><div class="lab-tree">${tree()}</div>${config.mode==='instance'||config.mode==='final'?button('instance','Instantiate · coin.tscn',!n?'disabled':''):''}<div class="lab-files">${button('panel','FileSystem',`data-value="FileSystem"`)}<span>res://</span><span>icon.svg</span>${state.nodes.some(n=>n.script)?'<span>main.gd</span>':''}${config.mode==='instance'||config.mode==='final'?'<span>coin.tscn · готовый шаблон</span>':''}</div></div><div class="lab-workspace">${state.panel==='FileSystem'?'<p class="lab-selection-note">FileSystem: здесь лежат ресурсы проекта. icon.svg можно назначить в Texture.</p>':''}${state.tab==='Script'?`<label>GDScript · ${esc(n?.script||'выбери узел и Attach Script')}<textarea class="lab-code" data-code aria-label="Скрипт сцены" spellcheck="false" ${config.mode==='signal'?'readonly':''}>${esc(config.mode==='signal'?config.code:state.code)}</textarea></label>`:config.mode==='input'?inputMap():config.mode==='tiles'?tileMap():config.mode==='animation'?timeline():preview()}</div><div class="lab-inspector"><div class="lab-panel-heading">${button('panel','Inspector',`data-value="Inspector"`)}</div>${inspector()}</div><div class="lab-output">${config.mode==='input'&&state.evidence?.ran?'<div class="lab-runtime-preview">'+preview()+'</div>':''}<b>Output</b><output>${esc(state.output||'Измени сцену и запусти предпросмотр.')}</output>${state.evidence?.ran?`<div class="lab-test-controls">${config.mode==='input'||config.mode==='final'?button('move','← Влево','data-direction="-1"')+button('move','Вправо →','data-direction="1"'):''}${config.mode==='signal'?button('press','Нажать кнопку в игре'):''}${config.mode==='timer'?button('timer','Пропустить 3 учебные секунды'):''}</div>`:''}</div></div>${dialogHTML()}<div class="lab-controls">${button('check','Проверить сцену')}${button('hint','Подсказка')}${button('reset','Сбросить это задание')}</div><div class="lab-feedback${checked&&assessment.ok?' lab-success':''}" role="status">${esc(message)}</div><p class="lab-transfer">${esc(config.transfer)}</p>`;
    }
    root.addEventListener('click',event=>{
      const b=event.target.closest('button[data-action]');if(!b||!root.contains(b))return;
      const a=b.dataset.action;
      if(['add','script','signal','bind'].includes(a)){dialog={type:a,name:b.dataset.name};paint();root.querySelector('.lab-dialog input,.lab-dialog select')?.focus();return;}
      if(a==='cancel'){dialog=null;paint();return;}
      if(a==='check'){const invalid=root.querySelector('input:invalid,select:invalid');if(invalid){invalid.reportValidity();return;}const result=evaluate(config,state);checked=true;if(result.ok){state.passed=true;storage.write?.(id,state);storage.attempt?.();message='Получилось. Сцена отвечает всем условиям. '+config.success;}else{message='Пока не хватает: '+result.results.filter(r=>!r.ok).map(r=>r.hint).join(' ');storage.attempt?.();}paint();return;}
      if(a==='hint'){message=config.hints[Math.min(hintIndex++,config.hints.length-1)];paint();return;}
      if(a==='reset'){state=initial(config);dialog=null;checked=false;hintIndex=0;message='Задание возвращено к началу. Остальной прогресс курса сохранён.';storage.write?.(id,state);paint();return;}
      dispatch({type:a,id:b.dataset.id,value:b.dataset.value,name:b.dataset.name,key:b.dataset.key,index:Number(b.dataset.index),direction:Number(b.dataset.direction)});
    });
    root.addEventListener('submit',event=>{
      const form=event.target;if(!form.dataset.form)return;event.preventDefault();const values=new FormData(form);const mode=form.dataset.form;
      const action=mode==='node'?{type:'add',nodeType:values.get('type')}:mode==='action'?{type:'action',name:values.get('action')}:mode==='bind'?{type:'bind',name:dialog.name,key:values.get('key')}:mode==='script'?{type:'script',value:values.get('path')}:mode==='signal'?{type:'connect',target:values.get('target')}:{type:'key',time:values.get('time'),value:values.get('value')};
      dialog=null;dispatch(action);
    });
    root.addEventListener('change',event=>{
      const e=event.target;
      if(e.hasAttribute('data-prop'))dispatch({type:'set',key:e.dataset.prop,value:e.type==='checkbox'?e.checked:e.type==='number'?e.value===''?NaN:Number(e.value):e.value},false);
      else if(e.hasAttribute('data-name'))dispatch({type:'rename',value:e.value},false);
      else if(e.hasAttribute('data-code'))dispatch({type:'code',value:e.value},false);
      else if(e.hasAttribute('data-timeline'))dispatch({type:'timeline',key:e.dataset.timeline,value:e.type==='checkbox'?e.checked:e.type==='number'?Number(e.value):e.value},false);
    });
    root.addEventListener('input',event=>{
      const e=event.target;
      if(e.hasAttribute('data-search')) {
        const select=root.querySelector('select[name="type"]');const available=Object.keys(types).filter(t=>t.toLowerCase().includes(e.value.toLowerCase()));select.innerHTML=available.map((t,i)=>option(t,t,i===0)).join('');
      }
      if(e.hasAttribute('data-name')){dispatch({type:'rename',value:e.value},false);const treeButton=root.querySelector(`button[data-action="select"][data-id="${state.selected}"]`);if(treeButton)treeButton.textContent=nodeBy(state,state.selected).name;}
      else if(e.hasAttribute('data-code'))dispatch({type:'code',value:e.value},false);
      else if(e.hasAttribute('data-prop')&&e.type!=='checkbox'&&e.tagName==='INPUT'&&(e.type!=='number'||e.value!==''&&e.validity.valid))dispatch({type:'set',key:e.dataset.prop,value:e.type==='number'?Number(e.value):e.value},false);
      else if(e.hasAttribute('data-timeline')&&e.type==='number'&&e.value!==''&&e.validity.valid)dispatch({type:'timeline',key:e.dataset.timeline,value:Number(e.value)},false);
      if(e.hasAttribute('data-scrub')) {
        const t=state.timeline;const time=Number(e.value);const sorted=t.keys.slice().sort((a,b)=>a.time-b.time);const before=sorted.filter(k=>k.time<=time).at(-1)||sorted[0];const after=sorted.find(k=>k.time>=time)||sorted.at(-1);const image=root.querySelector('.lab-animation-sample img');
        if(before&&after){const value=before.time===after.time?before.value:before.value+(after.value-before.value)*(time-before.time)/(after.time-before.time);image.style.opacity=t.property==='alpha'?Math.max(0,Math.min(1,value)):1;image.style.transform=t.property==='x'?`translateX(${Math.max(-60,Math.min(60,value))}px)`:'none';}
      }
    });
    paint();
  }
  RK.renderPractice=render;
})();
