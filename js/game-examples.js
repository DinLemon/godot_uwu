// Шесть браузерных моделей механик. Godot здесь не запускается.
(function () {
  "use strict";
  const RK=window.RK, W=640,H=360, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const cleanups=new Set();
  function create(kind,value) {
    const config=window.GODOT_GAME_EXAMPLES[kind];
    if(!config)throw new Error("Unknown game example");
    const spec=config.parameter;
    const setting=spec.options?(Object.hasOwn(spec.options,value)?value:spec.value):clamp(Number.isFinite(Number(value))?Number(value):spec.value,spec.min,spec.max);
    const s={kind,setting,time:0,score:0,phase:"ready",message:"Нажми «Начать».",player:{x:42,y:298,w:22,h:28,vy:0,grounded:true},items:[],moves:0};
    if(kind==='platformer'){
      s.platforms=[{x:0,y:326,w:640,h:34},{x:170,y:260,w:110,h:16},{x:345,y:210,w:110,h:16},{x:520,y:160,w:90,h:16}];
      s.items=[{x:220,y:236},{x:400,y:186},{x:565,y:136}];
    }
    if(kind==='adventure'){
      s.player={x:50,y:170,w:22,h:28};
      s.walls=[{x:210,y:70,w:28,h:210},{x:420,y:0,w:28,h:210}];
      s.items=[{x:140,y:70},{x:290,y:280},{x:480,y:80},{x:570,y:270}];
    }
    if(kind==='ricochet'){
      s.paddle={x:270,y:326,w:100,h:14};s.ball={x:320,y:300,r:8,vx:setting*.55,vy:-setting*Math.sqrt(1-.55**2)};
      s.bricks=Array.from({length:8},(_,i)=>({x:90+(i%4)*118,y:52+Math.floor(i/4)*34,w:106,h:22}));
    }
    if(kind==='runner'){s.player.x=90;s.spawn=.8;s.obstacles=[];}
    if(kind==='puzzle'){
      s.lights=Array(9).fill(true);
      for(const index of [0,4,8])toggle(s,index);
      s.cursor=0;
    }
    if(kind==='shop'){s.coins=0;s.potions=0;}
    return s;
  }
  function toggle(s,index) {
    const x=index%3,y=Math.floor(index/3);
    for(let i=0;i<9;i++)if(s.setting==='row'?Math.floor(i/3)===y:Math.abs(i%3-x)+Math.abs(Math.floor(i/3)-y)<=1)s.lights[i]=!s.lights[i];
  }
  function terminal(s,won,message){s.phase=won?'won':'lost';s.message=message;}
  function action(s,command) {
    if(s.phase!=='playing')return;
    if(command==='jump'&&['platformer','runner'].includes(s.kind)&&s.player.grounded){s.player.vy=-(s.kind==='platformer'?s.setting:400);s.player.grounded=false;}
    if(s.kind==='puzzle'&&/^tile[0-8]$/.test(command)){
      toggle(s,Number(command.slice(4)));s.moves++;s.message='Ходов: '+s.moves;
      if(s.lights.every(Boolean))terminal(s,true,'Маяк зажжён. Ходов: '+s.moves+'.');
    }
    if(s.kind==='shop'){
      if(command==='earn'){s.coins++;s.message='Монета в кошельке.';}
      if(command==='buy'){
        if(s.coins<s.setting){s.message='Не хватает монет. Деньги и зелья остались на месте.';return;}
        s.coins-=s.setting;s.potions++;s.score=s.potions;s.message='Куплено зелье.';
        if(s.potions===3)terminal(s,true,'Три зелья куплены. Остаток: '+s.coins+' монет.');
      }
    }
  }
  function advance(s,dt,input={}) {
    if(s.phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    // Ограниченные подшаги сохраняют столкновения при медленном кадре.
    const steps=Math.ceil(Math.min(dt,.1)/(1/120)),delta=Math.min(dt,.1)/steps;
    for(let i=0;i<steps&&s.phase==='playing';i++)tick(s,delta,input);
  }
  function tick(s,dt,input) {
    s.time+=dt;const p=s.player,dx=Number(!!input.right)-Number(!!input.left),dy=Number(!!input.down)-Number(!!input.up);
    if(s.kind==='platformer'||s.kind==='runner'){
      if(s.kind==='platformer')p.x=clamp(p.x+dx*200*dt,0,W-p.w);
      const before=p.y+p.h;p.vy+=850*dt;p.y+=p.vy*dt;p.grounded=false;
      const platforms=s.platforms||[{x:0,y:326,w:640,h:34}];
      for(const floor of [...platforms].sort((a,b)=>a.y-b.y))if(p.vy>=0&&before<=floor.y+.1&&p.y+p.h>=floor.y&&p.x+p.w>floor.x&&p.x<floor.x+floor.w){p.y=floor.y-p.h;p.vy=0;p.grounded=true;break;}
      if(s.kind==='platformer'){
        s.items=s.items.filter(item=>{if(Math.hypot(p.x+p.w/2-item.x,p.y+p.h/2-item.y)<25){s.score++;return false;}return true;});
        if(!s.items.length)terminal(s,true,'Все три звезды собраны. Лесная почта довольна.');
      }else{
        s.spawn-=dt;
        if(s.spawn<=0){s.obstacles.push({x:650,y:292,w:24,h:34,counted:false});s.spawn+=1.65;}
        for(const box of s.obstacles){box.x-=s.setting*dt;if(overlap(p,box)){terminal(s,false,'Ящик преградил путь. Попробуй прыгнуть чуть раньше.');return;}if(!box.counted&&box.x+box.w<p.x){box.counted=true;s.score++;}}
        s.obstacles=s.obstacles.filter(box=>box.x+box.w>0);
        if(s.score>=5)terminal(s,true,'Пять ящиков позади. Посылка доставлена.');
      }
    }
    if(s.kind==='adventure'){
      const length=Math.hypot(dx,dy)||1,oldX=p.x,oldY=p.y;
      p.x=clamp(p.x+dx/length*s.setting*dt,0,W-p.w);if(s.walls.some(w=>overlap(p,w)))p.x=oldX;
      p.y=clamp(p.y+dy/length*s.setting*dt,0,H-p.h);if(s.walls.some(w=>overlap(p,w)))p.y=oldY;
      s.items=s.items.filter(item=>{if(Math.hypot(p.x+p.w/2-item.x,p.y+p.h/2-item.y)<25){s.score++;return false;}return true;});
      if(!s.items.length)terminal(s,true,'Четыре посылки собраны. Можно возвращаться домой.');
    }
    if(s.kind==='ricochet'){
      const b=s.ball,oldY=b.y;s.paddle.x=clamp(s.paddle.x+dx*330*dt,0,W-s.paddle.w);b.x+=b.vx*dt;b.y+=b.vy*dt;
      if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx);}if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx);}if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy);}
      if(b.vy>0&&oldY+b.r<=s.paddle.y&&b.y+b.r>=s.paddle.y&&b.x>=s.paddle.x-b.r&&b.x<=s.paddle.x+s.paddle.w+b.r){
        b.y=s.paddle.y-b.r;const offset=clamp((b.x-(s.paddle.x+s.paddle.w/2))/(s.paddle.w/2),-.85,.85);
        b.vx=s.setting*offset;b.vy=-s.setting*Math.sqrt(1-offset*offset);
      }
      const index=s.bricks.findIndex(brick=>overlap({x:b.x-b.r,y:b.y-b.r,w:b.r*2,h:b.r*2},brick));
      if(index>=0){const brick=s.bricks[index];if(oldY+b.r<=brick.y||oldY-b.r>=brick.y+brick.h)b.vy*=-1;else b.vx*=-1;s.bricks.splice(index,1);s.score++;}
      if(!s.bricks.length)terminal(s,true,'Все восемь блоков разбиты.');else if(b.y-b.r>H)terminal(s,false,'Шар ушёл вниз. Перезапусти и попробуй поймать его платформой.');
    }
  }
  function readout(s) {
    if(s.kind==='shop')return `Монеты: ${s.coins} · Зелья: ${s.potions}/3 · Цена: ${s.setting}`;
    if(s.kind==='puzzle')return `Огни: ${s.lights.filter(Boolean).length}/9 · Ходы: ${s.moves}`;
    return `Счёт: ${s.score}/${{platformer:3,adventure:4,ricochet:8,runner:5}[s.kind]}`;
  }
  function draw(ctx,s) {
    ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,W,H);
    const space=s.kind==='ricochet',night=s.kind==='adventure'||s.kind==='puzzle';
    const gradient=ctx.createLinearGradient(0,0,0,H);gradient.addColorStop(0,space?'#141d3b':night?'#1a2944':'#bce5ed');gradient.addColorStop(1,space?'#25365b':night?'#344f61':'#ecdfbd');ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
    const rect=(x,y,w,h,color,r=5)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
    const text=(str,x,y,size=18,color='#fff')=>{ctx.fillStyle=color;ctx.font=`600 ${size}px "Segoe UI",sans-serif`;ctx.fillText(str,x,y);};
    const circle=(x,y,r,c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
    const star=(x,y)=>{circle(x,y,13,'#bf852c');circle(x,y-1,10,'#ffe399');text('✦',x-7,y+5,19,'#9c6624');};
    const fox=(x,y)=>{
      ctx.save();ctx.translate(x,y);ctx.fillStyle='#de8455';ctx.beginPath();ctx.moveTo(1,13);ctx.lineTo(-12,6);ctx.lineTo(-8,25);ctx.lineTo(4,25);ctx.fill();
      rect(0,9,22,19,'#ef985b',6);ctx.fillStyle='#ef985b';ctx.beginPath();ctx.moveTo(0,12);ctx.lineTo(0,-2);ctx.lineTo(9,6);ctx.lineTo(21,-2);ctx.lineTo(22,12);ctx.fill();
      rect(3,17,16,9,'#fff0d8',5);circle(6,12,2,'#273240');circle(16,12,2,'#273240');circle(11,19,2,'#273240');ctx.restore();
    };
    if(space||night){for(let i=0;i<24;i++)circle((i*97+23)%W,(i*47+18)%220,i%4===0?2:1,'#b9d9e4');circle(560,48,22,'#f2e4b8');}
    if(!space&&s.kind!=='puzzle'&&s.kind!=='shop'){
      for(let i=0;i<8;i++){const x=i*95-20;rect(x+17,190,8,145,night?'#304955':'#99b6a2');circle(x+20,190,40,night?'#304955':'#99b6a2');}
    }
    if(s.kind==='platformer'||s.kind==='runner'){
      for(const p of s.platforms||[{x:0,y:326,w:640,h:34}]){rect(p.x,p.y,p.w,p.h,'#906852');rect(p.x,p.y,p.w,7,'#83b898',3);}
      for(const box of s.obstacles||[]){rect(box.x,box.y,box.w,box.h,'#b77b55');text('×',box.x+5,box.y+25,22,'#f7dca3');}
      fox(s.player.x,s.player.y);
    }
    if(s.kind==='adventure'){
      for(const wall of s.walls){rect(wall.x,wall.y,wall.w,wall.h,'#64768c');for(let y=wall.y+8;y<wall.y+wall.h;y+=25)rect(wall.x+3,y,wall.w-6,2,'#8fa0b0',1);}
      fox(s.player.x,s.player.y);
    }
    for(const item of s.items)star(item.x,item.y);
    if(space){for(const [i,b] of s.bricks.entries())rect(b.x,b.y,b.w,b.h,['#e0a4a4','#96c4df','#b7aed8','#96c4b1'][i%4]);rect(s.paddle.x,s.paddle.y,s.paddle.w,s.paddle.h,'#e7c89a');circle(s.ball.x,s.ball.y,s.ball.r,'#f9f1da');}
    if(s.kind==='puzzle'){
      rect(190,20,260,320,'#34485a',15);text('ЛЕСНОЙ МАЯК',240,48,20,'#dce9ee');
      for(let i=0;i<9;i++){const x=218+i%3*76,y=66+Math.floor(i/3)*76;rect(x,y,60,60,s.lights[i]?'#f0d78c':'#1c3046',10);text(String(i+1),x+23,y+38,22,s.lights[i]?'#66502a':'#acc0d4');}
    }
    if(s.kind==='shop'){
      rect(105,82,430,230,'#604957',15);rect(86,78,468,38,'#c99b9c',6);text('ЛАВКА ЗЕЛИЙ',240,105,23,'#392b41');
      fox(158,250);for(let i=0;i<3;i++){const x=270+i*74;rect(x,185,30,53,i<s.potions?'#9acfc1':'#3e354c',10);rect(x+8,173,14,18,'#cba778',3);rect(x-4,246,38,8,'#ad8a75',2);}
      text('Собери монеты → купи 3 зелья',173,151,18,'#f6e3cb');text(`${s.coins} монет`,265,287,21,'#ffe2a0');
    }
    if(s.phase==='ready'||s.phase==='paused'||s.phase==='won'||s.phase==='lost'){
      rect(70,126,500,80,'#182635e8',12);
      text({ready:'Начни свой маленький опыт',paused:'Пауза',won:'Получилось',lost:'Ещё одна попытка?'}[s.phase],s.phase==='ready'?120:220,164,25);
      text(s.phase==='ready'?'Управление и параметры — под сценой':'Кнопки управления — под сценой',165,190,16,'#b6ccdc');
    }
  }
  function render(id,target) {
    const config=window.GODOT_GAME_EXAMPLES?.[id];if(!config)return;
    const {esc}=RK,root=document.createElement('section');root.className='game-example';root.setAttribute('aria-label',config.title);
    const spec=config.parameter;
    const inputs=id==='adventure'?['left','up','down','right']:id==='platformer'?['left','jump','right']:id==='runner'?['jump']:id==='ricochet'?['left','right']:id==='shop'?['earn','buy']:[];
    const labels={left:'Влево',right:'Вправо',up:'Вверх',down:'Вниз',jump:'Прыжок',earn:'Заработать монету',buy:'Купить зелье'};
    root.innerHTML=`<div class="game-example-heading"><span>${esc(config.genre)}</span><strong>${esc(config.title)}</strong></div>
      <p>${esc(config.brief)}</p><canvas width="1280" height="720" tabindex="0" role="application" aria-label="${esc(config.title)}. ${esc(config.controls)}"></canvas>
      <p class="game-readout" aria-live="off"></p><p class="game-event" role="status"></p>
      <div class="game-actions"><button type="button" class="btn btn-sm" data-game="start">Начать</button><button type="button" class="btn btn-sm btn-quiet" data-game="reset">Начать заново</button></div>
      <div class="game-pad">${inputs.map(key=>`<button type="button" class="btn btn-sm btn-quiet" data-input="${key}">${labels[key]}</button>`).join('')}${id==='puzzle'?Array.from({length:9},(_,i)=>`<button type="button" class="btn btn-sm btn-quiet" data-input="tile${i}" aria-label="Огонь ${i+1}">${i+1}</button>`).join(''):''}</div>
      <p class="small muted">${esc(config.controls)} Esc — пауза. Чтобы управлять клавиатурой, выбери окно игры.</p>
      <label class="game-parameter">${esc(spec.label)} ${spec.options?`<select aria-label="${esc(spec.label)}">${Object.entries(spec.options).map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('')}</select>`:`<input type="range" aria-label="${esc(spec.label)}" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${spec.value}"><output>${spec.value}</output>`}</label>
      <p class="game-experiment"><b>Измени и сравни.</b> ${esc(config.experiment)}</p><p class="small muted">Браузерная модель механики. Godot здесь не запускается; код в уроке разбирает отдельное правило этой игры.</p>`;
    target.appendChild(root);const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');
    if(!ctx){root.querySelector('.game-event').textContent='Не удалось открыть Canvas. Разбор и код доступны в уроке.';return;}
    const parameter=root.querySelector('input, select');parameter.value=spec.value;
    let state=create(id,spec.value),frame=0,lastTime=0,disposed=false;const held={};const abort=new AbortController();
    const on=(element,event,handler)=>element.addEventListener(event,handler,{signal:abort.signal});
    const update=()=>{
      root.querySelector('.game-readout').textContent=readout(state);
      const status=root.querySelector('.game-event');if(status.textContent!==state.message)status.textContent=state.message;
      const start=root.querySelector('[data-game="start"]');start.textContent=state.phase==='playing'?'Пауза':state.phase==='paused'?'Продолжить':'Начать';start.disabled=['won','lost'].includes(state.phase);
      root.querySelectorAll('[data-input]').forEach(button=>{button.disabled=state.phase!=='playing';if(id==='puzzle'){const index=Number(button.dataset.input.slice(4));button.setAttribute('aria-pressed',String(state.lights[index]));button.setAttribute('aria-label',`Огонь ${index+1}: ${state.lights[index]?'включён':'выключен'}`);}});
      draw(ctx,state);
    };
    const clearHeld=()=>Object.keys(held).forEach(key=>delete held[key]);
    function pause(){if(state.phase==='playing'){state.phase='paused';state.message='Пауза. Можно спокойно прочитать объяснение.';}cancelAnimationFrame(frame);frame=0;clearHeld();update();}
    function loop(now){if(disposed||!root.isConnected){dispose();return;}advance(state,lastTime?Math.min((now-lastTime)/1000,.1):0,held);lastTime=now;update();if(state.phase==='playing')frame=requestAnimationFrame(loop);else{frame=0;clearHeld();}}
    function start(){if(state.phase==='playing'){pause();return;}if(['won','lost'].includes(state.phase))return;state.phase='playing';state.message='Опыт запущен.';lastTime=0;update();canvas.focus({preventScroll:true});if(!['puzzle','shop'].includes(id))frame=requestAnimationFrame(loop);}
    function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);abort.abort();cleanups.delete(dispose);clearHeld();}
    cleanups.add(dispose);
    on(root.querySelector('[data-game="start"]'),'click',start);
    on(root.querySelector('[data-game="reset"]'),'click',()=>{cancelAnimationFrame(frame);frame=0;clearHeld();state=create(id,parameter.value);update();});
    on(parameter,'change',()=>{cancelAnimationFrame(frame);frame=0;clearHeld();state=create(id,parameter.value);const out=root.querySelector('output');if(out)out.textContent=state.setting;update();});
    const codeMap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',Space:'jump',KeyC:'earn',KeyB:'buy'};
    on(canvas,'keydown',event=>{if(event.code==='Escape'){event.preventDefault();pause();return;}const command=id==='puzzle'&&/^[1-9]$/.test(event.key)?'tile'+(Number(event.key)-1):codeMap[event.code];if(!command)return;event.preventDefault();if(['left','right','up','down'].includes(command))held[command]=true;else if(!event.repeat)action(state,command);update();});
    on(canvas,'keyup',event=>{const command=codeMap[event.code];if(command){event.preventDefault();delete held[command];}});
    on(canvas,'blur',clearHeld);
    root.querySelectorAll('[data-input]').forEach(button=>{
      const command=button.dataset.input,continuous=['left','right','up','down'].includes(command);
      if(continuous){on(button,'pointerdown',event=>{if(state.phase!=='playing')return;event.preventDefault();button.setPointerCapture(event.pointerId);held[command]=true;});for(const event of ['pointerup','pointercancel','lostpointercapture'])on(button,event,()=>delete held[command]);on(button,'click',event=>{if(event.detail===0){advance(state,.1,{[command]:true});update();}});}
      else on(button,'click',()=>{action(state,command);update();});
    });
    on(window,'blur',pause);on(document,'visibilitychange',()=>{if(document.hidden)pause();});on(window,'pagehide',dispose);
    update();
  }
  RK.GameExamples={create,advance,action,readout,render,stopAll:()=>[...cleanups].forEach(dispose=>dispose())};
})();
