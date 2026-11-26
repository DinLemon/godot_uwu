// Render every authored scene through the real editor templates, without browser-only events.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');const base=path.join(__dirname,'..');
const context=vm.createContext({window:{},document:{createElement(){return {setAttribute(){},addEventListener(){},innerHTML:''};}}});
for(const file of ['js/text.js','content/course-data.js','js/practice.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context);
for(const id of Object.keys(context.window.GODOT_PRACTICE)){
  const host={appendChild(root){this.root=root;}};context.window.RK.renderPractice(id,host);
  const html=host.root.innerHTML;
  assert.doesNotMatch(html,/undefined|\[object Object\]/,id);
  for(const dock of ['Scene dock','FileSystem dock','Inspector dock'])assert.ok(html.includes(dock),id+': '+dock);
  for(const label of ['Project Settings…','Debugger','Animation','lab-editor-status'])assert.ok(html.includes(label),id+': '+label);
}
const sample=context.window.RK.Practice.sampleAnimation;
assert.equal(sample({keys:[]},.5),null);
const timeline={keys:[{time:2,value:0},{time:0,value:1}]};
assert.equal(sample(timeline,1),.5);assert.equal(sample(timeline,-1),1);assert.equal(sample(timeline,5),0);
console.log('Rendered all 20 editor shells; dock contracts, missing values and animation sampling verified.');
