/** Optional Word-style smart alignment, in measured paper millimetres.
 * No printer, customer data, bank defaults or persistent migration is involved.
 */
export type SnapPart={id:string;page?:number;x:number;y:number;width:number;height:number};
export type SnapGuide={axis:"x"|"y";position:number;targetId:string};
export function smartSnap(
  moving:readonly SnapPart[],other:readonly SnapPart[],dx:number,dy:number,
  toleranceMm=1.5,
):{dx:number;dy:number;guides:SnapGuide[]}{
  if(!moving.length||![dx,dy,toleranceMm].every(Number.isFinite)||toleranceMm<0||toleranceMm>10)
    return {dx,dy,guides:[]};
  const ids=new Set(moving.map(p=>p.id));
  const samePage=other.filter(p=>!ids.has(p.id)&&(p.page??1)===(moving[0].page??1)&&
    [p.x,p.y,p.width,p.height].every(Number.isFinite)&&p.width>0&&p.height>0);
  const anchors=(p:SnapPart,axis:"x"|"y")=>axis==="x"?
    [p.x,p.x+p.width/2,p.x+p.width]:[p.y,p.y+p.height/2,p.y+p.height];
  const resolve=(axis:"x"|"y",delta:number)=>{
    let best:{offset:number;guide:SnapGuide}|null=null;
    for(const m of moving){
      if(![m.x,m.y,m.width,m.height].every(Number.isFinite))continue;
      for(const o of samePage){
        for(const from of anchors(m,axis))for(const to of anchors(o,axis)){
          const offset=to-(from+delta);
          if(Math.abs(offset)<=toleranceMm&&(!best||Math.abs(offset)<Math.abs(best.offset))){
            best={offset,guide:{axis,position:to,targetId:o.id}};
          }
        }
      }
    }
    return best;
  };
  const x=resolve("x",dx),y=resolve("y",dy);
  return {dx:dx+(x?.offset??0),dy:dy+(y?.offset??0),
    guides:[...(x?[x.guide]:[]),...(y?[y.guide]:[])]};
}
