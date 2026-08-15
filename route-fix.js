(()=>{
  const go=document.getElementById('go'),result=document.getElementById('result');
  if(!go||!result)return;
  const esc2=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm2=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const dist2=(a,b)=>Math.hypot((a.lat-b.lat)*111,(a.lon-b.lon)*104);
  async function gps(){
    if(!navigator.geolocation)throw Error('gps_unavailable');
    const once=opts=>new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,opts));
    try{const p=await once({enableHighAccuracy:true,timeout:12000,maximumAge:30000});return{lat:p.coords.latitude,lon:p.coords.longitude,label:'Ma position'}}
    catch(e){const p=await once({enableHighAccuracy:false,timeout:12000,maximumAge:300000});return{lat:p.coords.latitude,lon:p.coords.longitude,label:'Ma position'}}
  }
  async function point(input){
    if(input.dataset.lat&&input.dataset.lon)return{lat:+input.dataset.lat,lon:+input.dataset.lon,label:input.dataset.label||input.value};
    if(norm2(input.value)==='ma position')return gps();
    if(typeof searchPlace==='function'){const a=await searchPlace(input.value);if(a?.[0])return a[0]}
    throw Error('place_not_found');
  }
  function near2(p,n=18){return (stops||[]).map(s=>({...s,d:dist2(p,s)})).sort((a,b)=>a.d-b.d).slice(0,n)}
  function direct2(A,B){const out=[];for(const a of near2(A))for(const b of near2(B))if(a.route===b.route){const r=routes[a.route],i=r.stops.findIndex(s=>s.id===a.id),j=r.stops.findIndex(s=>s.id===b.id);if(i>=0&&j>i)out.push({r,a,b,i,j})}return out.sort((x,y)=>x.a.d+x.b.d-y.a.d-y.b.d).slice(0,5)}
  async function calc2(){
    go.disabled=true;go.textContent='Recherche…';result.innerHTML='<b>🔎 Recherche du trajet…</b><div class="small">Vérification de la position, de la destination et des arrêts.</div>';
    try{
      const A=await point(document.getElementById('from')),B=await point(document.getElementById('to'));
      if(!A||!B)throw Error('location');
      if(!routes.length&&typeof loadOSM==='function')await loadOSM();
      const opts=direct2(A,B);
      if(!opts.length){result.innerHTML='<b>Aucun trajet bus confirmé.</b><div class="small">Le lieu est bien trouvé, mais les parcours cartographiques disponibles ne permettent pas encore de confirmer une ligne pour ce trajet.</div><div class="warn">267 lignes NLTA sont au catalogue, mais seulement 6 parcours cartographiques disposent actuellement des arrêts nécessaires au calcul.</div>';return}
      const x=opts[0];
      const w1=typeof foot==='function'?await foot(A,x.a):{min:Math.max(1,Math.round(x.a.d*60/5)),m:Math.round(x.a.d*1000)};
      const w2=typeof foot==='function'?await foot(x.b,B):{min:Math.max(1,Math.round(x.b.d*60/5)),m:Math.round(x.b.d*1000)};
      if(typeof draw==='function')await draw([[A.lat,A.lon],[x.a.lat,x.a.lon],[x.b.lat,x.b.lon],[B.lat,B.lon]]);
      const ref=String(x.r.ref||'').toUpperCase();
      result.innerHTML='<div class="route"><div class="big">⭐ Ligne '+esc2(ref)+'</div><div class="small">'+esc2(x.r.from||'')+(x.r.to?' → '+esc2(x.r.to):'')+(x.r.operator?' · '+esc2(x.r.operator):'')+'</div><div class="step">🚶 <b>'+esc2(x.a.name||'Arrêt de bus')+'</b><div class="small">'+w1.min+' min · '+w1.m+' m</div></div><div class="step">🚌 <b>'+esc2(x.a.name||'Arrêt de bus')+' → '+esc2(x.b.name||'Arrêt de bus')+'</b><div class="small">Ordre des arrêts vérifié.</div></div><div class="step">🚶 <b>'+esc2(B.label||'Destination')+'</b><div class="small">'+w2.min+' min · '+w2.m+' m</div></div></div>';
    }catch(e){
      const name=e?.message;
      if(name==='place_not_found')result.innerHTML='<b>Destination introuvable.</b><div class="small">Choisis une suggestion dans la liste avant de lancer le trajet.</div>';
      else if(name==='gps_unavailable'||name==='location')result.innerHTML='<b>📍 Position indisponible.</b><div class="small">Safari ne nous a pas encore donné ta position. Appuie sur <b>Ma position</b>, autorise la localisation pour MauriMove, puis relance le trajet.</div>';
      else result.innerHTML='<b>Le calcul n’a pas pu aboutir.</b><div class="small">La recherche de lieux fonctionne, mais le calculateur a rencontré une erreur technique. Réessaie dans quelques secondes.</div>';
    }finally{go.disabled=false;go.textContent='Trouver le meilleur trajet'}
  }
  go.onclick=calc2;
})();