// End-to-end state transitions for the authored missions, using the real GDScript interpreter.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');
const ctx=vm.createContext({window:{},setTimeout,clearTimeout,console});
for(const file of ['js/text.js','js/gdscript.js','content/course-data.js','js/practice.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const {initial,restore,reduce,evaluate}=ctx.window.RK.Practice;
const catalog=ctx.window.GODOT_PRACTICE;
let checks=0;
function mission(id,fn){
  const c=catalog[id];let s=initial(c);
  assert.equal(evaluate(c,s).ok,false,id+' must require work');
  const act=a=>s=reduce(c,s,a);
  const select=id=>act({type:'select',id});
  const add=(type,parent)=>{act({type:'add',nodeType:type,parent});return s.selected;};
  const prop=(key,value)=>act({type:'set',key,value});
  const run=()=>act({type:'run'});
  fn({act,select,add,prop,run,get:()=>s,check:()=>evaluate(c,s)});
  assert.equal(evaluate(c,s).ok,true,id+' completion');
  const roundtrip=restore(c,JSON.parse(JSON.stringify(s)));
  assert.equal(roundtrip.evidence,null,'imported runtime results are discarded');
  assert.equal(roundtrip.nodes.length,s.nodes.length,'scene survives reload');
  checks++;
  return {c,s};
}
mission('editor-tour',({act})=>{for(const value of ['Scene','Inspector','FileSystem'])act({type:'panel',value});for(const value of ['Script','3D','2D'])act({type:'tab',value});});
const scene=mission('first-scene',({act,add,prop,run})=>{
  const parent=add('Node2D');act({type:'rename',value:'Моя сцена'});
  add('Sprite2D',parent);prop('texture','icon.svg');
  add('Label',parent);prop('text','Любой мой текст');act({type:'rename',value:'Неожиданное имя'});run();
});
mission('attach-script',({act,run})=>{act({type:'script',value:'different.gd'});act({type:'code',value:'extends Node\nfunc _ready():\n\tprint("Error is just a word")'});run();});
mission('inspector-speed',({select,prop,add})=>{select('Player');prop('speed',213);add('Sprite2D','Player');prop('texture','icon.svg');});
mission('position-sprite',({select,prop})=>{select('Sprite2D');prop('texture','icon.svg');prop('x',222.5);prop('y',160);});
mission('input-map',({act,run})=>{
  for(const [name,keys] of [['jump',['W','Space']],['move_right',['ArrowRight','D']],['move_left',['ArrowLeft','A']]]){
    act({type:'action',name});for(const key of keys)act({type:'bind',name,key});
  }
  run();act({type:'move',direction:1});
});
const physics=mission('solid-floor',({add,prop,run})=>{add('CollisionShape2D','Ground');prop('shape','RectangleShape2D');add('CollisionShape2D','Player');prop('shape','CircleShape2D');run();});
mission('button-signal',({select,act,run,check})=>{select('Button');act({type:'connect',target:'Main'});assert.equal(check().ok,false,'connection alone is not an observed event');run();act({type:'press'});});
mission('coin-instances',({act,select,prop,get})=>{for(let i=0;i<3;i++){select('Main');act({type:'instance'});}select(get().nodes.find(n=>n.template==='coin').id);prop('x',280);});
mission('blink-animation',({act})=>{act({type:'timeline',key:'target',value:'Sprite2D'});act({type:'timeline',key:'duration',value:2.5});act({type:'timeline',key:'loop',value:true});act({type:'key',time:2.5,value:0});act({type:'key',time:0,value:1});act({type:'key',time:1,value:.3});});
mission('follow-camera',({add,prop})=>{add('Camera2D','Player');prop('enabled',true);prop('zoom',1.5);});
mission('paint-level',({act})=>{for(let index=38;index>=33;index--)act({type:'paint',index});act({type:'brush',value:'coin'});act({type:'paint',index:29});});
mission('game-menu',({add,prop})=>{add('ProgressBar','Menu');prop('value',64);add('Button','Menu');prop('text','Начать приключение');add('Label','Menu');prop('text','Моя игра');});
mission('timer-event',({add,prop,act,run})=>{add('Timer','Main');prop('wait_time',1.5);prop('one_shot',true);prop('autostart',true);run();act({type:'timer'});});
mission('repair-scene',({select,prop,run})=>{select('BodyShape');prop('disabled',false);run();});
mission('first-3d',({add,prop,act})=>{add('Camera3D','World');prop('current',true);add('DirectionalLight3D','World');prop('energy',.8);add('MeshInstance3D','World');prop('mesh','BoxMesh');act({type:'tab',value:'3D'});});
mission('coin-playtest',({select,act,run})=>{select('Main');act({type:'instance'});run();act({type:'move',direction:1});});

// Regression: stale runtime success cannot pass after editing a physical property.
let stale=reduce(physics.c,physics.s,{type:'select',id:'Player'});
stale=reduce(physics.c,stale,{type:'set',key:'y',value:300});
assert.equal(evaluate(physics.c,stale).ok,false);
stale=reduce(physics.c,stale,{type:'run'});
assert.equal(evaluate(physics.c,stale).ok,false,'floor above the actor is not support');
// Same types with the wrong parent must fail; names and creation order remain free.
let bad=initial(catalog['first-scene']);
for(const type of ['Node2D','Label','Sprite2D'])bad=reduce(catalog['first-scene'],bad,{type:'add',nodeType:type});
bad=reduce(catalog['first-scene'],bad,{type:'set',key:'texture',value:'icon.svg'});
bad=reduce(catalog['first-scene'],bad,{type:'run'});
assert.equal(evaluate(catalog['first-scene'],bad).ok,false,'nested Sprite2D is not a sibling of Label');
// Corrupted/imported state must not hang tree traversal or manufacture runtime proof.
const imported=restore(scene.c,{v:1,nodes:[{id:'a',type:'Node2D',parent:'b'},{id:'b',type:'Node2D',parent:'a'},{id:'__proto__',type:'__proto__'}],selected:'bogus',evidence:{ran:true,pressed:true},tiles:['bad']});
assert.equal(imported.nodes.length,0);
assert.equal(imported.evidence,null);
// Removing a parent removes descendants and their signal connections.
let removed=reduce(scene.c,scene.s,{type:'select',id:scene.s.nodes[0].id});
removed=reduce(scene.c,removed,{type:'remove'});
assert.equal(removed.nodes.length,0);
// Node names are escaped as data; known property schemas reject unknown props and enum values.
let typed=reduce(scene.c,scene.s,{type:'select',id:scene.s.nodes.find(n=>n.type==='Sprite2D').id});
typed=reduce(scene.c,typed,{type:'set',key:'texture',value:'javascript:alert(1)'});
assert.equal(typed.nodes.find(n=>n.type==='Sprite2D').props.texture,'');
// Preserve all lesson/card positions: labs are metadata, not newly inserted card IDs.
const references=[];
for(const m of ctx.window.COURSES.ru.modules)for(const l of m.lessons)for(const c of l.cards)if(c.lab){assert.equal(catalog[c.lab].lesson,l.id);references.push(c.lab);}
assert.equal(new Set(references).size,Object.keys(catalog).length);
assert.equal(checks,Object.keys(catalog).length);
console.log(`${checks} missions completed through state transitions; persistence, alternative solutions, wrong parents, stale evidence and corrupted imports checked.`);
