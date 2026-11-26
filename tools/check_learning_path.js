// Navigation and content contracts; no browser dependencies.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context=vm.createContext({window:{}});
for(const file of ['js/text.js','content/course-data.js','js/learning-path.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const {COURSES,GODOT_PRACTICE:catalog,RK}=context.window,lessons=COURSES.ru.modules.flatMap(m=>m.lessons),byId=Object.fromEntries(lessons.map(l=>[l.id,l]));
assert.equal(new Set(lessons.map(l=>l.id)).size,lessons.length);
let count=0;
for(const lesson of lessons){
  for(const id of lesson.practiceLinks||[]){
    assert.ok(catalog[id],`${lesson.id}: ${id}`);
    for(const step of [0,3,lesson.cards.length+2]){
      const href=RK.LearningPath.practiceHref(id,lesson.id,step),parts=href.slice(2).split('/');
      assert.equal(RK.LearningPath.returnHref(parts,byId,id),`#/l/${lesson.id}/${step}`);
    }
    count++;
  }
  for(const card of lesson.cards){
    for(const match of JSON.stringify(card).matchAll(/#\/(practice|l)\/([a-z0-9-]+)/g)){
      assert.ok(match[1]==='practice'?catalog[match[2]]:byId[match[2]],`${lesson.id}: broken link ${match[0]}`);
    }
  }
}
for(const [id,config] of Object.entries(catalog))assert.ok(byId[config.lesson].practiceLinks.includes(id),`Owner lesson must link ${id}`);
for(const step of ['-1','NaN','Infinity','1.5','1e2','01','999999','<script>'])assert.equal(RK.LearningPath.returnHref(['practice','first-scene','from','m02-workshop',step],byId,'first-scene'),null);
assert.equal(RK.LearningPath.returnHref(['practice','first-scene','from','missing','1'],byId,'first-scene'),null);
assert.equal(RK.LearningPath.returnHref(['practice','first-scene','from','m03-workshop','1'],byId,'first-scene'),null);
assert.equal(RK.LearningPath.returnHref(['practice','first-scene'],byId,'first-scene'),null);
const rendered=RK.LearningPath.render(byId['m02-workshop'],3,catalog,{'first-scene':{passed:true}});
assert.match(rendered,/\/from\/m02-workshop\/3/);assert.match(rendered,/Выполнено/);
assert.equal(RK.LearningPath.render(byId['m20-workshop'],3,catalog,{}),'');
const unsafe={'<lab>':{title:'<img src=x onerror=alert(1)>'}};
assert.doesNotMatch(RK.LearningPath.render({id:'l',practiceLinks:['<lab>']},0,unsafe,{}),/<img/);
console.log(`Checked ${lessons.length} lessons, ${count} practice links, return routes and authored internal links.`);
