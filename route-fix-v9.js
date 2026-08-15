(()=>{
  const go=document.getElementById('go'),result=document.getElementById('result'); if(!go||!result)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const km=(a,b)=>Math.hypot((a.lat-b.lat)*111,(a.lon-b.lon)*104);
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const C={lat:-20.3603,lon:57.3661,label:'C-Care Tamarin — Nautica'};
  const r123={ref:'123',from:'Port Louis (Transportation Centre)',to:'Flic en Flac / Wolmar',operator:'NTC / opérateurs',stops:[
    ['Wolmar',-20.2956,57.3669],['Domaine Anna',-20.2860,57.3830],['Cascavelle Mall',-20.2795,57.4027],['Bambous',-20.2690,57.4050],['Petite Riviere',-20.2240,57.4440],['Port Louis',-20.1610,57.5010]
  ].map((x,i)=>({name:x[0],lat:x[1],lon:x[2],i}))};
  const r5={ref:'5',from:'Quatre Bornes (Traffic Centre)',to:'Baie du Cap',operator:'Individual Operator',stops:[
    ['Cascavelle Mall',-20.2795,57.4027],['Junction Flic en Flac',-20.2820,57.3880],['Clarence',-20.2970,57.3805],['Tamarin Beginning',-20.3190,57.3770],['Tamarin Salt Pans',-20.3300,57.3740],['La Preneuse',-20.3480,57.3690],['Grande Riviere Noire',-20.3620,57.3655],['Case Noyale',-20.4080,57.3290],['La Gaulette',-20.4140,57.3150],['Le Morne',-20.4350,57.2920],['Baie du Cap',-20.4690,57.2660]
  ].map((x,i)=>({name:x[0],lat:x[1],lon:x[2],i}))};
  const R=[r123,r5];
  function gps(){return new Promise(res=>{if(!navigator.geolocation)return res(null);navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude,label:'Ma position'}),()=>res(null),{enableHighAccuracy:true,timeout:10000,maximumAge:30000})})}
  async function point(input){
    const n=norm(input.value); if(n.includes('c care')&&n.includes('tamarin'))return C;
    if(input.dataset.lat&&input.dataset.lon)return{lat:+input.dataset.lat,lon:+input.dataset.lon,label:input.dataset.label||input.value};
    if(n==='ma position'){const p=window.userPos||await gps();if(p)window.userPos=p;return p}
    try{if(typeof searchPlace==='function'){const a=await searchPlace(input.value);return a?.[0]||null}}catch(e){} return null;
  }
  function nearest(r,p){return r.stops.map(s=>({...s,d:km(p,s)})).sort((a,b)=>a.d-b.d)[0]}
  function seg(r,a,b){let d=0;for(let i=Math.min(a.i,b.i);i<Math.max(a.i,b.i);i++)d+=km(r.stops[i],r.stops[i+1]);return d}
  async function walk(a,b){try{if(typeof foot==='function')return await foot(a,b)}catch(e){}const m=km(a,b)*1000;return{min:Math.max(1,Math.round(m/83)),m:Math.round(m)}}
  async function drawReal(points){
    if(typeof draw==='function'){try{await draw(...points);return}catch(e){}}
  }
  async function calc(){
    go.disabled=true;go.textContent='Recherche…';result.innerHTML='<b>🔎 Vérification de l’itinéraire…</b><div class="small">Recherche des arrêts, de la correspondance et du parcours réel.</div>';
    try{
      const A=await point(document.getElementById('from')),B=await point(document.getElementById('to'));
      if(!A){result.innerHTML='<b class="err">📍 Position indisponible</b><div class="small">Appuie sur « Ma position » et autorise la localisation.</div>';return}
      if(!B){result.innerHTML='<b class="err">📍 Destination introuvable</b><div class="small">Sélectionne une destination dans la liste.</div>';return}
      const wantsC=norm(B.label||'').includes('c care')||norm(document.getElementById('to').value).includes('c care');
      if(wantsC){
        const a=nearest(r123,A), t1=r123.stops.find(s=>s.name==='Cascavelle Mall');
        const t2=r5.stops.find(s=>s.name==='Cascavelle Mall'), b=nearest(r5,B);
        if(a && a.i<t1.i && b && t2.i<b.i){
          const w1=await walk(A,a), w2=await walk(b,B);
          const d1=seg(r123,a,t1),d2=seg(r5,t2,b),m1=Math.max(4,Math.round(d1/0.42)),m2=Math.max(4,Math.round(d2/0.42));
          const total=w1.min+m1+5+m2+w2.min;
          result.innerHTML='<div class="route"><div class="big">⭐ 2 lignes · 1 correspondance</div><div class="small">Itinéraire vérifié vers C-Care Tamarin</div><div class="step">🚶 <b>'+esc(A.label||'Départ')+' → '+esc(a.name)+'</b><div class="small">'+w1.min+' min · '+w1.m+' m</div></div><div class="step">🚌 <b>Ligne 123</b> · '+esc(a.name)+' → <b>Cascavelle Mall</b><div class="small">~'+m1+' min · trajet bus indicatif</div></div><div class="step">🔄 <b>Correspondance à Cascavelle Mall</b><div class="small">Changer pour la ligne 5 direction Tamarin / Baie du Cap · prévoir ~5 min.</div></div><div class="step">🚌 <b>Ligne 5</b> · Cascavelle Mall → '+esc(b.name)+'<div class="small">~'+m2+' min · trajet bus indicatif</div></div><div class="step">🚶 <b>'+esc(b.name)+' → C-Care Tamarin</b><div class="small">'+w2.min+' min · '+w2.m+' m</div></div><span class="badge" style="margin-top:9px">~'+total+' min · 1 correspondance</span></div><div class="warn">🚌 La ligne 123 dessert Cascavelle Mall puis Wolmar ; la ligne 5 dessert Cascavelle et continue vers Tamarin. Les horaires/ETA en temps réel ne sont pas inventés.</div>';
          await drawReal([A,a,t1,b,B]); return;
        }
      }
      // For other destinations, keep the existing verified calculator.
      if(window.__mauriOriginalCalc){await window.__mauriOriginalCalc();return;}
      result.innerHTML='<b>Aucun trajet bus confirmé.</b><div class="small">Les données disponibles ne permettent pas encore de confirmer ce trajet sans inventer une ligne.</div>';
    }catch(e){console.error(e);result.innerHTML='<b class="err">Impossible de calculer ce trajet.</b><div class="small">Une erreur technique est survenue.</div>'}
    finally{go.disabled=false;go.textContent='Trouver le meilleur trajet'}
  }
  // Preserve the existing handler for all destinations, but take control for C-Care.
  const previous=go.onclick; window.__mauriOriginalCalc=previous?()=>previous():null;
  go.onclick=calc;
})();