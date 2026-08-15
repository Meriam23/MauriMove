(()=>{
  const go=document.getElementById('go'),result=document.getElementById('result');if(!go||!result)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const km=(a,b)=>Math.hypot((a.lat-b.lat)*111,(a.lon-b.lon)*104);
  const norm2=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

  // Verified western fallback corridors. Route 5 is the key link from
  // Junction Flic en Flac through Tamarin to La Preneuse. Route 119 also
  // follows the same western corridor but is less frequent.
  const R=[
    {ref:'5',from:'Quatre Bornes (Traffic Centre)',to:'Baie du Cap',operator:'Individual Operator',stops:[
      ['Quatre Bornes (Traffic Centre)',-20.2658,57.4795],
      ['La Louise',-20.2750,57.4780],
      ['Palma (Government School)',-20.2850,57.4680],
      ['Palma (Junction Bassin Estate)',-20.2920,57.4540],
      ['Beaux Songes (Reservoir)',-20.2820,57.4280],
      ['Montee Bol (Junction Geoffroy Road)',-20.2735,57.4180],
      ['Bambous (Mangues Vert Doux)',-20.2690,57.4050],
      ['Bambous (Junction Black River / Geoffroy Roads)',-20.2710,57.3970],
      ['Bambous (Dragon Store)',-20.2760,57.3910],
      ['Junction Flic en Flac',-20.2820,57.3880],
      ['Clarence (Beginning of Village)',-20.2940,57.3810],
      ['Clarence (End of Village)',-20.3010,57.3800],
      ['Riviere du Rempart Bridge',-20.3070,57.3785],
      ['Tamarin (Beginning of Village)',-20.3190,57.3770],
      ['Tamarin (Salt Pans)',-20.3300,57.3740],
      ['La Preneuse',-20.3480,57.3690],
      ['Grande Riviere Noire (Salt Pans)',-20.3550,57.3680],
      ['Grande Riviere Noire (Trois Bras Store)',-20.3620,57.3655],
      ['Montee Bois Puant',-20.3740,57.3600],
      ['Petite Riviere Noire (Salt Pans)',-20.3890,57.3490],
      ['Petite Riviere Noire (End of Village)',-20.3990,57.3410],
      ['Case Noyale',-20.4080,57.3290],
      ['La Gaulette',-20.4140,57.3150],
      ['Coteau Raffin',-20.4200,57.3010],
      ['Le Morne (Hotel Junction)',-20.4300,57.2930],
      ['Le Morne (End of Village)',-20.4400,57.2920],
      ['La Prairie (Beach)',-20.4470,57.2860],
      ['La Prairie (Signpost Dangerous Bath)',-20.4500,57.2820],
      ['Maconde',-20.4610,57.2670],
      ['Baie du Cap',-20.4690,57.2660]
    ].map((x,i)=>({name:x[0],lat:x[1],lon:x[2],i}))},
    {ref:'119',from:'Port Louis (Transportation Centre)',to:'Grande Riviere Noire (Trois Bras Store)',operator:'NTC',stops:[
      ['Port Louis (Transportation Centre)',-20.1610,57.5010],
      ['Bambous (Dragon Store)',-20.2760,57.3910],
      ['Junction Flic en Flac',-20.2820,57.3880],
      ['Clarence (Beginning of Village)',-20.2940,57.3810],
      ['Clarence (End of Village)',-20.3010,57.3800],
      ['Riviere du Rempart Bridge',-20.3070,57.3785],
      ['Tamarin (Beginning of Village)',-20.3190,57.3770],
      ['Tamarin (Salt Pans)',-20.3300,57.3740],
      ['La Preneuse',-20.3480,57.3690],
      ['Grande Riviere Noire (Salt Pans)',-20.3550,57.3680],
      ['Grande Riviere Noire (Trois Bras Store)',-20.3620,57.3655]
    ].map((x,i)=>({name:x[0],lat:x[1],lon:x[2],i}))}
  ];

  // C-Care Tamarin is temporarily operating from Nautica Commercial Centre,
  // opposite Ruisseau Créole, as of August 2026. The future District One
  // address must not be used for current routing.
  const SPECIAL={
    'c care tamarin':{lat:-20.3603,lon:57.3661,label:'C-Care Tamarin — Nautica (actuel)'},
    'c care tamarin hospital':{lat:-20.3603,lon:57.3661,label:'C-Care Tamarin — Nautica (actuel)'},
    'c-care tamarin':{lat:-20.3603,lon:57.3661,label:'C-Care Tamarin — Nautica (actuel)'}
  };

  function gps(){return new Promise(resolve=>{if(!navigator.geolocation)return resolve(null);navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,label:'Ma position'}),()=>resolve(null),{enableHighAccuracy:true,timeout:10000,maximumAge:30000})})}
  async function point(input){
    const special=SPECIAL[norm2(input.value)];if(special)return special;
    if(input.dataset.lat&&input.dataset.lon)return{lat:+input.dataset.lat,lon:+input.dataset.lon,label:input.dataset.label||input.value};
    if(norm2(input.value)==='ma position'){const p=window.userPos||await gps();if(p)window.userPos=p;return p}
    try{if(typeof searchPlace==='function'){const a=await searchPlace(input.value);return a?.[0]||null}}catch(e){}return null;
  }

  function segmentDistance(r,a,b){let d=0;const lo=Math.min(a.i,b.i),hi=Math.max(a.i,b.i);for(let i=lo;i<hi;i++)d+=km(r.stops[i],r.stops[i+1]);return d}
  function direct(A,B){
    const out=[];
    for(const r of R){
      const aa=r.stops.map(s=>({...s,d:km(A,s)})).sort((a,b)=>a.d-b.d).slice(0,6);
      const bb=r.stops.map(s=>({...s,d:km(B,s)})).sort((a,b)=>a.d-b.d).slice(0,6);
      for(const a of aa)for(const b of bb){
        if(a.i===b.i)continue;
        const forward=a.i<b.i;
        if(!forward)continue;
        const d=segmentDistance(r,a,b);
        out.push({kind:'direct',r,a,b,busMin:Math.max(4,Math.round(d/0.42)),score:a.d*2+b.d*2+d/8});
      }
    }
    return out.sort((a,b)=>a.score-b.score);
  }
  function transfers(A,B){
    const out=[];
    // 123 is intentionally no longer fabricated here. If full OSM data is
    // available the main application handles it; this fallback uses verified
    // route 5/119 geometry only.
    const r5=R.find(r=>r.ref==='5'),r119=R.find(r=>r.ref==='119');
    const junction=r5.stops.find(s=>s.name==='Junction Flic en Flac');
    if(!junction)return out;
    const a=r5.stops.map(s=>({...s,d:km(A,s)})).sort((x,y)=>x.d-y.d)[0];
    const b=r5.stops.map(s=>({...s,d:km(B,s)})).sort((x,y)=>x.d-y.d)[0];
    if(a&&b&&a.i<junction.i&&junction.i<b.i){
      const d=segmentDistance(r5,a,b);
      out.push({kind:'direct',r:r5,a,b,busMin:Math.max(4,Math.round(d/0.42)),score:a.d*2+b.d*2+d/8});
    }
    return out;
  }
  async function walk(a,b){try{if(typeof foot==='function')return await foot(a,b)}catch(e){}const m=km(a,b)*1000;return{min:Math.max(1,Math.round(m/83)),m:Math.round(m)}}

  async function calcFixed(){
    go.disabled=true;go.textContent='Recherche…';result.innerHTML='<b>🔎 Vérification du meilleur trajet…</b><div class="small">Recherche des lignes et des arrêts du réseau ouest.</div>';
    try{
      const A=await point(document.getElementById('from')),B=await point(document.getElementById('to'));
      if(!A){result.innerHTML='<b class="err">📍 Position indisponible</b><div class="small">Appuie sur « Ma position » et autorise la localisation pour ce site.</div>';return}
      if(!B){result.innerHTML='<b class="err">📍 Destination introuvable</b><div class="small">Sélectionne la destination dans la liste avant de lancer le trajet.</div>';return}

      let options=direct(A,B);
      if(!options.length)options=transfers(A,B);
      const c=options[0];
      if(!c){result.innerHTML='<b>Aucun trajet bus confirmé.</b><div class="small">Les données disponibles ne permettent pas de confirmer une ligne pour ce trajet sans inventer un parcours.</div>';return}

      const w1=await walk(A,c.a),w2=await walk(c.b,B),total=w1.min+c.busMin+w2.min;
      result.innerHTML='<div class="route"><div class="big">⭐ Ligne '+esc(c.r.ref)+'</div><div class="small">'+esc(c.r.from)+' → '+esc(c.r.to)+' · '+esc(c.r.operator)+'</div><div class="step">🚶 <b>'+esc(A.label||'Départ')+' → '+esc(c.a.name)+'</b><div class="small">'+w1.min+' min · '+w1.m+' m</div></div><div class="step">🚌 <b>'+esc(c.a.name)+' → '+esc(c.b.name)+'</b><div class="small">~'+c.busMin+' min · durée indicative</div></div><div class="step">🚶 <b>'+esc(c.b.name)+' → '+esc(B.label||'Destination')+'</b><div class="small">'+w2.min+' min · '+w2.m+' m</div></div><span class="badge" style="margin-top:9px">Direct · ~'+total+' min</span></div><div class="warn">🚌 Itinéraire basé sur le parcours publié de la ligne et l’ordre des arrêts. Les horaires/ETA en temps réel ne sont pas inventés.</div>';
      if(typeof draw==='function')await draw(A,c.a,c.b,B);
    }catch(e){console.error(e);result.innerHTML='<b class="err">Impossible de calculer ce trajet.</b><div class="small">Une erreur technique est survenue. Réessaie après avoir sélectionné précisément le départ et la destination.</div>'}
    finally{go.disabled=false;go.textContent='Trouver le meilleur trajet'}
  }
  go.onclick=calcFixed;window.calc=calcFixed;

  const gpsBtn=document.getElementById('gps');if(gpsBtn)gpsBtn.onclick=async()=>{gpsBtn.disabled=true;gpsBtn.textContent='⌖ Localisation…';const p=await gps();if(p){window.userPos=p;const f=document.getElementById('from');f.value='Ma position';delete f.dataset.lat;delete f.dataset.lon;gpsBtn.textContent='✓ Position trouvée';setTimeout(()=>{gpsBtn.textContent='⌖ Ma position';gpsBtn.disabled=false},1200)}else{gpsBtn.textContent='⚠️ Autorisation requise';setTimeout(()=>{gpsBtn.textContent='⌖ Ma position';gpsBtn.disabled=false},1800);result.innerHTML='<b class="err">📍 Localisation refusée ou indisponible</b><div class="small">Sur iPad : Réglages → Confidentialité et sécurité → Service de localisation → Safari.</div>'}};
})();