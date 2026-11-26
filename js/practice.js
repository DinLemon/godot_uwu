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
      const saved=state.nodes.at(-1),parent=state.nodes.find(n=>n.id===saved.parent);
      // Older previews hid body-owned sprites and ignored their default position.
      if(saved.type==='Sprite2D'&&['CharacterBody2D','Area2D'].includes(parent?.type)&&saved.props.x===160&&saved.props.y===100){saved.props.x=0;saved.props.y=0;}
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
    state.showShapes=raw.showShapes===true;
    // Runtime evidence is recomputed, never trusted from an imported progress file.
    return state;
  }
  const nodeBy = (s,id) => s.nodes.find(n=>n.id===id);
  const hasShape = (s,node) => s.nodes.some(n=>n.parent===node.id&&n.type==='CollisionShape2D'&&n.props.shape&&!n.props.disabled);
  function worldPosition(s,node) {
    let x=0,y=0,steps=0;
    while(node&&steps++<40){x+=Number(node.props.x)||0;y+=Number(node.props.y)||0;node=nodeBy(s,node.parent);}
    return {x,y};
  }
  function descendants(s,id) {
    const ids=new Set([id]);let size;
    do{size=ids.size;s.nodes.forEach(n=>{if(ids.has(n.parent))ids.add(n.id);});}while(size!==ids.size);
    return ids;
  }
  function sortTree(s) {
    const sorted=[];
    const visit=parent=>s.nodes.filter(n=>n.parent===parent).forEach(n=>{sorted.push(n);visit(n.id);});
    visit(null);s.nodes=sorted;
  }
  function floors(s,config) {
    const list=s.nodes.filter(n=>n.type==='StaticBody2D'&&hasShape(s,n)).map(n=>{const p=worldPosition(s,n);return {left:p.x-120,right:p.x+120,y:p.y};});
    if(config.mode==='input')list.push({left:0,right:320,y:210});
    if(config.mode==='tiles')s.tiles.forEach((v,i)=>{if(v==='ground')list.push({left:i%8*40,right:(i%8+1)*40,y:Math.floor(i/8)*40});});
    return list;
  }
  function collect(s,config) {
    const e=s.evidence;if(!e)return;
    const coins=s.nodes.filter(n=>n.type==='Area2D'&&hasShape(s,n)).map(n=>({id:n.id,...worldPosition(s,n)}));
    if(config.mode==='tiles')s.tiles.forEach((v,i)=>{if(v==='coin')coins.push({id:'tile'+i,x:i%8*40+20,y:Math.floor(i/8)*40+20});});
    coins.forEach(c=>{if(Math.abs(c.x-e.x)<28&&Math.abs(c.y-e.y)<40&&!e.collected.includes(c.id))e.collected.push(c.id);});
  }
  function gameFrame(s,config,dt,direction=0) {
    const e=s.evidence;if(!e?.ran)return;
    const actor=s.nodes.find(n=>n.type==='CharacterBody2D');
    if(!actor&&config.mode!=='tiles')return;
    const time=Math.max(0,Math.min(.04,Number(dt)||0));
    e.x=Math.max(16,Math.min(304,e.x+Math.max(-1,Math.min(1,direction))*(actor?.props.speed||160)*time));
    const surfaces=floors(s,config).filter(f=>e.x>=f.left-8&&e.x<=f.right+8);
    const previous=e.y;e.vy+=700*time;e.y+=e.vy*time;e.grounded=false;
    if((actor&&hasShape(s,actor))||['tiles','input'].includes(config.mode)) {
      const landing=surfaces.filter(f=>e.vy>=0&&previous+16<=f.y+1&&e.y+16>=f.y).sort((a,b)=>a.y-b.y)[0];
      if(landing){e.y=landing.y-16;e.vy=0;e.grounded=true;}
    }
    collect(s,config);
    if(e.y>300){const fresh=run(s,config);s.evidence={...fresh,collected:e.collected,jumps:e.jumps,settled:!fresh.grounded};s.output='Персонаж вернулся на старт. Проверь, есть ли под ним пол.';}
    else s.output=`X: ${Math.round(e.x)} · Y: ${Math.round(e.y)} · Монеты: ${e.collected.length}${e.grounded?' · на полу':''}`;
  }
  function run(state,config={}) {
    const actor=state.nodes.find(n=>n.type==='CharacterBody2D');
    const start=actor?worldPosition(state,actor):{x:60,y:100};
    const floor=floors(state,config).filter(f=>start.x>=f.left&&start.x<=f.right&&f.y>=start.y).sort((a,b)=>a.y-b.y)[0];
    const grounded=!!(floor&&((actor&&hasShape(state,actor))||['tiles','input'].includes(config.mode)));
    let stdout="", scriptOk=false;
    if(state.nodes.some(n=>n.script)) {
      try {const result=RK.runGd(state.code);scriptOk=!!result.ok;stdout=result.ok?result.stdout:result.stderr;} catch(e){stdout="Не удалось выполнить скрипт.";}
    }
    return {ran:true, grounded, x:start.x, y:grounded?floor.y-16:start.y,vy:0,jumps:0,collected:[],pressed:false,timer:false,stdout,scriptOk};
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
      case "transform": if(n&&own(n.props,'x')&&own(n.props,'y')){n.props.x=finite(action.x,n.props.x);n.props.y=finite(action.y,n.props.y);invalidate();}break;
      case "reparent": {
        const parent=nodeBy(s,action.parent);
        if(!n||n.parent===null||!parent||descendants(s,n.id).has(parent.id))break;
        const before=worldPosition(s,n),after=worldPosition(s,parent);
        n.parent=parent.id;if(own(n.props,'x'))n.props.x=before.x-after.x;if(own(n.props,'y'))n.props.y=before.y-after.y;
        sortTree(s);invalidate();break;
      }
      case "duplicate": {
        if(!n||n.parent===null)break;
        const branch=s.nodes.filter(x=>descendants(s,n.id).has(x.id));if(s.nodes.length+branch.length>40)break;
        const mapping=new Map();let next=1;branch.forEach(x=>{while(nodeBy(s,'n'+next)||[...mapping.values()].includes('n'+next))next++;mapping.set(x.id,'n'+next++);});
        const copies=branch.map(x=>({...clone(x),id:mapping.get(x.id),parent:mapping.get(x.parent)||x.parent,name:x.id===n.id?x.name+' copy':x.name}));
        if(own(copies[0].props,'x'))copies[0].props.x+=32;
        s.nodes.push(...copies);s.connections.push(...s.connections.filter(c=>mapping.has(c.from)).map(c=>({...c,from:mapping.get(c.from),target:mapping.get(c.target)||c.target})));
        s.selected=copies[0].id;sortTree(s);invalidate();break;
      }
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
      case "run": s.evidence=run(s,config);s.output=s.evidence.stdout|| (s.evidence.grounded?'Персонаж стоит на полу. Форма столкновения работает.':'Предпросмотр запущен.');break;
      case "stop": invalidate();break;
      case "frame": gameFrame(s,config,action.dt,action.direction);break;
      case "jump": if(config.mode==='input'&&!s.actions.some(a=>a.name==='jump'&&a.keys.length)){s.output='Назначь клавишу для jump в Input Map.';break;}if(s.evidence?.grounded){s.evidence.vy=-300;s.evidence.grounded=false;s.evidence.jumps++;}break;
      case "move": {
        if(!s.evidence?.ran)break;const direction=action.direction===-1?-1:1;
        if(config.mode==='input'&&!s.actions.some(a=>a.name===(direction<0?'move_left':'move_right')&&a.keys.length)){s.output='Для этого направления пока не назначены клавиши.';break;}
        s.evidence.x=Math.max(16,Math.min(304,s.evidence.x+direction*32));
        if(!floors(s,config).some(f=>s.evidence.x>=f.left-8&&s.evidence.x<=f.right+8&&Math.abs(s.evidence.y+16-f.y)<2))s.evidence.grounded=false;
        collect(s,config);
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
      else if(goal.kind==='jumpCollect')ok=s.evidence?.grounded&&s.evidence.jumps>0&&s.evidence.collected.length>=(goal.count||1);
      else if(goal.kind==='spread'){const positions=s.nodes.filter(n=>n.type==='Area2D'&&n.template==='coin').map(n=>worldPosition(s,n).x).sort((a,b)=>a-b);ok=positions.length>=3&&positions.every((v,i)=>!i||v-positions[i-1]>=35);}
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
  function sampleAnimation(t,time){
    const keys=t.keys.slice().sort((a,b)=>a.time-b.time);if(!keys.length)return null;
    const before=keys.filter(k=>k.time<=time).at(-1)||keys[0],after=keys.find(k=>k.time>=time)||keys.at(-1);
    return before.time===after.time?before.value:before.value+(after.value-before.value)*(time-before.time)/(after.time-before.time);
  }
  RK.Practice={types,initial,restore,reduce,evaluate,matches,worldPosition,sampleAnimation};

  // Rendering intentionally uses native form controls: every operation also works without dragging.
  const esc=RK.esc;
  function nodeIcon(type){
    const color=type==='Sprite2D'?'#8ed39b':type==='CollisionShape2D'?'#a0c8f0':type==='Label'||type==='Button'||type==='Control'?'#a4dfb5':type==='Area2D'?'#b7a0e8':'#95bbef';
    const path=type==='Sprite2D'?'<rect x="2" y="3" width="12" height="10" rx="1"/><path d="m3 12 4-4 3 3 2-2 2 3"/><circle cx="11" cy="6" r="1"/>':type==='Label'?'<path d="M3 3h10M8 3v10M5 13h6"/>':type==='CollisionShape2D'?'<path d="m8 2 6 11H2Z"/>':type==='Button'||type==='Control'?'<rect x="2" y="4" width="12" height="8" rx="2"/><path d="M5 8h6"/>':type==='AnimationPlayer'?'<rect x="2" y="2" width="12" height="12" rx="2"/><path d="m6 5 5 3-5 3Z"/>':type==='Timer'?'<circle cx="8" cy="9" r="5"/><path d="M6 2h4M8 9V5"/>':'<path d="M8 1v14M1 8h14"/><circle cx="8" cy="8" r="3"/>';
    return `<svg class="lab-node-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="${color}" stroke-width="1.5">${path}</svg>`;
  }
  const button=(action,label,extra='')=>`<button type="button" class="lab-button" data-action="${action}" ${extra}>${esc(label)}</button>`;
  const option=(value,label,selected)=>`<option value="${esc(value)}"${selected?' selected':''}>${esc(label)}</option>`;
  function render(id,host,storage={}) {
    const config=window.GODOT_PRACTICE?.[id]; if(!config)return;
    let state=restore(config,storage.read?.(id)),dialog=null,message='',checked=false,hintIndex=0;
    let undo=[],redo=[],gesture=null,group=null,animation=null,frameId=0,lastTime=0,suppressClick=false;
    const held=new Set();
    let rightTab='Inspector',bottom='Output',gameScreen=false,resource=null,playTime=null;
    const collapsed=new Set();
    if(config.mode==='animation')bottom='Animation';
    const documentActions=new Set(['add','set','rename','remove','script','code','instance','action','bind','unbind','connect','timeline','key','removeKey','paint','transform','reparent','duplicate']);
    const root=document.createElement('section'); root.className='practice-lab';root.setAttribute('aria-label',config.title);host.appendChild(root);
    function remember(){undo.push(clone(state));if(undo.length>40)undo.shift();redo=[];}
    function refresh() {
      root.querySelectorAll('.lab-viewport').forEach(el=>{el.innerHTML=sceneSvg();el.dataset.play=String(!!state.evidence);});
      const debug=root.querySelector('.lab-debug-content');if(debug)debug.innerHTML=debuggerHTML();
      const output=root.querySelector('.lab-output output');if(output)output.textContent=state.output||'Изменено. Запусти предпросмотр ещё раз.';
      const feedback=root.querySelector('.lab-feedback');if(feedback){feedback.textContent='';feedback.className='lab-feedback';}
      const assessment=evaluate(config,state);
      root.querySelectorAll('.lab-goals>div').forEach((el,i)=>{el.className='';el.textContent='· '+assessment.results[i].label;});
      const selected=nodeBy(state,state.selected);
      for(const key of ['x','y']){const input=root.querySelector(`[data-prop="${key}"]`);if(input&&input!==document.activeElement&&selected)input.value=selected.props[key];}
      root.querySelectorAll('[data-action="undo"]').forEach(button=>button.toggleAttribute('disabled',!undo.length));
      root.querySelectorAll('[data-action="redo"]').forEach(button=>button.toggleAttribute('disabled',!redo.length));
      if(config.mode==='animation'){root.querySelector('[data-scrub]')?.setAttribute('max',state.timeline.duration);root.querySelector('input[name=time]')?.setAttribute('max',state.timeline.duration);}
    }
    const dispatch=(action,repaint=true)=>{
      if(documentActions.has(action.type)&&!gesture){
        const signature=['set','rename','code','timeline'].includes(action.type)?action.type+':'+state.selected+':'+(action.key||''):null;
        if(!signature||group!==signature)remember();group=signature;
      }else if(!documentActions.has(action.type))group=null;
      state=reduce(config,state,action);
      if(!state.evidence)gameScreen=false;
      if(!['select','panel','tab','brush'].includes(action.type)){checked=false;message='';}
      if(action.type!=='frame')storage.write?.(id,state);
      if(repaint)paint();else refresh();
    };
    function direction(){
      const active=name=>state.actions.find(a=>a.name===name)?.keys.some(k=>held.has(k));
      if(config.mode==='input')return Number(!!active('move_right'))-Number(!!active('move_left'));
      return Number(held.has('D')||held.has('ArrowRight'))-Number(held.has('A')||held.has('ArrowLeft'));
    }
    function tick(time){
      frameId=0;if(!root.isConnected||document.hidden){held.clear();return;}
      const dt=lastTime?Math.min(.04,(time-lastTime)/1000):1/60;lastTime=time;
      if(animation){
        const t=state.timeline;animation.time+=dt;
        if(animation.time>t.duration){if(t.loop)animation.time%=t.duration;else{animation.time=t.duration;animation=null;}}
        const cursor=root.querySelector('[data-scrub]');if(cursor){cursor.value=animation?.time??t.duration;scrub(Number(cursor.value));}
      }
      if(state.evidence&&(direction()||!state.evidence.grounded&&!state.evidence.settled))dispatch({type:'frame',dt,direction:direction()},false);
      if(animation||(state.evidence&&(held.size||!state.evidence.grounded&&!state.evidence.settled)&&state.nodes.some(n=>n.type==='CharacterBody2D'))||(state.evidence&&config.mode==='tiles'&&(held.size||!state.evidence.grounded&&!state.evidence.settled)))frameId=requestAnimationFrame(tick);
      else{lastTime=0;storage.write?.(id,state);}
    }
    function startTick(){if(!frameId){lastTime=0;frameId=requestAnimationFrame(tick);}}
    function scrub(time){
      playTime=time;
      const t=state.timeline,sorted=t.keys.slice().sort((a,b)=>a.time-b.time);
      const before=sorted.filter(k=>k.time<=time).at(-1)||sorted[0],after=sorted.find(k=>k.time>=time)||sorted.at(-1);
      const image=root.querySelector('.lab-animation-sample img');
      if(before&&after&&image){const value=before.time===after.time?before.value:before.value+(after.value-before.value)*(time-before.time)/(after.time-before.time);image.style.opacity=t.property==='alpha'?Math.max(0,Math.min(1,value)):1;image.style.transform=t.property==='x'?`translateX(${Math.max(-60,Math.min(60,value))}px)`:'none';}
      const readout=root.querySelector('.lab-time');if(readout)readout.textContent=time.toFixed(2)+' с';
      root.querySelectorAll('.lab-viewport').forEach(el=>{el.innerHTML=sceneSvg();});
    }
    function tree() {
      const depth=n=>{let d=0;while(n.parent&&d<40){d++;n=nodeBy(state,n.parent);if(!n)break;}return d;};
      const visible=n=>{while(n.parent){if(collapsed.has(n.parent))return false;n=nodeBy(state,n.parent);if(!n)return false;}return true;};
      return state.nodes.length?state.nodes.filter(visible).map(n=>{
        const children=state.nodes.some(x=>x.parent===n.id);
        return `<div class="lab-tree-row" style="--depth:${depth(n)}">${children?button('fold',collapsed.has(n.id)?'▸':'▾',`data-id="${n.id}" aria-label="${collapsed.has(n.id)?'Развернуть':'Свернуть'} ${esc(n.name)}" aria-expanded="${!collapsed.has(n.id)}"`):'<span class="lab-tree-spacer"></span>'}<button type="button" class="lab-button" data-action="select" data-id="${n.id}" aria-pressed="${n.id===state.selected}">${nodeIcon(n.type)}<span class="lab-tree-name">${esc(n.name)}</span>${n.script?'<span class="lab-script-badge" aria-hidden="true">≡</span>':''}</button></div>`;
      }).join(''):'<p class="lab-empty">Пустая сцена<br>Создай корневой узел кнопкой +.</p>';
    }
    function field(n,key,value) {
      const attrs=`data-prop="${key}" aria-label="${esc(propNames[key]||key)}"`;
      const input=typeof value==='boolean'?`<input type="checkbox" ${attrs}${value?' checked':''}>`:choices[key]?`<select ${attrs}>${choices[key].map(v=>option(v,v||'Не задано',v===value)).join('')}</select>`:`<input ${attrs} type="${typeof value==='number'?'number':'text'}" value="${esc(value)}" ${typeof value==='number'?'step="any" min="-10000" max="10000" required':''}>`;
      return `<label class="lab-field"><span>${esc(propNames[key]||key)}</span>${input}</label>`;
    }
    function inspector() {
      const n=nodeBy(state,state.selected);
      if(rightTab==='Signals')return n?.type==='Button'?`<div class="lab-class-heading">${nodeIcon(n.type)} ${esc(n.name)}</div><div class="lab-property-group"><h4>Button</h4><div class="lab-signal-row">⚡ pressed() ${state.connections.some(c=>c.from===n.id)?'<span class="lab-connected">●</span>':''}</div>${button('signal','Signals · pressed → Connect')}</div>`:'<p class="lab-empty">Выбери Button в Scene, чтобы подключить pressed().</p>';
      if(resource)return `<div class="lab-class-heading">${nodeIcon('Sprite2D')} icon.svg</div><div class="lab-resource-preview"><img src="assets/godot.svg" alt="Ресурс icon.svg"></div><p class="lab-resource-path">res://icon.svg</p>${button('assignTexture','Назначить выбранному Sprite2D',n?.type==='Sprite2D'?'':'disabled')}<p class="lab-empty">Выбери Sprite2D в Scene, затем назначь Texture.</p>`;
      if(!n)return '<p class="lab-empty">Выбери узел в Scene или в окне сцены.<br>Здесь появятся его свойства.</p>';
      const excluded=descendants(state,n.id);
      const parent=n.parent===null?'<div class="lab-readonly">Root node</div>':`<label class="lab-field"><span>Parent</span><select data-parent aria-label="Родитель узла">${state.nodes.filter(x=>!excluded.has(x.id)).map(x=>option(x.id,x.name,n.parent===x.id)).join('')}</select></label>`;
      const transform=['x','y','z','scale','zoom'].filter(key=>own(n.props,key));
      const other=Object.keys(n.props).filter(key=>!transform.includes(key));
      const group=(title,fields)=>fields.length?`<details class="lab-property-group" open><summary>${esc(title)}</summary>${fields.map(key=>field(n,key,n.props[key])).join('')}</details>`:'';
      return `<div class="lab-class-heading">${nodeIcon(n.type)}<b>${esc(n.type)}</b><span>⋮</span></div><label class="lab-field"><span>Node name</span><input data-name value="${esc(n.name)}" maxlength="40" aria-label="Node name"></label>${parent}${group(n.type,other)}${group('Transform',transform)}<details class="lab-property-group" open><summary>Node</summary><div class="lab-script-resource"><span>Script</span><span>${esc(n.script||'<empty>')}</span></div>${button('script','Attach Script')}</details>`;
    }
    function debuggerHTML(){
      const warnings=[];
      state.nodes.forEach(n=>{
        if(n.type==='Sprite2D'&&!n.props.texture)warnings.push(n.name+': Texture не назначена.');
        if(['CharacterBody2D','StaticBody2D','Area2D'].includes(n.type)&&!hasShape(state,n))warnings.push(n.name+': нет активной CollisionShape2D.');
      });
      return `<p class="lab-debug-note">Проверка учебной сцены</p>${warnings.length?warnings.map(w=>`<p class="lab-warning">△ ${esc(w)}</p>`).join(''):'<p class="lab-connected">● Предупреждений по структуре нет.</p>'}`;
    }
    function sceneSvg() {
      if(state.tab==='3D')return `<svg viewBox="0 0 320 240" role="img" aria-label="Упрощённый предпросмотр 3D-сцены"><path d="m20 170 140-70 140 70-140 60Z" fill="#8cafad"/>${state.nodes.some(n=>n.type==='MeshInstance3D'&&n.props.mesh==='BoxMesh')?'<path d="m125 100 35-18 35 18-35 18Z" fill="#d4bfed"/><path d="m125 100 35 18v48l-35-18Z" fill="#a58bc9"/><path d="m160 118 35-18v48l-35 18Z" fill="#7b69a0"/>':''}<text x="12" y="28" fill="currentColor" font-size="14">3D · учебная модель</text></svg>`;
      const e=state.evidence;
      let scene='';
      if(config.mode==='input')scene+='<rect y="210" width="320" height="16" fill="#85b89f"/>';
      if(config.mode==='tiles')state.tiles.forEach((v,i)=>{
        const x=i%8*40,y=Math.floor(i/8)*40;
        if(v==='ground')scene+=`<rect x="${x}" y="${y}" width="40" height="40" fill="#82af99" stroke="#385e4b"/>`;
        if(v==='coin'&&!e?.collected.includes('tile'+i))scene+=`<circle cx="${x+20}" cy="${y+20}" r="10" fill="#f1ca71"/>`;
      });
      for(const n of state.nodes){
        if(!['Sprite2D','CharacterBody2D','StaticBody2D','Area2D','Label','Button','ProgressBar'].includes(n.type))continue;
        const parent=nodeBy(state,n.parent);
        if(parent?.type==='Area2D'&&e?.collected.includes(parent.id))continue;
        const pos=worldPosition(state,n);
        const sampled=playTime!=null&&state.timeline.target===n.id?sampleAnimation(state.timeline,playTime):null;
        if(sampled!=null&&state.timeline.property==='x')pos.x+=sampled-n.props.x;
        if(e&&parent?.type==='CharacterBody2D'){const origin=worldPosition(state,parent);pos.x+=e.x-origin.x;pos.y+=e.y-origin.y;}
        const px=n.type==='CharacterBody2D'&&e?e.x:pos.x,py=n.type==='CharacterBody2D'&&e?e.y:pos.y;
        if(n.type==='Area2D'&&e?.collected.includes(n.id))continue;
        let drawing='',width=40,height=40,ox=-20,oy=-24;
        if(n.type==='Label'){width=Math.max(25,Math.min(260,n.props.text.length*n.props.font_size*.55));height=n.props.font_size+6;ox=0;oy=0;drawing=`<text x="0" y="${n.props.font_size}" font-size="${Math.max(8,Math.min(40,n.props.font_size))}" fill="currentColor">${esc(e?.pressed?'Работает!':n.props.text||'Label')}</text>`;}
        else if(n.type==='StaticBody2D'){width=240;height=16;ox=-120;oy=0;drawing='<rect x="-120" width="240" height="16" rx="3" fill="#85b89f"/>';}
        else if(n.type==='Area2D')drawing='<circle r="10" fill="#f1ca71"/>';
        else if(n.type==='Button'){width=105;height=30;ox=0;oy=0;drawing=`<rect width="105" height="30" rx="5" fill="#82b5d8"/><text x="8" y="20" font-size="14" fill="#182431">${esc(n.props.text)}</text>`;}
        else if(n.type==='ProgressBar'){width=120;height=18;ox=0;oy=0;drawing=`<rect width="120" height="18" fill="#425467"/><rect width="${120*Math.max(0,Math.min(1,n.props.value/Math.max(1,n.props.max_value)))}" height="18" fill="#85b89f"/>`;}
        else if(n.type==='CharacterBody2D'&&state.nodes.some(child=>child.parent===n.id&&child.type==='Sprite2D'))drawing='<rect x="-16" y="-16" width="32" height="32" fill="transparent" stroke="#82b5d8" stroke-dasharray="3 2"/>';
        else if(n.type==='Sprite2D'&&!n.props.texture)drawing='<rect x="-16" y="-16" width="32" height="32" fill="none" stroke="#97a4b2" stroke-dasharray="3 2"/><text x="-14" y="4" font-size="8" fill="currentColor">Texture?</text>';
        else {const scale=n.type==='Sprite2D'?Math.max(.2,Math.min(4,n.props.scale)):1;width=40*scale;height=40*scale;ox=-width/2;oy=-height/2;drawing=`<image href="assets/${n.type==='CharacterBody2D'?'fox-godot-960.webp':'godot.svg'}" x="${ox}" y="${oy}" width="${width}" height="${height}" opacity="${Math.max(0,Math.min(1,sampled!=null&&state.timeline.property==='alpha'?sampled:n.props.alpha??1))}"/>`;}
        const selected=n.id===state.selected&&!e;
        scene+=`<g data-scene-node="${n.id}" data-node-type="${n.type}" role="button" tabindex="-1" aria-label="${esc(n.name)} на сцене" transform="translate(${px} ${py})"><rect x="${ox-3}" y="${oy-3}" width="${width+6}" height="${height+6}" fill="transparent" stroke="${selected?'#bfa1ef':'transparent'}" stroke-width="1" stroke-dasharray="4 2"/>${drawing}</g>`;
        if(!e&&state.showShapes&&hasShape(state,n))scene+=n.type==='StaticBody2D'?`<rect x="${px-120}" y="${py}" width="240" height="16" fill="#7cdbb330" stroke="#7cdbb3" pointer-events="none"/>`:`<rect x="${px-17}" y="${py-16}" width="34" height="32" fill="#7cdbb330" stroke="#7cdbb3" pointer-events="none"/>`;
      }
      if(config.mode==='tiles'&&e)scene+=`<image href="assets/fox-godot-960.webp" x="${e.x-20}" y="${e.y-20}" width="40" height="40"/>`;
      const camera=state.nodes.some(n=>n.type==='Camera2D'&&n.props.enabled)?'<rect x="8" y="8" width="304" height="218" fill="none" stroke="#bba3df" stroke-dasharray="5 4" pointer-events="none"/>':'';
      const selected=nodeBy(state,state.selected);
      let gizmo='';
      if(!e&&selected&&own(selected.props,'x')&&own(selected.props,'y')){const p=worldPosition(state,selected);gizmo=`<g class="lab-gizmo" data-scene-node="${selected.id}" role="button" tabindex="-1" aria-label="Переместить ${esc(selected.name)}" transform="translate(${p.x} ${p.y})"><rect x="-10" y="-10" width="20" height="20" rx="3" fill="#19212a99" stroke="#e4d4fa"/><path d="M-6 0H24m-5-4 5 4-5 4M0-6V24m-4-5 4 5 4-5" fill="none" stroke="#d0acf0" stroke-width="2" pointer-events="none"/></g>`;}
      return `<svg viewBox="0 0 320 240" aria-label="Сцена 2D"><defs><pattern id="grid-${id}" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="currentColor" opacity=".1"/></pattern></defs><rect width="320" height="240" fill="url(#grid-${id})"/>${camera}${scene}${gizmo}</svg>`;
    }
    function preview(){return `<div class="lab-viewport" tabindex="0" role="group" aria-label="Окно сцены: выбор, перемещение и игра" data-play="${!!state.evidence}">${sceneSvg()}</div><p class="lab-viewport-help">${state.evidence?'Нажми на окно игры. A/D или стрелки — движение, Space/W — прыжок.':'Нажми на объект и перетащи. Стрелки — сдвиг на 1, Shift — на 10. Inspector показывает локальные координаты.'}</p>`;}
    function inputMap() {
      return `<div class="lab-settings"><h4>Project Settings · Input Map</h4><form data-form="action"><label>Add New Action<input name="action" aria-label="Add New Action" required pattern="[a-z][a-z0-9_]*" maxlength="40"></label><button class="lab-button">Add</button></form>${state.actions.map(a=>`<div class="lab-action-row"><strong>${esc(a.name)}</strong><div>${a.keys.map(k=>button('unbind',k+' ×',`data-name="${esc(a.name)}" data-key="${k}" aria-label="Убрать ${k} у ${esc(a.name)}"`)).join('')}</div>${button('bind','+ Клавиша',`data-name="${esc(a.name)}"`)}</div>`).join('')}</div>`;
    }
    function timeline() {
      const t=state.timeline;
      return `<div class="lab-timeline"><h4>AnimationPlayer · blink</h4><label>Узел<select data-timeline="target" aria-label="Узел анимации">${option('','Выбери Sprite2D',!t.target)}${state.nodes.filter(n=>n.type==='Sprite2D').map(n=>option(n.id,n.name,t.target===n.id)).join('')}</select></label><label>Свойство<select data-timeline="property" aria-label="Свойство анимации">${option('alpha','modulate:a',t.property==='alpha')}${option('x','position:x',t.property==='x')}</select></label><label>Длина, с<input type="number" min="0.1" max="10" step="0.1" data-timeline="duration" value="${t.duration}" aria-label="Длина анимации"></label><label><input type="checkbox" data-timeline="loop"${t.loop?' checked':''}> Loop</label><form data-form="key"><label>Время<input name="time" aria-label="Время ключа" type="number" min="0" max="${t.duration}" step="0.1" required value="0"></label><label>Значение<input name="value" aria-label="Значение ключа" type="number" min="0" max="1" step="0.1" required value="1"></label><button class="lab-button">Добавить ключ</button></form><div class="lab-key-list">${t.keys.map((k,i)=>button('removeKey',k.time+' c → '+k.value+' ×',`data-index="${i}"`)).join('')}</div><label>Курсор времени<input type="range" min="0" max="${t.duration}" step="0.05" value="0" data-scrub aria-label="Курсор времени анимации"></label>${button(animation?'animationStop':'animationPlay',animation?'■ Стоп':'▶ Проиграть анимацию')}<output class="lab-time">0.00 с</output><div class="lab-animation-sample"><img src="assets/godot.svg" alt="Предпросмотр анимации"></div></div>`;
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
      if(dialog.type==='settings')body=inputMap();
      if(dialog.type==='signal')body=`<form data-form="signal"><p>pressed → _on_button_pressed()</p><label>Узел-получатель со скриптом<select name="target" aria-label="Получатель сигнала">${state.nodes.filter(n=>n.script).map(n=>option(n.id,n.name,false)).join('')}</select></label><p class="small">Подготовленный обработчик меняет текст Label на «Работает!». В Godot его тело пишут в скрипте.</p><button class="lab-button">Connect</button></form>`;
      return `<div class="lab-modal-layer"><div class="lab-modal-shade" data-dismiss-dialog></div><div class="lab-dialog" role="dialog" aria-modal="true" aria-label="${esc({add:'Create New Node',bind:'Настройка клавиши',script:'Attach Node Script',signal:'Connect a Signal',settings:'Project Settings'}[dialog.type])}"><div class="lab-dialog-head"><strong>${esc({add:'Create New Node',bind:'Input Event',script:'Attach Node Script',signal:'Connect a Signal',settings:'Project Settings'}[dialog.type])}</strong>${button('cancel','Закрыть')}</div>${body}</div></div>`;
    }
    function paint() {
      const assessment=evaluate(config,state),n=nodeBy(state,state.selected);
      const brief=config.mode==='input'?'Открой Project → Project Settings… → Input Map. '+config.brief:config.brief;
      const filename=config.lesson.replace('-','_')+'.tscn';
      const menu=(name,content)=>`<details class="lab-menu"><summary>${name}</summary><div class="lab-menu-popup">${content}</div></details>`;
      const top=`<div class="lab-editor-top"><div class="lab-menus">${menu('Scene',button('add','Add Child Node…')+button('duplicate','Duplicate',!n||n.parent===null?'disabled':'')+button('remove','Delete Node',!n?'disabled':''))}${menu('Project',button('projectSettings','Project Settings…'))}${menu('Debug',button('shapes','Visible Collision Shapes',`aria-pressed="${!!state.showShapes}"`))}${menu('Editor',button('undo','Undo',undo.length?'':'disabled')+button('redo','Redo',redo.length?'':'disabled'))}${menu('Help','<a href="https://docs.godotengine.org/en/stable/getting_started/introduction/first_look_at_the_editor.html" target="_blank" rel="noopener noreferrer">Editor Documentation ↗</a>')}</div><div class="lab-main-screens">${['2D','3D','Script'].map(t=>button('tab',t,`data-value="${t}" aria-pressed="${!gameScreen&&state.tab===t}"`)).join('')}${button('game','Game',`aria-pressed="${gameScreen}" ${state.evidence?'':'disabled'}`)}</div><div class="lab-play-toolbar">${button(state.evidence?'stop':'run',state.evidence?'■ Остановить':'▶ F6 · Запустить')}</div></div>`;
      const scene=`<aside class="lab-scene" aria-label="Scene dock"><div class="lab-dock-tabs">${button('panel','Scene','data-value="Scene" aria-pressed="true"')}</div><div class="lab-scene-tools">${button('add','+ Узел')}${button('duplicate','Дублировать',!n||n.parent===null?'disabled':'')}${button('remove','Удалить',!n?'disabled':'')}</div><label class="lab-dock-search"><input data-tree-filter placeholder="Filter nodes" aria-label="Фильтр узлов"></label><div class="lab-tree">${tree()}</div>${config.mode==='instance'||config.mode==='final'?button('instance','Instantiate · coin.tscn',!n?'disabled':''):''}</aside>`;
      const files=`<aside class="lab-files" aria-label="FileSystem dock"><div class="lab-dock-tabs">${button('panel','FileSystem','data-value="FileSystem"')}</div><div class="lab-file-root">▾ res://</div><div class="lab-file-items">${button('resource','icon.svg','data-resource="icon.svg"')}${state.nodes.some(x=>x.script)?button('openScript','main.gd'):''}<span class="lab-current-file">${nodeIcon('Node2D')} ${esc(filename)}</span>${config.mode==='instance'||config.mode==='final'?button('instance','coin.tscn',!n?'disabled':''):''}</div></aside>`;
      const code=`<label class="lab-script-editor"><span>GDScript · ${esc(n?.script||'Attach Script')}</span><textarea class="lab-code" data-code aria-label="Скрипт сцены" spellcheck="false" ${config.mode==='signal'?'readonly':''}>${esc(config.mode==='signal'?config.code:state.code)}</textarea></label>`;
      const canvas=gameScreen?preview():state.tab==='Script'?code:config.mode==='tiles'?tileMap():`<div class="lab-ruler-x" aria-hidden="true"><span>0</span><span>80</span><span>160</span><span>240</span><span>320</span></div>${preview()}`;
      const work=`<div class="lab-workspace"><div class="lab-scene-tab">${nodeIcon('Node2D')} ${esc(filename)}<span class="lab-tab-close" aria-hidden="true">×</span></div><div class="lab-viewport-toolbar"><span class="lab-active-tool" title="Перемещение выбранного узла">✥ Move</span>${button('undo','↶ Отменить',undo.length?'':'disabled')}${button('redo','↷ Повторить',redo.length?'':'disabled')}${button('shapes','Формы',`aria-pressed="${!!state.showShapes}"`)}<span class="lab-viewport-mode">${gameScreen?'Game':state.tab}</span></div><div class="lab-workspace-content">${canvas}</div></div>`;
      const inspectorDock=`<aside class="lab-inspector" aria-label="Inspector dock"><div class="lab-dock-tabs">${button('rightTab','Inspector',`data-value="Inspector" aria-pressed="${rightTab==='Inspector'}"`)}${button('rightTab','Signals',`data-value="Signals" aria-pressed="${rightTab==='Signals'}"`)}</div><div class="lab-inspector-body">${inspector()}</div></aside>`;
      const controls=state.evidence?`<div class="lab-test-controls">${state.nodes.some(x=>x.type==='CharacterBody2D')||config.mode==='tiles'?button('move','← Влево','data-direction="-1"')+button('move','Вправо →','data-direction="1"')+button('jump','Прыжок'):''}${config.mode==='signal'?button('press','Нажать кнопку в игре'):''}${config.mode==='timer'?button('timer','Пропустить 3 учебные секунды'):''}</div>`:'';
      const animationPanel=state.nodes.some(x=>x.type==='AnimationPlayer')?timeline():`<p class="lab-debug-note">Выбери AnimationPlayer в Scene или добавь его, чтобы редактировать ключи.</p>${button('add','Добавить узел…')}`;
      const bottomPanel=`<div class="lab-output"><div class="lab-bottom-tabs">${['Output','Debugger','Animation'].map(t=>button('bottomTab',t,`data-value="${t}" aria-pressed="${bottom===t}"`)).join('')}</div><div class="lab-output-content" ${bottom==='Output'?'':'hidden'}><output>${esc(state.output||'Учебная сцена готова. Запусти F6 для проверки поведения.')}</output>${controls}</div><div class="lab-debug-content" ${bottom==='Debugger'?'':'hidden'}>${debuggerHTML()}</div><div class="lab-bottom-animation" ${bottom==='Animation'?'':'hidden'}>${animationPanel}</div></div>`;
      root.innerHTML=`<div class="lab-heading"><img src="assets/fox-godot-960.webp" width="64" height="54" alt=""><div><span class="lab-eyebrow">Практика в браузере</span><h3>${esc(config.title)}</h3></div></div><p>${esc(brief)}</p><p class="lab-model-note">Учебная модель интерфейса Godot 4. Поддерживаются действия этого курса; полноценный редактор и движок Godot не запускаются.</p><div class="lab-goals" aria-label="Цели задания">${assessment.results.map(r=>`<div class="${checked?(r.ok?'lab-goal-ok':'lab-goal-missing'):''}">${checked?(r.ok?'✓':'○'):'·'} ${esc(r.label)}</div>`).join('')}</div><div class="lab-editor">${top}${scene}${files}${work}${inspectorDock}${bottomPanel}<div class="lab-editor-status"><span>Godot UwU · учебный редактор</span><span>${gameScreen?'Running':'Editing'} · ${state.nodes.length} nodes</span></div>${dialogHTML()}</div><div class="lab-controls">${button('check','Проверить сцену')}${button('hint','Подсказка')}${button('reset','Сбросить это задание')}</div><div class="lab-feedback${checked&&assessment.ok?' lab-success':''}" role="status">${esc(message)}</div><p class="lab-transfer">${esc(config.transfer)}</p>`;
      if(playTime!=null&&bottom==='Animation')scrub(playTime);
    }
    root.addEventListener('click',event=>{
      if(event.target.hasAttribute('data-dismiss-dialog')){dialog=null;paint();return;}
      if(suppressClick){suppressClick=false;if(!event.target.closest('button[data-action]:not([data-action="paint"])'))return;}
      const item=event.target.closest('[data-scene-node]');if(item){const n=nodeBy(state,item.dataset.sceneNode);if(state.evidence&&n?.type==='Button'){dispatch({type:'press'},false);return;}if(!state.evidence){dispatch({type:'select',id:n.id});root.querySelector('.lab-viewport')?.focus({preventScroll:true});}return;}
      const b=event.target.closest('button[data-action]');if(!b||!root.contains(b))return;
      const a=b.dataset.action;
      if(a==='fold'){collapsed.has(b.dataset.id)?collapsed.delete(b.dataset.id):collapsed.add(b.dataset.id);paint();return;}
      if(a==='rightTab'){rightTab=b.dataset.value;if(rightTab==='Inspector')dispatch({type:'panel',value:'Inspector'});else paint();return;}
      if(a==='bottomTab'){bottom=b.dataset.value;paint();return;}
      if(a==='projectSettings'){dialog={type:'settings'};paint();root.querySelector('.lab-dialog input')?.focus();return;}
      if(a==='game'){gameScreen=true;paint();root.querySelector('.lab-viewport')?.focus({preventScroll:true});return;}
      if(a==='resource'){resource='icon.svg';rightTab='Inspector';dispatch({type:'panel',value:'FileSystem'});return;}
      if(a==='assignTexture'){resource=null;dispatch({type:'set',key:'texture',value:'icon.svg'});return;}
      if(a==='openScript'){gameScreen=false;dispatch({type:'tab',value:'Script'});return;}
      if(a==='tab')gameScreen=false;
      if(a==='select'){resource=null;rightTab='Inspector';}

      if(a==='undo'||a==='redo'){const from=a==='undo'?undo:redo,to=a==='undo'?redo:undo;if(from.length){to.push(clone(state));state=from.pop();state.evidence=null;state.output='';gameScreen=false;checked=false;message='';group=null;held.clear();animation=null;storage.write?.(id,state);paint();}return;}
      if(a==='shapes'){state.showShapes=!state.showShapes;storage.write?.(id,state);paint();return;}
      if(a==='animationPlay'){animation={time:0};paint();startTick();return;}
      if(a==='animationStop'){animation=null;paint();return;}
      if(a==='run'||a==='stop'){held.clear();animation=null;gameScreen=a==='run';bottom='Output';dispatch({type:a});if(a==='run')root.querySelector('.lab-viewport')?.focus({preventScroll:true});return;}
      if(a==='jump'){dispatch({type:'jump'},false);startTick();return;}
      if(a==='move'){dispatch({type:'move',direction:Number(b.dataset.direction)},false);startTick();return;}
      if(a==='paint'){const index=Number(b.dataset.index);dispatch({type:'paint',index},false);updateTile(index);return;}

      if(['add','script','signal','bind'].includes(a)){dialog={type:a,name:b.dataset.name};paint();root.querySelector('.lab-dialog input,.lab-dialog select')?.focus();return;}
      if(a==='cancel'){dialog=dialog?.type==='bind'?{type:'settings'}:null;paint();return;}
      if(a==='check'){const invalid=root.querySelector('input:invalid,select:invalid');if(invalid){invalid.reportValidity();return;}const result=evaluate(config,state);checked=true;if(result.ok){state.passed=true;storage.write?.(id,state);storage.attempt?.();message='Получилось. Сцена отвечает всем условиям. '+config.success;}else{message='Пока не хватает: '+result.results.filter(r=>!r.ok).map(r=>r.hint).join(' ');storage.attempt?.();}paint();return;}
      if(a==='hint'){message=config.hints[Math.min(hintIndex++,config.hints.length-1)];paint();return;}
      if(a==='reset'){remember();held.clear();animation=null;playTime=null;gameScreen=false;resource=null;rightTab='Inspector';collapsed.clear();state=initial(config);dialog=null;checked=false;hintIndex=0;message='Задание возвращено к началу. Остальной прогресс курса сохранён.';storage.write?.(id,state);paint();return;}
      dispatch({type:a,id:b.dataset.id,value:b.dataset.value,name:b.dataset.name,key:b.dataset.key,index:Number(b.dataset.index),direction:Number(b.dataset.direction)});
    });
    root.addEventListener('submit',event=>{
      const form=event.target;if(!form.dataset.form)return;event.preventDefault();const values=new FormData(form);const mode=form.dataset.form;
      const action=mode==='node'?{type:'add',nodeType:values.get('type')}:mode==='action'?{type:'action',name:values.get('action')}:mode==='bind'?{type:'bind',name:dialog.name,key:values.get('key')}:mode==='script'?{type:'script',value:values.get('path')}:mode==='signal'?{type:'connect',target:values.get('target')}:{type:'key',time:values.get('time'),value:values.get('value')};
      if(mode==='bind'||mode==='action')dialog={type:'settings'};else if(mode!=='key')dialog=null;dispatch(action);if(dialog)root.querySelector('.lab-dialog input,.lab-dialog select')?.focus();else if(mode==='key')root.querySelector('input[name=time]')?.focus({preventScroll:true});
    });
    root.addEventListener('change',event=>{
      const e=event.target;
      if(e.hasAttribute('data-parent')){dispatch({type:'reparent',parent:e.value});return;}
      if(e.hasAttribute('data-prop'))dispatch({type:'set',key:e.dataset.prop,value:e.type==='checkbox'?e.checked:e.type==='number'?e.value===''?NaN:Number(e.value):e.value},false);
      else if(e.hasAttribute('data-name'))dispatch({type:'rename',value:e.value},false);
      else if(e.hasAttribute('data-code'))dispatch({type:'code',value:e.value},false);
      else if(e.hasAttribute('data-timeline'))dispatch({type:'timeline',key:e.dataset.timeline,value:e.type==='checkbox'?e.checked:e.type==='number'?Number(e.value):e.value},false);
    });
    root.addEventListener('input',event=>{
      const e=event.target;
      if(e.hasAttribute('data-tree-filter')){const q=e.value.toLocaleLowerCase();root.querySelectorAll('.lab-tree-row').forEach(row=>{row.hidden=!row.textContent.toLocaleLowerCase().includes(q);});return;}
      if(e.hasAttribute('data-search')) {
        const select=root.querySelector('select[name="type"]');const available=Object.keys(types).filter(t=>t.toLowerCase().includes(e.value.toLowerCase()));select.innerHTML=available.map((t,i)=>option(t,t,i===0)).join('');
      }
      if(e.hasAttribute('data-name')){dispatch({type:'rename',value:e.value},false);const treeButton=root.querySelector(`button[data-action="select"][data-id="${state.selected}"]`);if(treeButton){const name=treeButton.querySelector('.lab-tree-name');if(name)name.textContent=nodeBy(state,state.selected).name;}}
      else if(e.hasAttribute('data-code'))dispatch({type:'code',value:e.value},false);
      else if(e.hasAttribute('data-prop')&&e.type!=='checkbox'&&e.tagName==='INPUT'&&(e.type!=='number'||e.value!==''&&e.validity.valid))dispatch({type:'set',key:e.dataset.prop,value:e.type==='number'?Number(e.value):e.value},false);
      else if(e.hasAttribute('data-timeline')&&e.type==='number'&&e.value!==''&&e.validity.valid)dispatch({type:'timeline',key:e.dataset.timeline,value:Number(e.value)},false);
      if(e.hasAttribute('data-scrub')){animation=null;scrub(Number(e.value));}
    });
    const normalize=key=>key===' '?'Space':key.length===1?key.toUpperCase():key;
    root.addEventListener('keydown',event=>{
      if(dialog){
        if(event.key==='Escape'){event.preventDefault();dialog=null;paint();return;}
        if(event.key==='Tab'){const focusable=[...root.querySelectorAll('.lab-dialog button:not(:disabled),.lab-dialog input,.lab-dialog select,.lab-dialog textarea')].filter(el=>!el.hidden);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}return;
      }
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))return;
      const viewport=event.target.closest('.lab-viewport');if(!viewport)return;
      const key=normalize(event.key);
      if((event.ctrlKey||event.metaKey)&&key==='Z'){event.preventDefault();root.querySelector(`[data-action="${event.shiftKey?'redo':'undo'}"]`)?.click();return;}
      if(event.key==='Escape'){event.preventDefault();held.clear();gameScreen=false;dispatch({type:'stop'});return;}
      if(state.evidence){
        const relevant=config.mode==='input'?state.actions.some(a=>a.keys.includes(key)):['A','D','W','Space','ArrowLeft','ArrowRight','ArrowUp'].includes(key);
        if(!relevant)return;event.preventDefault();held.add(key);
        const jumping=config.mode==='input'?state.actions.some(a=>a.name==='jump'&&a.keys.includes(key)):['W','Space','ArrowUp'].includes(key);
        if(jumping&&!event.repeat)dispatch({type:'jump'},false);if(direction())dispatch({type:'frame',dt:1/60,direction:direction()},false);startTick();return;
      }
      const n=nodeBy(state,state.selected);if(!n||!own(n.props,'x')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key))return;
      event.preventDefault();const amount=event.shiftKey?10:1;dispatch({type:'transform',x:n.props.x+(key==='ArrowLeft'?-amount:key==='ArrowRight'?amount:0),y:n.props.y+(key==='ArrowUp'?-amount:key==='ArrowDown'?amount:0)},false);
    });
    root.addEventListener('keyup',event=>held.delete(normalize(event.key)));
    root.addEventListener('focusout',event=>{group=null;if(!event.relatedTarget?.closest('.lab-viewport'))held.clear();});
    function point(event,svg){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const matrix=svg.getScreenCTM();return matrix?p.matrixTransform(matrix.inverse()):{x:0,y:0};}
    function tileAt(event){const el=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-action="paint"]');return el&&root.contains(el)?Number(el.dataset.index):null;}
    function updateTile(index){const tile=root.querySelector(`[data-action="paint"][data-index="${index}"]`);if(!tile)return;const value=state.tiles[index];tile.dataset.tile=value;tile.textContent=value==='ground'?'■':value==='coin'?'●':'·';tile.setAttribute('aria-label',`Строка ${Math.floor(index/8)+1}, столбец ${index%8+1}: ${value==='ground'?'земля':value==='coin'?'монета':'пусто'}`);}
    root.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      const tile=event.target.closest('[data-action="paint"]');
      if(tile){event.preventDefault();remember();gesture={type:'tile',pointer:event.pointerId};root.setPointerCapture(event.pointerId);dispatch({type:'paint',index:Number(tile.dataset.index)},false);updateTile(Number(tile.dataset.index));return;}
      const item=event.target.closest('[data-scene-node]');
      if(state.evidence&&event.target.closest('.lab-viewport')){root.querySelector('.lab-viewport')?.focus({preventScroll:true});return;}
      if(!item||state.evidence||state.tab==='3D')return;
      const n=nodeBy(state,item.dataset.sceneNode);if(!n||!own(n.props,'x'))return;
      event.preventDefault();remember();state.selected=n.id;
      const svg=item.closest('svg');gesture={type:'node',pointer:event.pointerId,start:point(event,svg),x:n.props.x,y:n.props.y,svg};root.setPointerCapture(event.pointerId);root.querySelector('.lab-viewport')?.focus({preventScroll:true});
    });
    root.addEventListener('pointermove',event=>{
      if(!gesture||gesture.pointer!==event.pointerId)return;
      if(gesture.type==='node'){const svg=root.querySelector('.lab-viewport svg');const p=point(event,svg);dispatch({type:'transform',x:Math.round(gesture.x+p.x-gesture.start.x),y:Math.round(gesture.y+p.y-gesture.start.y)},false);}
      else{const index=tileAt(event);if(index!=null){dispatch({type:'paint',index},false);updateTile(index);}}
    });
    function endGesture(event){if(!gesture||gesture.pointer!==event.pointerId)return;root.releasePointerCapture(event.pointerId);const tileGesture=gesture.type==='tile';gesture=null;group=null;suppressClick=true;setTimeout(()=>{suppressClick=false;},0);storage.write?.(id,state);paint();if(!tileGesture)root.querySelector('.lab-viewport')?.focus({preventScroll:true});}
    root.addEventListener('pointerup',endGesture);
    root.addEventListener('pointercancel',endGesture);
    paint();
  }
  RK.renderPractice=render;
})();
