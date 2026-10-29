"use client";
import {useEffect,useRef,useState} from 'react';
import BookPreview,{warmBookImages} from './BookPreview';
import {weiclawBookPages,type WeiClawBookPage} from '../../data/weiclaw-3d-pages';
import Book3D,{type BookView} from './Book3D';
import FallbackBook from './FallbackBook';
import {ProjectIntro,BookToolbar} from './BookInterface';
import './book-redesign.css';
function WeiClawBookContent(){
 const [view,setView]=useState<BookView>('read');const [viewRevision,setViewRevision]=useState(0);const [unavailable,setUnavailable]=useState(false);const [index,setIndex]=useState(0);const [turn,setTurn]=useState<'next'|'previous'|null>(null);const [opening,setOpening]=useState(true);const [openRevision,setOpenRevision]=useState(0);const [preview,setPreview]=useState<WeiClawBookPage|null>(null);const bookArea=useRef<HTMLDivElement>(null);
 const change=(direction:'next'|'previous')=>{if(opening||turn||(direction==='previous'&&index===0)||(direction==='next'&&index+2>=weiclawBookPages.length))return;setTurn(direction)};
 const finish=()=>{if(!turn)return;setIndex(i=>turn==='next'?Math.min(i+2,Math.floor((weiclawBookPages.length-1)/2)*2):Math.max(i-2,0));setTurn(null)};
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(preview){if(e.key==='Escape'){e.preventDefault();setPreview(null)}return}if(!bookArea.current?.contains(document.activeElement)||e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();change(e.key==='ArrowRight'?'next':'previous')}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[index,turn,preview,opening]);
 useEffect(()=>{warmBookImages()},[]);
 if(unavailable)return <><div className="book3d-fallback-notice" role="status">当前浏览器无法启动 3D，暂时显示备用页面。请在支持 WebGL 的浏览器中打开。</div><FallbackBook/></>;
 return <div className="weiclaw-book-scene redesigned-scene"><ProjectIntro onExplore={()=>setPreview(weiclawBookPages[index])}/>
 <div ref={bookArea} className="new-book-area book3d-area"><Book3D view={view} viewRevision={viewRevision} onUnavailable={()=>setUnavailable(true)} onOpeningChange={setOpening} openRevision={openRevision} index={index} turn={turn} onTurn={change} onTurnEnd={finish} onOpen={n=>setPreview(weiclawBookPages[n])}/><BookToolbar index={index} busy={opening||!!turn} onTurn={change} view={view} onView={v=>{setView(v);setViewRevision(n=>n+1)}} onReplay={()=>{setIndex(0);setOpening(true);setOpenRevision(n=>n+1)}} opening={opening}/></div>
 {preview&&<BookPreview key={preview.id} page={preview} onClose={()=>setPreview(null)}/>}</div>
}

export default function WeiClawBook(){
 const host=useRef<HTMLDivElement>(null);const [visible,setVisible]=useState(false);
 useEffect(()=>{const el=host.current;if(!el)return;if(!('IntersectionObserver' in window)){setVisible(true);return}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect()}},{threshold:0.08});observer.observe(el);return()=>observer.disconnect()},[]);
 return <div ref={host} style={{width:'100%',minHeight:visible?undefined:'60vh'}}>{visible&&<WeiClawBookContent/>}</div>;
}
