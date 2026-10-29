import * as THREE from 'three';

export type PageSide = 'left' | 'right';
export const PAGE_WIDTH = 2.495;
export const PAGE_HEIGHT = 3.38;
export const PAGE_COLUMNS = 44;
export const PAGE_ROWS = 22;
export const PAGE_TURN_MS = 380;

const bindingArch = (x:number) => {
  const d = Math.abs(x) / .5;
  return .115 * d * Math.exp(1-d);
};
const paperHeight = (u:number, v:number, x:number) =>
  .12 + .34 * (1-Math.exp(-8*u)) - .11*u
  + .012*Math.sin(Math.PI*v)*Math.sin(Math.PI*u) + bindingArch(x);
const distance = (u:number, v:number) =>
  u*PAGE_WIDTH - .035*u**9*Math.abs(2*v-1)**8;

/** A connected paper surface. Its spine stays fixed throughout the turn. */
export function deformPage(geometry:THREE.BufferGeometry, side:PageSide, progress:number, cornerLift=0, cornerV:0|1=0) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const phase = Math.min(1,t/.84);
  const sweep = phase*phase*(3-2*phase);
  const flex = Math.sin(Math.PI*phase);
  const sign = side === 'right' ? 1 : -1;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  // The final, short lift gives the outer corner a quiet landing before it settles.
  const settle = t > .84 ? .065 * Math.sin(Math.PI*(t-.84)/.16) : 0;
  for (let j=0; j<=PAGE_ROWS; j++) {
    const v = j/PAGE_ROWS;
    let x=0, rise=0, previousDistance=0;
    for (let i=0; i<=PAGE_COLUMNS; i++) {
      const u=i/PAGE_COLUMNS;
      const d=distance(u,v);
      if(i>0){
        const middle=(i-.5)/PAGE_COLUMNS;
        // The free edge leads at takeoff and follows at landing; the lower
        // corner lifts a little earlier than the rest of the outer edge.
        const near=cornerV===0?1-v:v;
        const curl = flex * (.96-1.46*sweep) * middle**1.3 * (.30+.70*near);
        const bow = flex * (.62*Math.sin(Math.PI*middle)+.25*(near-.5)*middle);
        const angle = THREE.MathUtils.clamp(Math.PI*sweep + curl + bow, 0, Math.PI);
        const step=d-previousDistance;
        x+=Math.cos(angle)*step;
        rise+=Math.sin(angle)*step;
      }
      const corner=settle*u**2*(.68+.32*(1-v));
      const cornerWeight=u**3 * (cornerV===0 ? (1-v)**2 : v**2);
      const tipLift=.42 * cornerLift * cornerWeight;
      const y=(v-.5)*PAGE_HEIGHT;
      positions.setXYZ(j*(PAGE_COLUMNS+1)+i,sign*(x-.075*cornerLift*cornerWeight),y,paperHeight(u,v,x)+.8*rise+corner+tipLift+.004*u);
      previousDistance=d;
    }
  }
  positions.needsUpdate=true;
  geometry.computeVertexNormals();
}

export function createPage(side:PageSide, flipUV=false) {
  const positions:number[]=[], uvs:number[]=[], indices:number[]=[];
  for(let j=0;j<=PAGE_ROWS;j++){
    const v=j/PAGE_ROWS;
    for(let i=0;i<=PAGE_COLUMNS;i++){
      const u=i/PAGE_COLUMNS, x=(side==='right'?1:-1)*distance(u,v);
      positions.push(x,(v-.5)*PAGE_HEIGHT,paperHeight(u,v,x));
      const tx=side==='right'?u:1-u;
      uvs.push(flipUV?1-tx:tx,1-v);
    }
  }
  for(let j=0;j<PAGE_ROWS;j++)for(let i=0;i<PAGE_COLUMNS;i++){
    const a=j*(PAGE_COLUMNS+1)+i,b=a+1,c=a+PAGE_COLUMNS+1,d=c+1;
    if(side==='right')indices.push(a,b,d,a,d,c);else indices.push(a,c,d,a,d,b);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** Map a horizontal drag to a corresponding position along the page turn. */
export function progressForDrag(delta:number, distance:number) {
  const fraction=THREE.MathUtils.clamp(delta/Math.max(distance,1),0,1);
  const sweep=Math.acos(1-2*fraction)/Math.PI;
  let lo=0,hi=1;
  for(let i=0;i<18;i++){const m=(lo+hi)/2;if(m*m*(3-2*m)<sweep)lo=m;else hi=m;}
  return .84*(lo+hi)/2;
}

/** Position of the free corner, used to relate pointer motion to projected motion. */
export function pageCorner(side:PageSide, progress:number, cornerV:0|1) {
  const t=THREE.MathUtils.clamp(progress,0,1),phase=Math.min(1,t/.84);
  const sweep=phase*phase*(3-2*phase),flex=Math.sin(Math.PI*phase),v=cornerV;
  let x=0,rise=0,previousDistance=0;
  for(let i=1;i<=PAGE_COLUMNS;i++){
    const u=i/PAGE_COLUMNS,d=distance(u,v),middle=(i-.5)/PAGE_COLUMNS;
    const near=cornerV===0?1-v:v;
    const curl=flex*(.96-1.46*sweep)*middle**1.3*(.30+.70*near);
    const bow=flex*(.62*Math.sin(Math.PI*middle)+.25*(near-.5)*middle);
    const angle=THREE.MathUtils.clamp(Math.PI*sweep+curl+bow,0,Math.PI);
    const step=d-previousDistance;x+=Math.cos(angle)*step;rise+=Math.sin(angle)*step;previousDistance=d;
  }
  const settle=t>.84?.065*Math.sin(Math.PI*(t-.84)/.16)*(.68+.32*(1-v)):0;
  return new THREE.Vector3((side==='right'?1:-1)*x,(v-.5)*PAGE_HEIGHT,paperHeight(1,v,x)+.8*rise+settle+.004);
}
