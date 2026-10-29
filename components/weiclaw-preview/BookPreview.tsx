import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {weiclawBookPages,type WeiClawBookPage} from '../../data/weiclaw-3d-pages';

const warmed=new Map<string,HTMLImageElement>();
export function warmBookImages(){
 for(const page of weiclawBookPages){
  if(warmed.has(page.image))continue;
  const image=new Image();image.decoding='async';image.src=page.image;warmed.set(page.image,image);
  if(image.decode)image.decode().catch(()=>{});
 }
}

export default function BookPreview({page,onClose}:{page:WeiClawBookPage;onClose:()=>void}){
 const [zoom,setZoom]=useState(100),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);
 const closeButton=useRef<HTMLButtonElement>(null),imageRef=useRef<HTMLImageElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const frame=requestAnimationFrame(()=>closeButton.current?.focus({preventScroll:true}));return()=>{cancelAnimationFrame(frame);previous?.focus?.({preventScroll:true})}},[]);
 const show=async(image:HTMLImageElement)=>{try{if(image.decode)await image.decode()}catch{}if(image.isConnected&&image.naturalWidth)setReady(true)};
 useEffect(()=>{if(imageRef.current?.complete&&imageRef.current.naturalWidth)void show(imageRef.current)},[]);
 return createPortal(<div className="book-preview" role="dialog" aria-modal="true" aria-label={`${page.title.replace('\n',' ')}截图`} onClick={onClose} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose();return}if(e.key!=='Tab')return;const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'));if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}>
  <div className="book-preview__panel" onClick={e=>e.stopPropagation()}>
   <div className="book-preview__heading"><div><span>{page.number} / {page.type}</span><h2>{page.title.replace('\n',' ')}</h2><p>{page.description}</p></div><div className="book-preview__actions"><div className="book-preview__zoom" role="group" aria-label="截图缩放"><button type="button" onClick={()=>setZoom(z=>Math.max(100,z-25))} disabled={zoom===100} aria-label="缩小截图">−</button><span aria-live="polite">{zoom}%</span><button type="button" onClick={()=>setZoom(z=>Math.min(200,z+25))} disabled={zoom===200} aria-label="放大截图">＋</button></div><button ref={closeButton} type="button" onClick={onClose} aria-label="关闭截图">×</button></div></div>
   <div className={`book-preview__image${ready?' is-ready':''}`} tabIndex={0} aria-label="截图查看区域，可滚动查看放大的图片" aria-busy={!ready&&!failed}>
    <div className="book-preview__placeholder" aria-live="polite"><span className="book-preview__placeholder-mark">WEICLAW / {page.number}</span><span>{failed?'图片加载失败，请关闭后重试':'正在准备图片…'}</span></div>
    <img ref={imageRef} className="book-preview__full-image" style={{width:`${zoom}%`,minWidth:0}} src={page.image} decoding="async" onLoad={e=>void show(e.currentTarget)} onError={()=>setFailed(true)} alt={`${page.title.replace('\n',' ')}完整项目截图`}/>
   </div><p className="book-preview__hint">可缩放并滚动查看 · ESC 或点击空白处关闭</p>
  </div></div>,document.body);
}
