// Проверка игровых правил через реальную модель, без браузера.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context=vm.createContext({window:{RK:{}}});
for(const file of ['content/course-data.js','js/game-examples.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const G=context.window.RK.GameExamples,catalog=context.window.GODOT_GAME_EXAMPLES,lessons=context.window.COURSES.ru.modules.flatMap(m=>m.lessons),byId=Object.fromEntries(lessons.map(l=>[l.id,l]));
const run=(kind,value)=>{const s=G.create(kind,value);s.phase='playing';return s;};
const step=(s,input={},frames=1)=>{for(let i=0;i<frames;i++)G.advance(s,1/60,input);};
const moveTo=(s,x,y)=>{for(let i=0;i<1800;i++){if(s.phase==='won')return;const cx=s.player.x+s.player.w/2,cy=s.player.y+s.player.h/2;if(Math.abs(cx-x)<3&&Math.abs(cy-y)<3)return;step(s,{left:cx>x+2,right:cx<x-2,up:cy>y+2,down:cy<y-2});}assert.fail(`Unreachable waypoint ${x},${y}`);};
for(const [id,c] of Object.entries(catalog)){
  assert.ok(byId[c.lesson].cards.some(card=>card.game===id));
  for(const ref of c.related)assert.ok(byId[ref].gameExamples.includes(id));
  const idle=G.create(id);const before=JSON.stringify(idle);G.advance(idle,1);G.action(idle,'buy');assert.equal(JSON.stringify(idle),before,'No autoplay '+id);
}
const shop=run('shop',5);G.action(shop,'buy');assert.equal(shop.coins,0);assert.equal(shop.potions,0);
for(let p=0;p<3;p++){for(let i=0;i<5;i++)G.action(shop,'earn');G.action(shop,'buy');}
assert.equal(shop.phase,'won');assert.equal(shop.coins,0);assert.equal(shop.potions,3);const end=JSON.stringify(shop);G.action(shop,'earn');assert.equal(JSON.stringify(shop),end);
for(const rule of ['cross','row']){const puzzle=run('puzzle',rule);assert.notEqual(puzzle.lights.filter(Boolean).length,9);const lights=JSON.stringify(puzzle.lights);G.action(puzzle,'tile1');G.action(puzzle,'tile1');assert.equal(JSON.stringify(puzzle.lights),lights);for(const i of [8,4,0])G.action(puzzle,'tile'+i);assert.equal(puzzle.phase,'won',rule);}
const corner=run('puzzle','cross');corner.lights=Array(9).fill(false);G.action(corner,'tile0');assert.equal(corner.lights.filter(Boolean).length,3);assert.equal(corner.lights[2],false,'No row wrapping');
const straight=run('adventure'),diagonal=run('adventure');const start={x:straight.player.x,y:straight.player.y};step(straight,{right:true},20);step(diagonal,{right:true,down:true},20);
assert.ok(Math.abs(Math.hypot(straight.player.x-start.x,straight.player.y-start.y)-Math.hypot(diagonal.player.x-start.x,diagonal.player.y-start.y))<.001,'No diagonal boost');
const wall=run('adventure');wall.player.x=180;step(wall,{right:true},300);assert.ok(wall.player.x+wall.player.w<=210.001,'Wall is solid');
const delivery=run('adventure');for(const [x,y] of [[140,70],[140,310],[270,310],[290,280],[480,280],[480,80],[570,270]])moveTo(delivery,x,y);assert.equal(delivery.phase,'won');assert.equal(delivery.score,4);
const jumper=run('platformer');G.action(jumper,'jump');const vy=jumper.player.vy;G.action(jumper,'jump');assert.equal(jumper.player.vy,vy,'No air jump');step(jumper,{},90);assert.ok(jumper.player.grounded);assert.equal(jumper.player.y,298);
const platformer=run('platformer');for(let i=0;i<2400&&platformer.phase==='playing';i++){const target=platformer.items[0]?.x||0,cx=platformer.player.x+11;if(platformer.player.grounded)G.action(platformer,'jump');step(platformer,{right:cx<target-2,left:cx>target+2});}assert.equal(platformer.phase,'won','All platform stars reachable');
const missed=run('runner');step(missed,{},400);assert.equal(missed.phase,'lost','Obstacle ends run');
const runner=run('runner');for(let i=0;i<3600&&runner.phase==='playing';i++){const next=runner.obstacles.find(b=>b.x+b.w>=runner.player.x);if(next&&next.x-runner.player.x<95&&runner.player.grounded)G.action(runner,'jump');step(runner);}assert.equal(runner.phase,'won','Five obstacles can be cleared');
const paused=run('runner');step(paused,{},30);paused.phase='paused';const pausedState=JSON.stringify(paused);step(paused,{right:true},200);assert.equal(JSON.stringify(paused),pausedState,'Pause freezes spawn and movement');
const ball=run('ricochet');ball.ball.x=9;ball.ball.y=240;ball.ball.vx=-180;ball.ball.vy=0;step(ball);assert.ok(ball.ball.vx>0,'Wall bounce');
ball.ball.x=ball.paddle.x+50;ball.ball.y=316;ball.ball.vx=0;ball.ball.vy=200;step(ball,{},2);assert.ok(ball.ball.vy<0,'Paddle bounce');assert.ok(Math.abs(Math.hypot(ball.ball.vx,ball.ball.vy)-ball.setting)<.001,'Bounce keeps configured speed');
const brick=run('ricochet');brick.ball.x=140;brick.ball.y=40;brick.ball.vx=0;brick.ball.vy=200;step(brick,{},3);assert.equal(brick.score,1);assert.equal(brick.bricks.length,7);step(brick);assert.equal(brick.score,1,'One brick counts once');
const lastBrick=run('ricochet');lastBrick.bricks=[lastBrick.bricks[0]];lastBrick.ball.x=140;lastBrick.ball.y=40;lastBrick.ball.vx=0;lastBrick.ball.vy=200;step(lastBrick,{},3);assert.equal(lastBrick.phase,'won');
const lostBall=run('ricochet');lostBall.ball.y=371;step(lostBall);assert.equal(lostBall.phase,'lost');
assert.equal(G.create('platformer',Infinity).setting,400);assert.equal(G.create('platformer',99999).setting,520);assert.equal(G.create('puzzle','bad').setting,'cross');
console.log('Six game examples checked: reachable goals, loss, pause, boundary collisions, no air jump, diagonal speed, puzzle rules, shop transactions and course links.');
