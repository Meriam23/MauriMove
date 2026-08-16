from pathlib import Path
import subprocess, sys

subprocess.run([sys.executable, 'scripts/prepare_refined_build.py'], check=True)
p = Path('index.html')
s = p.read_text(encoding='utf-8')

s = s.replace('<div id="result" class="card"><b>Prêt 😊</b><div class="small">Choisis une destination pour rechercher les correspondances.</div></div>', '<div id="result" class="card"></div>')
s = s.replace("['carrefour flic en flac','Carrefour City Flic-en-Flac',-20.2749,57.3742]", "['carrefour flic en flac','Carrefour City Flic-en-Flac',-20.27925,57.367673]")
s = s.replace('Suivre ma progression', '')

css = '''<style id="segamap-final-polish-css">
.brand{font-weight:500!important}
.refined-logo-final .name{font-weight:500!important}
@media(max-width:760px){
  .search-layout-final{grid-template-columns:minmax(0,1fr) 76px!important}
  .search-rail-final{gap:7px!important}
  .search-rail-final .go{width:76px!important;background:#06143F!important;color:#fff!important;text-shadow:none!important;box-shadow:0 5px 16px #06143F33!important;font-size:0!important}
  .search-rail-final .go:before{content:'GO'!important;font-size:18px!important;font-weight:800!important;line-height:1!important}
  .search-rail-final .go:after{content:none!important}
  .search-rail-final .btn{width:76px!important;font-weight:750!important}
}
</style>'''
s = s.replace('</body>', css + '</body>')

js = r'''<script id="segamap-final-corrections-js">
(()=>{
  const carrefourLat=-20.27925, carrefourLon=57.367673;
  const ccLat=-20.35775, ccLon=57.36850;
  const laPreneuse={name:'La Preneuse',lat:-20.345,lon:57.366};
  const d=(a,b)=>Math.hypot((a.lat-b.lat)*111,(a.lon-b.lon)*104);
  const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  function patchWestRoute5(){
    if(!Array.isArray(window.routes)||!window.routes.length)return false;
    let changed=false;
    for(const r of window.routes){
      if(String(r.ref)!=='5')continue;
      const stops=r.stops||[];
      if(stops.some(s=>normalize(s.name).includes('la preneuse')))continue;
      const lp={id:'5-canonical-la-preneuse',name:'La Preneuse',lat:laPreneuse.lat,lon:laPreneuse.lon};
      let idx=-1;
      const from=normalize(r.from), to=normalize(r.to);
      const i=stops.findIndex(s=>normalize(s.name).includes('tamarin salt pans'));
      if(i>=0)idx=(from.includes('quatre')||to.includes('baie du cap'))?i+1:i;
      if(idx<0){let best=Infinity;stops.forEach((s,j)=>{const z=d(s,laPreneuse);if(z<best){best=z;idx=j+1}})}
      stops.splice(Math.max(0,Math.min(idx,stops.length)),0,lp);changed=true;
    }
    return changed;
  }
  function patchInputs(){
    const to=document.getElementById('to');if(!to)return;const n=normalize(to.value);
    if(n.includes('carrefour city')||n.includes('carrefour flic')){to.dataset.lat=carrefourLat;to.dataset.lon=carrefourLon;to.dataset.label='Carrefour City Flic-en-Flac'}
    if(n.includes('c care')||n.includes('c-care')||n.includes('c care tamarin')){to.dataset.lat=ccLat;to.dataset.lon=ccLon;to.dataset.label='C-Care Tamarin'}
  }
  function removeProgressButton(){document.querySelectorAll('.route-follow-final,#trackBtn').forEach(e=>e.remove());document.querySelectorAll('.follow').forEach(e=>{if(/suivre ma progression/i.test(e.textContent))e.remove()})}
  function addLongWalkNotice(){const screen=document.querySelector('.route-screen-final.active');if(!screen)return;const text=normalize(screen.textContent);if(!text.includes('carrefour city')||!text.includes('flic en flac school')||screen.querySelector('.long-walk-notice-final'))return;const notice=document.createElement('div');notice.className='long-walk-notice-final';notice.textContent='🚶 Marche importante : l’arrêt officiel le plus proche desservi par les lignes 57/123 est Flic en Flac Government School.';const content=screen.querySelector('.route-sheet-final');if(content)content.insertBefore(notice,content.querySelector('#routeContentFinal'))}
  const style=document.createElement('style');style.textContent='.long-walk-notice-final{margin:0 0 9px;background:#fff7e6;color:#8a4b00;border:1px solid #f5d48a;border-radius:12px;padding:9px 10px;font-size:11px;line-height:1.35}';document.head.appendChild(style);
  const observer=new MutationObserver(()=>{patchInputs();removeProgressButton();addLongWalkNotice()});observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  document.addEventListener('input',patchInputs,true);document.addEventListener('change',patchInputs,true);patchWestRoute5();patchInputs();setInterval(()=>{patchWestRoute5();patchInputs();removeProgressButton();addLongWalkNotice()},700);
})();
</script>'''
s = s.replace('</body>', js + '</body>')
p.write_text(s, encoding='utf-8')
