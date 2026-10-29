import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {weiclawBookPages} from '../../data/weiclaw-3d-pages';
import './book3d.css';
import {createPage as leaf, deformPage, PAGE_TURN_MS, PAGE_WIDTH as W, pageCorner} from './pageTurn';

type Direction='next'|'previous';
export type BookView='read'|'perspective';
type Props={index:number;onTurn:(direction:Direction)=>void;onOpen:(index:number)=>void;turn:Direction|null;onTurnEnd:()=>void;onUnavailable:()=>void;onOpeningChange:(opening:boolean)=>void;openRevision:number;view:BookView;viewRevision:number};
const PAGE_COUNT=weiclawBookPages.length,BLANK_PAGE=PAGE_COUNT;
type ImageRect={x:number;y:number;width:number;height:number};
// The rectangles use the same 1440 × 1920 coordinates as the printed page.
const imageRects:(ImageRect|null)[]=Array(PAGE_COUNT).fill(null);
function pageTexture(i:number,flipY:boolean){
 const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1920;const c=canvas.getContext('2d')!;const p=weiclawBookPages[i];
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=flipY;texture.anisotropy=8;
 const img=new Image();
 const wrap=(text:string,x:number,y:number,maxWidth:number,lineHeight:number)=>{let line='';for(const ch of text){const next=line+ch;if(c.measureText(next).width>maxWidth&&line){c.fillText(line,x,y);y+=lineHeight;line=ch}else line=next}if(line)c.fillText(line,x,y)};
 function draw(){
  c.fillStyle='#f8f5ed';c.fillRect(0,0,1440,1920);c.fillStyle='#a45943';c.font='bold 26px Arial, sans-serif';c.fillText(p?p.type:'WEICLAW',135,135);c.textAlign='right';c.fillStyle='#706d63';c.font='bold 25px Arial, sans-serif';c.fillText(p?`${p.number} / ${String(PAGE_COUNT).padStart(2,'0')}`:'PROJECT NOTES',1305,135);c.textAlign='left';c.strokeStyle='#cac4b7';c.lineWidth=2;c.beginPath();c.moveTo(135,170);c.lineTo(1305,170);c.stroke();
  if(p){
   c.fillStyle='#222724';c.font='600 90px "PingFang SC", "Microsoft YaHei", sans-serif';c.fillText(p.title.replace('\n',' '),135,280,1170);c.fillStyle='#4c4e49';c.font='44px "PingFang SC", "Microsoft YaHei", sans-serif';c.fillText(p.description,135,350,1170);
   const box={x:135,y:430,width:1170,height:690};
   if(img.complete&&img.naturalWidth){const crop=p.previewCrop||{x:0,y:0,width:1,height:1},sx=crop.x*img.naturalWidth,sy=crop.y*img.naturalHeight,sw=crop.width*img.naturalWidth,sh=crop.height*img.naturalHeight;const scale=Math.min(box.width/sw,box.height/sh),width=sw*scale,height=sh*scale,x=box.x+(box.width-width)/2,y=box.y;
    c.fillStyle='#fff';c.fillRect(x,y,width,height);c.drawImage(img,sx,sy,sw,sh,x,y,width,height);c.strokeStyle='#d7d0c3';c.lineWidth=2;c.strokeRect(x,y,width,height);imageRects[i]={x:x/1440,y:y/1920,width:width/1440,height:height/1920};
    c.fillStyle='#a45943';c.font='bold 28px "PingFang SC", sans-serif';c.fillText('点击图片放大查看 ↗',135,Math.max(y+height+58,990));
   }
   const even=i%2===0,top=1190;c.strokeStyle='#c9c1b4';c.beginPath();c.moveTo(135,top);c.lineTo(1305,top);c.stroke();
   c.fillStyle='#a45943';c.font='bold 25px Arial, sans-serif';c.fillText(even?'PROJECT INSIGHT':'DESIGN NOTE',135,top+62);
   c.fillStyle='#262a27';c.font='600 48px "PingFang SC", "Microsoft YaHei", sans-serif';c.fillText(p.editorial.heading,135,top+140,1100);
   c.fillStyle='#4c4e49';c.font='37px "PingFang SC", "Microsoft YaHei", sans-serif';wrap(p.editorial.body,even?135:220,top+215,even?1040:1000,58);
   p.editorial.points.forEach((point,n)=>{const x=135+n*600;c.fillStyle='#a45943';c.font='bold 31px "PingFang SC", "Microsoft YaHei", sans-serif';c.fillText(point.label,x,top+320);c.fillStyle='#50514b';c.font='35px "PingFang SC", "Microsoft YaHei", sans-serif';wrap(point.text,x,top+374,535,48)});
   c.fillStyle='#918273';c.font='bold 25px "PingFang SC", "Microsoft YaHei", sans-serif';c.fillText(p.editorial.detail,135,top+500,1100);
  }else{c.fillStyle='#938a7b';c.textAlign='center';c.font='48px Georgia,serif';c.fillText('WEICLAW',720,900);c.font='24px Arial,sans-serif';c.fillText('PROJECT NOTES',720,950);c.textAlign='left';}
  c.fillStyle='#817a6e';c.font='bold 22px Arial, sans-serif';c.fillText('WEICLAW / PRODUCT DESIGN',135,1810);c.textAlign='right';c.fillText(p?p.number:'',1305,1810);c.textAlign='left';texture.needsUpdate=true;
 }
 img.onload=draw;if(p)img.src=p.image;draw();return texture;
}
export default function Book3D({index,onTurn,onOpen,turn,onTurnEnd,onUnavailable,onOpeningChange,openRevision,view,viewRevision}:Props){
 const host=useRef<HTMLDivElement>(null);const controls=useRef({index,onTurn,onOpen,turn,onTurnEnd,openRevision,view,viewRevision});controls.current={index,onTurn,onOpen,turn,onTurnEnd,openRevision,view,viewRevision};const [failed,setFailed]=useState(false);
 useEffect(()=>{const el=host.current;if(!el)return;let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});}catch{setFailed(true);onUnavailable();return}renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D 书本，使用左右方向键翻页，点击图片放大');el.appendChild(renderer.domElement);
 const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(26,1,.1,50);camera.position.set(0,0,10);camera.lookAt(0,0,0);scene.add(new THREE.HemisphereLight(0xffffff,0xb5a48e,1.1));const key=new THREE.DirectionalLight(0xffffff,1.8);key.position.set(-4,6,7);scene.add(key);const fill=new THREE.DirectionalLight(0xe8d7c0,.65);fill.position.set(5,-3,6);scene.add(fill);
 const presentation=new THREE.Group();presentation.rotation.z=-.1;scene.add(presentation);const book=new THREE.Group();book.rotation.set(-.36,-.25,-.035);presentation.add(book);const modelContainer=new THREE.Group();modelContainer.rotation.x=Math.PI/2;book.add(modelContainer);
 // A soft transparent mesh follows the actual page curvature beside the binding.
 // Its vertex alpha fades away from the spine without darkening the page content.
 const crease=(side:'left'|'right')=>{const g=leaf(side),p=g.getAttribute('position') as THREE.BufferAttribute,colors:number[]=[];for(let j=0;j<=22;j++)for(let i=0;i<=44;i++){const u=i/44,alpha=.17*Math.pow(Math.max(0,1-u/.20),2);colors.push(.19,.14,.10,alpha);p.setZ(j*45+i,p.getZ(j*45+i)+.0015)}g.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));const m=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});const mesh=new THREE.Mesh(g,m);mesh.renderOrder=2;return mesh};const creaseMeshes=[crease('left'),crease('right')];creaseMeshes.forEach(m=>{m.visible=false;book.add(m)});
 // A faint, transient contact shadow follows the moving page across both sides.
 const turnShadow=(side:'left'|'right')=>{const g=leaf(side),p=g.getAttribute('position') as THREE.BufferAttribute,colors:number[]=[];for(let i=0;i<p.count;i++){p.setZ(i,p.getZ(i)+.002);colors.push(.19,.14,.10,0)}g.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));const m=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});const mesh=new THREE.Mesh(g,m);mesh.renderOrder=3;book.add(mesh);return mesh};const shadowMeshes=[turnShadow('left'),turnShadow('right')];
 const updateTurnShadow=(side:'left'|'right',t:number,turningPage?:THREE.BufferGeometry,lift=0,tip:0|1=0)=>{const page=turningPage?.getAttribute('position') as THREE.BufferAttribute|undefined;const middle=11*45+44,center=page?page.getX(middle):(side==='right'?1:-1)*W*Math.cos(Math.PI*t),height=page?page.getZ(middle):0;const strength=.14*Math.sin(Math.PI*t),width=.32+Math.min(.4,Math.max(0,height)*.16);for(const mesh of shadowMeshes){const p=mesh.geometry.getAttribute('position') as THREE.BufferAttribute,c=mesh.geometry.getAttribute('color') as THREE.BufferAttribute;for(let i=0;i<p.count;i++){const d=(p.getX(i)-center)/width,v=Math.floor(i/45)/22,corner=(tip===0?1-v:v)**3;c.setW(i,(strength*(.7+.3*Math.sin(Math.PI*v))+.11*lift*corner)*Math.exp(-d*d))}c.needsUpdate=true}};
 let left:THREE.Mesh|null=null,right:THREE.Mesh|null=null,model:THREE.Group|null=null,disposed=false;let modelOpening=true,openingDelay=.175,lastOpenRevision=0;let openingMixer:THREE.AnimationMixer|null=null,openingAction:THREE.AnimationAction|null=null,openingDuration=0;let openingPageBlock:THREE.Object3D|null=null,openingLeaves:THREE.Object3D[]=[],lastLanded=-1;const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;const finishOpening=()=>{if(!modelOpening)return;modelOpening=false;openingLeaves.forEach(o=>o.visible=false);updateTurnShadow('right',1);openingPageBlock?.children.forEach(o=>o.visible=true);creaseMeshes.forEach(m=>m.visible=true);onOpeningChange(false)};const showLandedLayers=(time:number)=>{if(!openingPageBlock)return;const landed=[54,67,80,93,106,119,132,145].filter(frame=>time>=frame/30).length;if(landed===lastLanded)return;lastLanded=landed;openingPageBlock.children.forEach(o=>{const match=o.name.match(/^Left_(?:continuous_page_layer|stepped_bottom_layer)_(\d+)$/);o.visible=(o.name==='Left_paper_body'&&landed>0)||(!!match&&Number(match[1])<=Math.floor(landed*12/8))})};const startOpening=()=>{if(!openingMixer||!openingAction)return;modelOpening=true;openingDelay=.175;lastLanded=-1;creaseMeshes.forEach(m=>m.visible=false);openingLeaves.forEach(o=>o.visible=true);showLandedLayers(0);updateTurnShadow('right',1);onOpeningChange(true);openingAction.reset().play();openingMixer.setTime(0);if(reduced){openingMixer.setTime(openingDuration);finishOpening()}};const printed=Array.from({length:PAGE_COUNT+1},(_,i)=>pageTexture(i,false));
 new GLTFLoader().load('/models/weiclaw-blender-book.glb?v=20261029-album-curl',gltf=>{if(disposed)return;model=gltf.scene;modelContainer.add(model);model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const m=o.material as THREE.Material;if(m.name==='Warm uncoated paper'){const parent=o.parent?.name ?? "";if(parent.startsWith('Left_page_block'))left=o;else if(parent.startsWith('Right_page_block'))right=o;o.material=new THREE.MeshStandardMaterial({map:printed[0],roughness:.95,side:THREE.DoubleSide})}});if(!left||!right){console.error('Book page meshes missing');setFailed(true);onUnavailable();return}currentIndex=-1;openingPageBlock=model.getObjectByName('Left_pages_hinge')||null;openingLeaves=[1,2,3,4,5,6,7,8].map(n=>model!.getObjectByName(`Opening_leaf_0${n}`)).filter(Boolean) as THREE.Object3D[];const clip=gltf.animations.find(a=>a.name==='Book opens');if(clip&&openingPageBlock&&openingLeaves.length===8){
 // Each real animated page has an independently readable front and back.
 const oldMaterials=new Set<THREE.Material>();openingLeaves.forEach((node,i)=>{if(!(node instanceof THREE.Mesh))return;const previous=node.material;for(const m of Array.isArray(previous)?previous:[previous])oldMaterials.add(m);node.material=new THREE.MeshStandardMaterial({map:printed[(i*2)%PAGE_COUNT],roughness:.95,side:THREE.FrontSide});const geometry=node.geometry.clone(),uv=geometry.getAttribute('uv') as THREE.BufferAttribute;for(let j=0;j<uv.count;j++)uv.setX(j,1-uv.getX(j));uv.needsUpdate=true;const back=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:printed[(i*2+1)%PAGE_COUNT],roughness:.95,side:THREE.BackSide}));back.name='Opening page reverse';back.morphTargetInfluences=node.morphTargetInfluences;back.morphTargetDictionary=node.morphTargetDictionary;node.add(back)});oldMaterials.forEach(m=>m.dispose());openingMixer=new THREE.AnimationMixer(model);openingAction=openingMixer.clipAction(clip);openingAction.setLoop(THREE.LoopOnce,1);openingAction.clampWhenFinished=true;openingDuration=clip.duration;lastOpenRevision=controls.current.openRevision;startOpening()}else{finishOpening()}},undefined,error=>{console.error('Book model failed to load',error);setFailed(true);onUnavailable()});
 let currentIndex=-1,turnDir:Direction|null=null,turnStart=0,turnGroup:THREE.Group|null=null,frontGeom:THREE.BufferGeometry|null=null,backGeom:THREE.BufferGeometry|null=null;let companions:THREE.Mesh[]=[],follow=[0,0],pendingIndex:number|null=null;let turnMode:'auto'|'drag'|'settle'|null=null,dragProgress=0,cornerAmount=0,cornerV:0|1=0,dragSamples:{progress:number;distance:number}[]=[],settleFrom=0,settleCorner=0,settleStart=0,settleDuration=0,settleCommit=false;let frame=0;let orbit={x:-.36,y:-.25,roll:-.1};let target={...orbit};let lastRevision=-1,lastTime=0;let pointer:{x:number;y:number;startX:number;startY:number;side:'left'|'right'|null;image:boolean;orbit:boolean;moved:boolean;corner:0|1}|null=null;
 let baseView=4.75;const resize=()=>{const width=Math.max(1,el.clientWidth),height=Math.max(1,el.clientHeight),a=width/height;baseView=Math.max(4.75,6.5/a);camera.aspect=a;camera.fov=2*Math.atan(baseView/20)*180/Math.PI;camera.updateProjectionMatrix();renderer.setSize(width,height,false)};const observer=new ResizeObserver(resize);observer.observe(el);resize();const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
 const hit=(e:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height)*2+1);ray.setFromCamera(mouse,camera);const objs=[left,right].filter(Boolean) as THREE.Mesh[];const hits=ray.intersectObjects(objs,false);if(!hits.length)return null;const h=hits[0],side: 'left'|'right'=h.object===left?'left':'right',n=controls.current.index+(side==='right'?1:0),bounds=imageRects[n],uv=h.uv;const image=!!(bounds&&uv&&uv.x>=bounds.x&&uv.x<=bounds.x+bounds.width&&uv.y>=bounds.y&&uv.y<=bounds.y+bounds.height);return {side,image,uv}};
 // The page lives under the pointer while dragging; it is committed only on release.
 const canTurn=(side:'left'|'right')=>side==='right'?controls.current.index+2<PAGE_COUNT:controls.current.index>0;
 const startTurn=(dir:Direction,mode:'auto'|'drag',now:number)=>{
  if(turnDir||!left||!right||currentIndex<0)return false;
  const side=dir==='next'?'right':'left';if(!canTurn(side))return false;
  turnDir=dir;turnMode=mode;turnStart=now;dragProgress=0;cornerAmount=0;
  frontGeom=leaf(side);backGeom=leaf(side,true);
  const a=dir==='next'?Math.min(currentIndex+1,BLANK_PAGE):currentIndex,b=dir==='next'?Math.min(currentIndex+2,BLANK_PAGE):Math.max(currentIndex-1,0);
  turnGroup=new THREE.Group();turnGroup.add(new THREE.Mesh(frontGeom,new THREE.MeshStandardMaterial({map:printed[a],roughness:.95,side:THREE.FrontSide})),new THREE.Mesh(backGeom,new THREE.MeshStandardMaterial({map:printed[b],roughness:.95,side:THREE.BackSide})));
  // Two fine corner-sized paper surfaces lift with the active sheet and settle
  // at different speeds; their soft edge keeps the printed page readable.
  companions=[0,1].map(layer=>{const geometry=leaf(side),colors:number[]=[];for(let j=0;j<=22;j++)for(let i=0;i<=44;i++){const u=i/44,v=j/22,near=cornerV===0?1-v:v;const fade=THREE.MathUtils.smoothstep(u,.40,.85)*THREE.MathUtils.smoothstep(near,.25,.82);colors.push(layer===0?.94:.87,layer===0?.92:.85,layer===0?.87:.80,.74*fade)}geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));const m=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});const mesh=new THREE.Mesh(geometry,m);mesh.renderOrder=1;mesh.visible=false;turnGroup!.add(mesh);return mesh});follow=[0,0];book.add(turnGroup);
  const lm=left.material as THREE.MeshStandardMaterial,rm=right.material as THREE.MeshStandardMaterial;
  if(dir==='next')rm.map=printed[Math.min(currentIndex+3,BLANK_PAGE)];else lm.map=printed[Math.max(0,currentIndex-2)];lm.needsUpdate=true;rm.needsUpdate=true;
  // Project the corner at several stages into screen coordinates, including
  // the camera's gradual zoom, to keep it under the moving pointer.
  book.updateWorldMatrix(true,false);camera.updateMatrixWorld();const probe=camera.clone();
  const width=renderer.domElement.getBoundingClientRect().width,zoom=controls.current.view==='perspective'?2.25:1.75;
  let origin=0,furthest=0;dragSamples=[];
  for(let i=0;i<=32;i++){const progress=.84*i/32;probe.fov=2*Math.atan((baseView+zoom*Math.sin(Math.PI*progress))/20)*180/Math.PI;probe.updateProjectionMatrix();probe.updateMatrixWorld();
   const x=pageCorner(side,progress,cornerV).applyMatrix4(book.matrixWorld).project(probe).x;
   if(i===0)origin=x;const travelled=(x-origin)*(side==='right'?-1:1)*width/2;furthest=Math.max(furthest,travelled);dragSamples.push({progress,distance:furthest});
  }
  return true;
 };
 const discardTurn=(restore:boolean)=>{
  if(turnGroup){book.remove(turnGroup);turnGroup.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose()}})}
  turnGroup=null;frontGeom=backGeom=null;pendingIndex=null;companions=[];follow=[0,0];turnDir=null;turnMode=null;dragProgress=0;cornerAmount=0;
  if(restore&&left&&right&&currentIndex>=0){const lm=left.material as THREE.MeshStandardMaterial,rm=right.material as THREE.MeshStandardMaterial;lm.map=printed[currentIndex];rm.map=printed[Math.min(currentIndex+1,BLANK_PAGE)];lm.needsUpdate=true;rm.needsUpdate=true}
  updateTurnShadow('right',1);
 };
 const releaseDrag=(commit:boolean)=>{if(turnMode!=='drag'||!turnDir)return;settleCommit=commit;settleFrom=dragProgress;settleCorner=cornerAmount;settleStart=performance.now();settleDuration=reduced?1:commit?Math.max(90,Math.min(200,(1-dragProgress)*300)):130;turnMode='settle';if(commit)controls.current.onTurn(turnDir)};
 const down=(e:PointerEvent)=>{
  renderer.domElement.classList.remove('keyboard-focus');
  if(modelOpening||turnMode||controls.current.turn||pointer)return;if(e.button!==0&&e.button!==1)return;
  const found=hit(e),side=found?.side||null;if(e.button===1)e.preventDefault();if(!side&&e.button!==1)return;
  const corner:0|1=found?.uv&&found.uv.y<.5?1:0;pointer={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,side,image:!!found?.image,orbit:e.button===1,moved:false,corner};
  renderer.domElement.setPointerCapture(e.pointerId);
  if(e.button===0&&side&&found?.uv&&canTurn(side)){
   const outer=side==='right'?found.uv.x>.78:found.uv.x<.22;
   const nearCorner=found.uv.y<.28||found.uv.y>.72;
   if(outer&&nearCorner){cornerV=corner;startTurn(side==='right'?'next':'previous','drag',performance.now())}
  }
 };
 const move=(e:PointerEvent)=>{
  if(!pointer)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>8)pointer.moved=true;
  if(pointer.orbit){orbit.y=Math.max(-.85,Math.min(.7,orbit.y+dx*.005));orbit.x=Math.max(-1.05,Math.min(.4,orbit.x+dy*.005));target={...orbit}}
  else if(pointer.side&&pointer.moved){if(!turnMode&&canTurn(pointer.side)){cornerV=pointer.corner;startTurn(pointer.side==='right'?'next':'previous','drag',performance.now())}
   if(turnMode==='drag'){const distance=Math.max(0,(e.clientX-pointer.startX)*(pointer.side==='right'?-1:1));let i=1;while(i<dragSamples.length&&dragSamples[i].distance<distance)i++;if(i>=dragSamples.length)dragProgress=.84;else{const a=dragSamples[i-1],b=dragSamples[i],span=b.distance-a.distance;dragProgress=a.progress+(b.progress-a.progress)*(span>0?Math.min(1,(distance-a.distance)/span):1)}}}
  pointer.x=e.clientX;pointer.y=e.clientY;
 };
 const up=(e:PointerEvent)=>{
  if(!pointer)return;const dx=e.clientX-pointer.startX,dy=e.clientY-pointer.startY,found=hit(e);
  if(!pointer.orbit){
   const commit=pointer.moved&&Math.abs(dx)>Math.abs(dy)&&dragProgress>=.84*.35;
   if(turnMode==='drag')releaseDrag(commit);
   if(!pointer.moved&&Math.hypot(dx,dy)<=8&&pointer.side&&pointer.image&&found?.image&&found.side===pointer.side){const n=controls.current.index+(pointer.side==='right'?1:0);if(n<PAGE_COUNT)controls.current.onOpen(n)}
  }pointer=null;
 };
 const cancel=()=>{if(turnMode==='drag')releaseDrag(false);pointer=null};
 const keyboardFocus=(e:KeyboardEvent)=>{if(e.key==='Tab')renderer.domElement.classList.add('keyboard-focus')};
 const aux=(e:MouseEvent)=>{if(e.button===1)e.preventDefault()};
 window.addEventListener('keydown',keyboardFocus,true);renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);renderer.domElement.addEventListener('auxclick',aux);
 const loop=(now:number)=>{frame=requestAnimationFrame(loop);let extraView=0;const state=controls.current;if(lastRevision!==state.viewRevision){lastRevision=state.viewRevision;target=state.view==='read'?{x:-.36,y:-.25,roll:-.1}:{x:-.78,y:-.68,roll:-.34}}const delta=lastTime?Math.min((now-lastTime)/1000,.06):.016;lastTime=now;if(state.openRevision!==lastOpenRevision){lastOpenRevision=state.openRevision;if(turnDir)discardTurn(true);pointer=null;if(openingMixer)startOpening();else onOpeningChange(false)}if(modelOpening&&openingMixer&&openingAction){if(openingDelay>0)openingDelay-=delta;else{openingMixer.update(delta*2);showLandedLayers(openingAction.time);const frameTime=openingAction.time*30,active=[30,43,56,69,82,95,108,121].map(start=>(frameTime-start)/24).filter(p=>p>0&&p<1).sort((a,b)=>Math.abs(a-.5)-Math.abs(b-.5))[0];updateTurnShadow('right',active??1);if(openingAction.time>=openingDuration-1e-5)finishOpening()}if(modelOpening)extraView=3.8*Math.sin(Math.PI*Math.pow(openingAction.time/openingDuration,.55))}if(!pointer?.orbit){const lerp=(a:number,b:number)=>reduced?b:THREE.MathUtils.damp(a,b,7,delta);orbit={x:lerp(orbit.x,target.x),y:lerp(orbit.y,target.y),roll:lerp(orbit.roll,target.roll)}}book.rotation.x=orbit.x;book.rotation.y=orbit.y;presentation.rotation.z=orbit.roll;if(left&&right){const lm=left.material as THREE.MeshStandardMaterial,rm=right.material as THREE.MeshStandardMaterial;if(pendingIndex!==null&&state.index===pendingIndex){currentIndex=state.index;lm.map=printed[currentIndex];rm.map=printed[Math.min(currentIndex+1,BLANK_PAGE)];lm.needsUpdate=true;rm.needsUpdate=true;discardTurn(false)}else if(pendingIndex===null&&currentIndex!==state.index){currentIndex=state.index;lm.map=printed[currentIndex];rm.map=printed[Math.min(currentIndex+1,BLANK_PAGE)];lm.needsUpdate=true;rm.needsUpdate=true}
 if(state.turn&&!turnDir&&!modelOpening)startTurn(state.turn,'auto',now);
 if(turnDir&&frontGeom&&backGeom){
  let t=0,lift=0,done=false;
  if(turnMode==='auto'){t=reduced?1:Math.min(1,(now-turnStart)/PAGE_TURN_MS);done=t>=1}
  else if(turnMode==='drag'){cornerAmount=reduced?1:Math.min(1,cornerAmount+delta*5.5);t=dragProgress;lift=cornerAmount*Math.max(0,1-t/.24)}
  else if(turnMode==='settle'){const f=Math.min(1,(now-settleStart)/settleDuration),ease=f*f*(3-2*f);t=settleFrom+((settleCommit?1:0)-settleFrom)*ease;lift=settleCorner*(1-ease)*Math.max(0,1-t/.24);done=f>=1}
  extraView=(state.view==='perspective'?2.25:1.75)*Math.sin(Math.PI*t);
  const side=turnDir==='next'?'right':'left';deformPage(frontGeom,side,t,lift,cornerV);deformPage(backGeom,side,t,lift,cornerV);
  const envelope=1-THREE.MathUtils.smoothstep(t,.69,.96),wave=Math.sin(Math.PI*Math.min(1,t/.72));
  const desired=Math.max(lift,wave*.78)*envelope;
  companions.forEach((mesh,i)=>{follow[i]=THREE.MathUtils.damp(follow[i],desired,i===0?12:7,delta);const amount=follow[i]*(i===0?.72:.43)*envelope;mesh.visible=amount>.015;if(mesh.visible)deformPage(mesh.geometry,side,0,amount,cornerV)});
  updateTurnShadow(side,t,frontGeom,lift,cornerV);
  if(done){if(turnMode==='settle'&&!settleCommit)discardTurn(true);else if(state.turn&&pendingIndex===null){pendingIndex=turnDir==='next'?Math.min(currentIndex+2,Math.floor((PAGE_COUNT-1)/2)*2):Math.max(currentIndex-2,0);state.onTurnEnd()}}
 }}
 camera.fov=2*Math.atan((baseView+extraView)/20)*180/Math.PI;camera.updateProjectionMatrix();renderer.render(scene,camera)};frame=requestAnimationFrame(loop);
 return()=>{disposed=true;openingMixer?.stopAllAction();cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keydown',keyboardFocus,true);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',cancel);renderer.domElement.removeEventListener('auxclick',aux);printed.forEach(t=>t.dispose());scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}});renderer.dispose();renderer.domElement.remove()};
 },[]);
 return <div className="book3d-stage" ref={host} role="group" aria-label="三维 WeiClaw 书本">{failed&&<div className="book3d-error">浏览器无法启动 3D 显示，请开启 WebGL 后重试。</div>}</div>
}
