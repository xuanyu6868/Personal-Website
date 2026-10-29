import type {BookView} from './Book3D';
import {weiclawBookPages} from '../../data/weiclaw-3d-pages';
import './book-interface.css';

type Direction='next'|'previous';
export function ProjectIntro({onExplore}:{onExplore:()=>void}){
 return <div className="weiclaw-book__intro project-intro">
  <div className="project-intro__eyebrow"><span className="project-intro__number">03</span><span className="project-intro__line"/><span>SELECTED WORK</span></div>
  <div className="project-intro__identity"><p className="project-intro__kicker">PRODUCT DESIGN <span>/</span> CASE STUDY</p><h2>WeiClaw<span className="project-intro__period" aria-hidden="true">.</span></h2><p className="weiclaw-book__subtitle">企业微信 AI 托管系统</p></div>
  <div className="project-intro__body"><span className="project-intro__divider"/><p className="weiclaw-book__summary">一个基于企业微信的<br/>智能客户服务与管理系统</p><div className="project-intro__tags"><span>企业微信</span><span>AI 托管</span><span>客户服务</span></div></div>
  <button className="project-intro__explore" type="button" onClick={onExplore}><span>查看项目画面</span><i aria-hidden="true">↗</i></button>
 </div>;
}

type ToolbarProps={index:number;busy:boolean;onTurn:(d:Direction)=>void;view?:BookView;onView?:(v:BookView)=>void;onReplay?:()=>void;opening?:boolean};
export function BookToolbar({index,busy,onTurn,view,onView,onReplay,opening}:ToolbarProps){
 const total=weiclawBookPages.length,progress=Math.floor(index/2),spreadCount=Math.ceil(total/2);
 return <div className="book-toolbar">
  <div className="book-toolbar__main"><div className="book-toolbar__pager">
   <button type="button" aria-label="上一页" disabled={busy||index===0} onClick={()=>onTurn('previous')}>←</button>
   <div className="book-toolbar__count"><small>PAGE</small><span><strong>{String(index+1).padStart(2,'0')}</strong><em>—</em>{String(Math.min(index+2,total)).padStart(2,'0')} <i>/</i> {String(total).padStart(2,'0')}</span></div>
   <button type="button" aria-label="下一页" disabled={busy||index+2>=total} onClick={()=>onTurn('next')}>→</button>
   <div className="book-toolbar__progress" aria-hidden="true">{Array.from({length:spreadCount},(_,i)=><span className={i===progress?'is-current':''} key={i}/>)}</div>
  </div><div className="book-toolbar__tools">{onView&&<div className="book-toolbar__view" role="group" aria-label="书本视角"><button type="button" aria-pressed={view==='read'} onClick={()=>onView('read')}>阅读视角</button><button type="button" aria-pressed={view==='perspective'} onClick={()=>onView('perspective')}>立体视角</button></div>}{onReplay&&<button className="book-toolbar__replay" type="button" disabled={busy} onClick={onReplay}><span aria-hidden="true">↻</span> 重新打开</button>}</div></div>
  <div className="book-toolbar__bottom"><span className="book-toolbar__hint" aria-live="polite">{opening?'书本正在打开…':<>拖动页角翻页 <i/> 点击图片放大<span className="book-toolbar__mouse"><i/> 按住滚轮旋转</span></>}</span><span className="book-toolbar__edition">WEICLAW / PRODUCT JOURNAL</span></div>
 </div>;
}
