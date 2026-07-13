import "server-only"

import { IAB_SIZES } from "@/lib/creative/adSizes"

export type InjectCreative = {
  width_px: number
  height_px: number
  mime_type: string
}

/** Minified JS executed in ScreenshotOne's browser before capture. */
export function buildInjectScript(creative: InjectCreative, frameUrl: string): string {
  const w = Math.round(creative.width_px)
  const h = Math.round(creative.height_px)
  const isVideo = creative.mime_type.startsWith("video/")
  const iabJson = JSON.stringify(IAB_SIZES)
  const frame = JSON.stringify(frameUrl)

  const script = `(function(){
try{
var cw=${w},ch=${h},frameUrl=${frame},isVideo=${isVideo ? "true" : "false"};
var iab=${iabJson};
function tol(a,b,t){return Math.abs(a-b)<=t;}
function matchSize(rw,rh){
  if(tol(rw,cw,4)&&tol(rh,ch,4))return 100;
  for(var i=0;i<iab.length;i++){
    if(tol(rw,iab[i].width,4)&&tol(rh,iab[i].height,4))return 50;
  }
  return 0;
}
function inner(){
  if(isVideo)return '<video src="'+frameUrl+'" muted autoplay playsinline style="display:block;width:'+cw+'px;height:'+ch+'px;object-fit:contain"></video>';
  return '<img src="'+frameUrl+'" alt="" style="display:block;width:'+cw+'px;height:'+ch+'px;object-fit:contain">';
}
function scoreEl(el){
  var st=window.getComputedStyle(el);
  if(st.display==='none'||st.visibility==='hidden'||st.opacity==='0')return null;
  var r=el.getBoundingClientRect();
  if(r.width<40||r.height<20||r.width>2000||r.height>2000)return null;
  var rw=Math.round(r.width),rh=Math.round(r.height);
  var s=matchSize(rw,rh);
  if(!s)return null;
  if(tol(rw,cw,4)&&tol(rh,ch,4))s+=40;
  return {el:el,score:s,top:r.top,rw:rw,rh:rh};
}
var sel='div[id^="div-gpt-ad"],[data-google-query-id],ins.adsbygoogle,[data-ad-slot],iframe';
var nodes=Array.prototype.slice.call(document.querySelectorAll(sel));
var extras=Array.prototype.slice.call(document.querySelectorAll('div,iframe'));
for(var j=0;j<extras.length;j++){
  if(nodes.indexOf(extras[j])<0)nodes.push(extras[j]);
}
var cands=[];
for(var k=0;k<nodes.length;k++){
  var sc=scoreEl(nodes[k]);
  if(sc)cands.push(sc);
}
cands.sort(function(a,b){
  if(b.score!==a.score)return b.score-a.score;
  return a.top-b.top;
});
function apply(el,rw,rh){
  var tag=(el.tagName||'').toLowerCase();
  var html=inner();
  if(tag==='iframe'){
    var rep=document.createElement('div');
    rep.style.cssText='width:'+rw+'px;height:'+rh+'px;overflow:hidden;display:block;margin:0 auto;';
    rep.innerHTML=html;
    if(el.parentNode)el.parentNode.replaceChild(rep,el);
    return;
  }
  el.style.width=rw+'px';
  el.style.height=rh+'px';
  el.style.overflow='hidden';
  el.style.boxSizing='border-box';
  el.innerHTML=html;
}
for(var m=0;m<cands.length;m++){
  if(cands[m].score>=90){apply(cands[m].el,cands[m].rw,cands[m].rh);}
}
var overlays=document.querySelectorAll('[class*="paywall"],[id*="onetrust"],[class*="cookie"],[id*="cookie"]');
for(var o=0;o<overlays.length;o++){
  try{overlays[o].remove();}catch(e){}
}
}catch(e){}
})();`

  return script.replace(/\s+/g, " ").trim()
}

export function supportsLiveInjection(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/")
}
