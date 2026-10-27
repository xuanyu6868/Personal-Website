export function initVoiceProject(root, host) {

const scene=root.getElementById('scene'),text=root.getElementById('utterance'),status=root.getElementById('status'),speechLabel=root.getElementById('speech-label');let timers=[],ticker=null,replyTicker=null,activeRecognition=null,automaticTimer=null,soundEnabled=true,activeUtterance=null;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const examples={plug:{say:'帮我打开灯带。',reply:'好的，灯带已打开。'},light:{say:'帮我打开显示器挂灯。',reply:'好的，挂灯已打开。'},ac:{say:'帮我打开空调。',reply:'好的，空调指令已发送。'}};function later(fn,ms){timers.push(setTimeout(fn,ms))}function current(id){root.querySelectorAll('.timeline-list span').forEach(s=>s.classList.remove('current'));root.getElementById('step-'+id).classList.add('current')}function start(key,opts={}){clearTimeout(automaticTimer);cancelRecognition();stopSpeech();timers.forEach(clearTimeout);timers=[];clearInterval(ticker);clearInterval(replyTicker);const ex=examples[key], spokenText=opts.inputText||ex.say;scene.dataset.device=key;scene.classList.remove('running','thinking','complete');root.querySelectorAll('[data-item]').forEach(el=>el.classList.remove('selected'));root.querySelectorAll('[data-command]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.command===key)));text.textContent='';root.getElementById('reply').textContent='';speechLabel.textContent='正在聆听';status.textContent='互动演示 · 正在识别';current('listen');let i=0;const interval=reduced?1:115;ticker=setInterval(()=>{text.textContent=spokenText.slice(0,++i);if(i>=spokenText.length){clearInterval(ticker);later(()=>{scene.classList.add('running','thinking');speechLabel.textContent='识别完成';status.textContent='互动演示 · 助手正在理解';current('think')},reduced?1:300);later(()=>{scene.classList.remove('thinking');root.querySelector('[data-item="'+key+'"]').classList.add('selected');status.textContent='互动演示 · 指令传递到设备';current('act')},reduced?2:1800);later(()=>{scene.classList.remove('running');scene.classList.add('complete');status.textContent='互动演示，不控制真实设备';current('reply');if(opts.speak!==false)speakReply(ex.reply);let n=0;const reply=root.getElementById('reply');replyTicker=setInterval(()=>{reply.textContent=ex.reply.slice(0,++n);if(n>=ex.reply.length)clearInterval(replyTicker)},reduced?1:95)},reduced?3:2800)}},interval)}root.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{unlockSound();start(b.dataset.command)}));
const images={voice:{title:'语音交互界面',src:'/projects/dsh-voice-assistant/02-voice-interface-preview.png',alt:'语音助手界面静态预览',note:'语音界面为静态组件预览'},home:{title:'米家控制台',src:'/projects/dsh-voice-assistant/05-mijia-console-overview.webp',alt:'米家控制台真实运行截图',note:'米家控制台真实运行截图'},plug:{title:'灯带 · 设备详情',src:'/projects/dsh-voice-assistant/06-mijia-plug-energy-detail.webp',alt:'智能插座设备详情真实截图',note:'设备详情真实运行截图'},light:{title:'显示器挂灯 · 控制界面',src:'/projects/dsh-voice-assistant/07-mijia-lightbar-control.webp',alt:'显示器挂灯控制真实截图',note:'设备控制真实运行截图'}};const overlay=root.getElementById('overlay');let lastFocus, previousOverflow, previousOverlay, closeTimer;function restorePage(){if(previousOverflow!==undefined){document.body.style.overflow=previousOverflow;previousOverflow=undefined;if(previousOverlay===undefined)delete document.body.dataset.overlayOpen;else document.body.dataset.overlayOpen=previousOverlay}}function show(key){const item=images[key];root.getElementById('viewer-title').textContent=item.title;const img=root.getElementById('viewer-image');img.src=item.src;img.alt=item.alt;root.getElementById('viewer-note').textContent=item.note;root.querySelectorAll('.viewer-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===key)))}function openViewer(key){clearTimeout(closeTimer);lastFocus=root.activeElement;previousOverflow=document.body.style.overflow;previousOverlay=document.body.dataset.overlayOpen;document.body.style.overflow='hidden';document.body.dataset.overlayOpen='true';show(key);const rect=lastFocus.getBoundingClientRect();overlay.style.setProperty('--origin-x',(rect.left+rect.width/2-window.innerWidth/2)+'px');overlay.style.setProperty('--origin-y',(rect.top+rect.height/2-window.innerHeight/2)+'px');overlay.classList.add('mounted');requestAnimationFrame(()=>requestAnimationFrame(()=>overlay.classList.add('open')));root.getElementById('close').focus()}function closeViewer(){overlay.classList.remove('open');restorePage();closeTimer=setTimeout(()=>{overlay.classList.remove('mounted');if(lastFocus)lastFocus.focus()},reduced?0:650)}root.getElementById('open-interface').addEventListener('click',()=>openViewer('voice'));root.querySelectorAll('.details').forEach(b=>b.addEventListener('click',()=>openViewer(b.dataset.view)));root.querySelectorAll('.viewer-tabs button').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));root.getElementById('close').addEventListener('click',closeViewer);overlay.addEventListener('click',e=>{if(e.target===overlay)closeViewer()});function onOverlayKeyDown(e){if(!overlay.classList.contains('open'))return;if(e.key==='PageUp'||e.key==='PageDown'){e.stopPropagation();return}if(e.key==='Escape'){closeViewer();return}if(e.key==='Tab'){const focusable=[root.getElementById('close'),...root.querySelectorAll('.viewer-tabs button')];const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&root.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&root.activeElement===last){e.preventDefault();first.focus()}}}root.addEventListener('keydown',onOverlayKeyDown);

const micButton=root.getElementById('mic-button'), soundButton=root.getElementById('sound-button'), voiceNote=root.getElementById('voice-note');
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
function note(message){voiceNote.textContent=message}
function unlockSound(){if('speechSynthesis' in window)window.speechSynthesis.resume()}
function stopSpeech(){if(activeUtterance && 'speechSynthesis' in window){activeUtterance=null;window.speechSynthesis.cancel()}}
function speakReply(message){
 if(!soundEnabled)return;
 if(!('speechSynthesis' in window)){note('此浏览器不支持语音朗读，回复仍会以文字显示。');return}
 const utterance=new SpeechSynthesisUtterance(message);utterance.lang='zh-CN';const voice=window.speechSynthesis.getVoices().find(v=>/^zh(-|_)/i.test(v.lang));if(voice)utterance.voice=voice;utterance.rate=1;
 utterance.onerror=(event)=>{if(activeUtterance!==utterance)return;activeUtterance=null;if(event.error!=='interrupted'&&event.error!=='canceled')note('语音朗读未能播放，请检查浏览器和系统声音。')};utterance.onend=()=>{if(activeUtterance===utterance)activeUtterance=null};activeUtterance=utterance;window.speechSynthesis.speak(utterance);
}
function cancelRecognition(){if(!activeRecognition)return;const previous=activeRecognition;activeRecognition=null;micButton.setAttribute('aria-pressed','false');micButton.textContent='🎙 点击说话';try{previous.abort()}catch{}}
function parseCommand(raw){const t=raw.replace(/\s/g,'');if(/关闭|关掉|关上|不要|别|不开|调暗/.test(t))return null;if(!/打开|开启|开一下|开下|帮我开|开/.test(t))return null;if(/灯带|插座/.test(t))return 'plug';if(/挂灯|显示器灯|屏幕灯/.test(t))return 'light';if(/空调/.test(t))return 'ac';return null}
soundButton.addEventListener('click',()=>{soundEnabled=!soundEnabled;soundButton.setAttribute('aria-pressed',String(soundEnabled));soundButton.textContent=soundEnabled?'声音：开':'声音：关';if(!soundEnabled)stopSpeech();else unlockSound()});
if(!Recognition){micButton.disabled=true;note('此浏览器暂不支持语音识别，可以点击上方指令体验。')}
micButton.addEventListener('click',()=>{
 if(activeRecognition){cancelRecognition();note('已停止聆听。');speechLabel.textContent='已停止聆听';return}
 if(!Recognition)return;
 clearTimeout(automaticTimer);unlockSound();stopSpeech();timers.forEach(clearTimeout);timers=[];clearInterval(ticker);clearInterval(replyTicker);scene.classList.remove('running','thinking','complete');root.querySelectorAll('[data-item]').forEach(el=>el.classList.remove('selected'));root.querySelectorAll('[data-command]').forEach(b=>b.setAttribute('aria-pressed','false'));text.textContent='';root.getElementById('reply').textContent='';current('listen');speechLabel.textContent='正在聆听';status.textContent='互动演示 · 等待语音';note('正在聆听，请说“打开灯带”“打开挂灯”或“打开空调”。');
 const recognition=new Recognition();activeRecognition=recognition;recognition.lang='zh-CN';recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;micButton.setAttribute('aria-pressed','true');micButton.textContent='■ 停止聆听';let gotFinal=false;
 recognition.onresult=event=>{if(activeRecognition!==recognition)return;let partial='',final='';for(let i=event.resultIndex;i<event.results.length;i++){const result=event.results[i];if(result.isFinal)final+=result[0].transcript;else partial+=result[0].transcript}text.textContent=final||partial;if(!final)return;gotFinal=true;const key=parseCommand(final);activeRecognition=null;micButton.setAttribute('aria-pressed','false');micButton.textContent='🎙 点击说话';try{recognition.stop()}catch{}if(key){note('已识别语音 · 下方为模拟演示，不控制真实设备。');start(key,{inputText:final,speak:true})}else{speechLabel.textContent='未匹配演示指令';status.textContent='未匹配指令，请再试一次';note('请试着说“打开灯带”“打开挂灯”或“打开空调”。');speakReply('没有听清，请再说一次。')}};
 recognition.onerror=event=>{if(activeRecognition!==recognition)return;activeRecognition=null;micButton.setAttribute('aria-pressed','false');micButton.textContent='🎙 点击说话';speechLabel.textContent='未能识别语音';const errors={'not-allowed':'麦克风权限未开启，请在浏览器设置中允许后重试。','service-not-allowed':'浏览器语音服务不可用，可以使用上方按钮。','no-speech':'没有听到声音，请再试一次。','audio-capture':'未找到可用麦克风，请检查设备。','network':'语音识别网络不可用，可以使用上方按钮。'};note(errors[event.error]||'语音识别未完成，请重试或使用上方按钮。');status.textContent='互动演示，不控制真实设备'};
 recognition.onend=()=>{if(activeRecognition!==recognition)return;activeRecognition=null;micButton.setAttribute('aria-pressed','false');micButton.textContent='🎙 点击说话';if(!gotFinal){speechLabel.textContent='未识别到指令';note('没有识别到指令，请再试一次。');status.textContent='互动演示，不控制真实设备'}};
 try{recognition.start()}catch{activeRecognition=null;micButton.setAttribute('aria-pressed','false');micButton.textContent='🎙 点击说话';note('语音识别暂时无法启动，请重试或使用上方按钮。')}
});

// Keep the readable string for assistive technology and animate only its visual copy.
root.querySelectorAll('.device-extra').forEach(group=>{
 let cursor=0;
 group.querySelectorAll('small,.device-state,.details').forEach(line=>{
  const content=line.textContent;
  const chars=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(content)].map(x=>x.segment):Array.from(content);
  const accessible=document.createElement('span');accessible.className='screen-reader-text';accessible.textContent=content;
  const visual=document.createElement('span');visual.className='stream-visual';visual.setAttribute('aria-hidden','true');
  chars.forEach((ch,i)=>{const span=document.createElement('span');span.className='stream-char';span.style.setProperty('--char-delay',`${(cursor+i*.065).toFixed(3)}s`);span.textContent=ch;visual.appendChild(span)});
  line.replaceChildren(accessible,visual);cursor+=chars.length*.065+.18;
 });
});
let started=false;
const activityObserver=new IntersectionObserver(([entry])=>{
 if(entry.isIntersecting){requestAnimationFrame(alignRoutes);later(alignRoutes,950)}
 if(entry.isIntersecting&&!started){started=true;automaticTimer=setTimeout(()=>start('plug',{speak:false}),reduced?1:600)}
 if(!entry.isIntersecting&&started){started=false;clearTimeout(automaticTimer);cancelRecognition();timers.forEach(clearTimeout);timers=[];clearInterval(ticker);clearInterval(replyTicker);stopSpeech();scene.classList.remove('running','thinking')}
},{threshold:.15});activityObserver.observe(host);

// Draw each route from measured visual anchors so it stays clear of icons and labels.
function alignRoutes(){
 const stage=root.querySelector('.stage'),svg=root.querySelector('.lines');
 if(!stage||!svg||innerWidth<=850)return;
 const bounds=stage.getBoundingClientRect(), core=root.querySelector('.core').getBoundingClientRect();
 const logoWidth=core.width*.64, centerX=core.left-bounds.left+core.width/2, centerY=core.top-bounds.top+core.height/2;
 const quote=root.querySelector('.speech blockquote').getBoundingClientRect();
 const leftEnd=centerX-logoWidth/2-24, leftStart=Math.min(quote.right-bounds.left+20,leftEnd-28);
 const branchStart=centerX+logoWidth/2+24;
 const targets=[...root.querySelectorAll('.device')].map(row=>{const r=row.getBoundingClientRect();return {x:r.left-bounds.left-8,y:r.top-bounds.top+r.height/2}});
 const incoming=`M ${leftStart} ${centerY} L ${leftEnd} ${centerY}`;
 const routes=targets.map(({x,y})=>{const d=Math.max(16,(x-branchStart)*.58);return `M ${branchStart} ${centerY} C ${branchStart+d} ${centerY} ${x-d} ${y} ${x} ${y}`});
 svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);const paths=svg.querySelectorAll('path');paths[0].setAttribute('d',incoming);paths[1].setAttribute('d',routes.join(' '));paths[2].setAttribute('d',incoming);routes.forEach((d,i)=>paths[i+3].setAttribute('d',d));
}
requestAnimationFrame(alignRoutes);window.addEventListener('resize',alignRoutes);const resizeObserver='ResizeObserver' in window?new ResizeObserver(alignRoutes):null;resizeObserver?.observe(root.querySelector('.stage'));

return () => {restorePage();clearTimeout(closeTimer);root.removeEventListener('keydown',onOverlayKeyDown);activityObserver.disconnect();resizeObserver?.disconnect();window.removeEventListener('resize',alignRoutes);clearTimeout(automaticTimer);timers.forEach(clearTimeout);clearInterval(ticker);clearInterval(replyTicker);cancelRecognition();stopSpeech();};

}
