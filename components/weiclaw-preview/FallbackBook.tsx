import {useEffect,useRef,useState} from 'react';
import BookPreview from './BookPreview';
import {ProjectIntro,BookToolbar} from './BookInterface';
import {weiclawBookPages, type WeiClawBookPage} from '../../data/weiclaw-3d-pages';
import './book-redesign.css';

type Turn = 'next'|'previous';
function Page({page, side, onOpen}:{page:WeiClawBookPage|null,side:'left'|'right',onOpen:(p:WeiClawBookPage)=>void}) {
 if(!page) return <div className={`new-page new-page--${side} new-page--blank`} aria-label="空白页"><div className="blank-mark">WEICLAW<br/><span>PROJECT NOTES</span></div></div>;
 const crop=page.previewCrop;
 return <article className={`new-page new-page--${side}`} aria-label={`${page.number} ${page.title.replace('\n',' ')}`}>
  <div className="new-page__inner"><div className="new-page__top"><span>{page.type}</span><span>{page.number} / {String(weiclawBookPages.length).padStart(2,'0')}</span></div><div className="new-page__rule"/><h3>{page.title.replace('\n',' ')}</h3><p className="new-page__desc">{page.description}</p>
  <button className={`new-page__screen${crop?' new-page__screen--cropped':''}`} style={crop?{aspectRatio:`${crop.width*1586}/${crop.height*992}`}:undefined} onClick={()=>onOpen(page)} aria-label={`放大查看${page.title.replace('\n',' ')}截图`}><img src={page.image} style={crop?{width:`${100/crop.width}%`,left:`${-100*crop.x/crop.width}%`,top:`${-100*crop.y/crop.height}%`}:undefined} alt={`${page.title.replace('\n',' ')}的项目界面`} draggable={false}/></button><span className="new-page__zoom-hint">点击图片放大查看 ↗</span><div className="new-page__editorial"><span>{Number(page.number)%2 ? "PROJECT INSIGHT" : "DESIGN NOTE"}</span><h4>{page.editorial.heading}</h4><p>{page.editorial.body}</p><div className="new-page__points">{page.editorial.points.map(point=><div key={point.label}><b>{point.label}</b><span>{point.text}</span></div>)}</div><small>{page.editorial.detail}</small></div>
  <div className="new-page__footer"><span>WEICLAW / PRODUCT DESIGN</span><span>{page.number}</span></div></div>
 </article>;
}
export default function WeiClawBook(){
 const [index,setIndex]=useState(0); const [turn,setTurn]=useState<Turn|null>(null); const [preview,setPreview]=useState<WeiClawBookPage|null>(null); const [angle,setAngle]=useState({x:3,y:-4}); const timeout=useRef<number|null>(null); const drag=useRef<{x:number,y:number,button:number}|null>(null);
 const left=weiclawBookPages[index]||null; const right=weiclawBookPages[index+1]||null;
 const change=(direction:Turn)=>{if(turn || (direction==='previous'&&index===0)||(direction==='next'&&index+2>=weiclawBookPages.length))return; setTurn(direction); timeout.current=window.setTimeout(()=>{setIndex(i=>direction==='next'?Math.min(i+2,Math.floor((weiclawBookPages.length-1)/2)*2):Math.max(i-2,0));setTurn(null)},240)};
 useEffect(()=>()=>{if(timeout.current!==null)window.clearTimeout(timeout.current)},[]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setPreview(null);if(!preview&&e.key==='ArrowRight')change('next');if(!preview&&e.key==='ArrowLeft')change('previous')};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[index,turn,preview]);
 return <div className="weiclaw-book-scene redesigned-scene">
  <ProjectIntro onExplore={()=>left&&setPreview(left)}/>
  <div className="new-book-area"><div className="new-book-perspective" onPointerDown={e=>{if(e.button===1){e.preventDefault();drag.current={x:e.clientX,y:e.clientY,button:1};e.currentTarget.setPointerCapture(e.pointerId)}else if(e.button===0 && (e.target as HTMLElement).closest('.new-book__edge')){drag.current={x:e.clientX,y:e.clientY,button:0};e.currentTarget.setPointerCapture(e.pointerId)}}} onPointerMove={e=>{if(drag.current?.button===1){let d=drag.current;setAngle(a=>({x:Math.max(-12,Math.min(12,a.x+(e.clientY-d.y)*.09)),y:Math.max(-18,Math.min(18,a.y+(e.clientX-d.x)*.11))}));d.x=e.clientX;d.y=e.clientY}}} onPointerUp={e=>{let d=drag.current;if(d?.button===0){const dx=e.clientX-d.x;if(Math.abs(dx)>30)change(dx<0?'next':'previous')}drag.current=null}} onPointerCancel={()=>{drag.current=null}} onAuxClick={e=>{if(e.button===1)e.preventDefault()}}>
   <div className={`new-book${turn?` is-turning is-turning--${turn}`:''}`} style={{transform:`rotateX(${angle.x}deg) rotateY(${angle.y}deg)`}}>
    <div className="new-book__cover"/><div className="new-book__block"/><div className="new-book__pages"><Page page={left} side="left" onOpen={setPreview}/><Page page={right} side="right" onOpen={setPreview}/></div><div className="new-book__gutter" aria-hidden="true"/>
    {turn&&<div className={`new-book__turn new-book__turn--${turn}`} aria-hidden="true"><div className="new-book__turn-front"/><div className="new-book__turn-back"/></div>}
    <button type="button" className="new-book__edge new-book__edge--left" aria-label="上一页" disabled={index===0||!!turn} onClick={()=>change('previous')}/><button type="button" className="new-book__edge new-book__edge--right" aria-label="下一页" disabled={index+2>=weiclawBookPages.length||!!turn} onClick={()=>change('next')}/>
   </div>
  </div><BookToolbar index={index} busy={!!turn} onTurn={change}/></div>
  {preview&&<BookPreview key={preview.id} page={preview} onClose={()=>setPreview(null)}/>}
 </div>
}
