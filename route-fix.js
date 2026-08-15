(()=>{
  const go=document.getElementById('go'),result=document.getElementById('result');if(!go||!result)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const km=(a,b)=>Math.hypot((a.lat-b.lat)*111,(a.lon-b.lon)*104);
  const norm2=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

  // Official western corridors used as a fallback while full stop geometry is being built.
  // 123: Port Louis Immigration -> Wolmar, including Flic en Flac Junction and Wolmar.
  // 69: Port Louis Victoria -> Cascavelle, including Flic en Flac Junction and Cascavelle.
  const R=[
    {ref:'123',from:'Port Louis Immigration',to:'Wolmar',operator:'NTC',stops:[
      ['Bambous Gamma',-20.2400,57.4100],['Bambous Junction Capricorn',-20.2480,57.4050],['Dragon Store',-20.2590,57.3970],['Flic en Flac Junction',-20.2820,57.3880],['Domaine Anna',-20.2860,57.3830],['Flic en Flac School',-20.2890,57.3780],['Flic en Flac Beach',-20.2920,57.3730],['Wolmar',-20.2956,57.3669]
    ].map((x,i)=>({name:x[0],lat:x[1],lon:x[2],i}))},
    {ref:'69',from:'Port Louis Victoria',to:'Cascavelle',operator:'Individual Operator',stops:[
      ['Beau Songes',-20.2660,57.4210],['Geoffroy',-20.2700,57.4130],['Flic en Flac Junction',-20.2820,57.3880],['Clarence',-20.2760,57.3950],['Cascavelle',-20.2795,57.4027]
    ].map((x,i)=>({name:x[0],lat:x[1],lon:x[2],i}))}
  ];

  function gps(){return new Promise(resolve=>{if(!navigator.geolocation)return resolve(null);navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,label:'Ma position'}),()=>resolve(null),{enableHighAccuracy:true,timeout:10000,maximumAge:30000})})}
  async function point(input){
    if(input.dataset.lat&&input.dataset.lon)return{lat:+input.dataset.lat,lon:+input.dataset.lon,label:input.dataset.label||input.value};
    if(norm2(input.value)==='ma position'){const p=window.userPos||await gps();if(p)window.userPos=p;return p}
    try{if(typeof searchPlace==='function'){const a=await searchPlace(input.value);return a?.[0]||null}}catch(e){}return null;
  }
  function candidates(A,B){
    const out=[];
    // Direct segments on one line.
    for(const r of R){
      const aa=r.stops.map(s=>({...s,d:km(A,s)})).sort((a,b)=>a.d-b.d).slice(0,4);
      const bb=r.stops.map(s=>({...s,d:km(B,s)})).sort((a,b)=>a.d-b.d).slice(0,4);
      for(const a of aa)for(const b of bb)if(a.i!==b.i){
        let d=0;const lo=Math.min(a.i,b.i),hi=Math.max(a.i,b.i);for(let i=lo;i<hi;i++)d+=km(r.stops[i],r.stops[i+1]);
        out.push({kind:'direct',r,a,b,busMin:Math.max(3,Math.round(d/0.42)),score:a.d+b.d+d/10});
      }
    }
    // One-transfer journey: 123 at Flic en Flac Junction -> 69 to Cascavelle.
    const t={name:'Flic en Flac Junction',lat:-20.2820,lon:57.3880};
    const r1=R.find(x=>x.ref==='123'),r2=R.find(x=>x.ref==='69');
    const a=r1.stops.map(s=>({...s,d:km(A,s)})).sort((x,y)=>x.d-y.d)[0];
    const b=r2.stops.map(s=>({...s,d:km(B,s)})).sort((x,y)=>x.d-y.d)[0];
    if(a&&b){
      const i1=r1.stops.findIndex(s=>s.name===a.name),it1=r1.stops.findIndex(s=>s.name===t.name),it2=r2.stops.findIndex(s=>s.name===t.name),i2=r2.stops.findIndex(s=>s.name===b.name);
      if(i1>=0&&it1>=0&&it2>=0&&i2>=0&&i1!==it1&&it2!==i2){
        let d1=0;for(let i=Math.min(i1,it1);i<Math.max(i1,it1);i++)d1+=km(r1.stops[i],r1.stops[i+1]);
        let d2=0;for(let i=Math.min(it2,i2);i<Math.max(it2,i2);i++)d2+=km(r2.stops[i],r2.stops[i+1]);
        out.push({kind:'transfer',r1,r2,a,b,t,bus1:Math.max(3,Math.round(d1/0.42)),bus2:Math.max(3,Math.round(d2/0.42)),score:a.d+b.d+(d1+d2)/10+5});
      }
    }
    return out.sort((a,b)=>a.score-b.score);
  }
  async function walk(a,b){try{if(typeof foot==='function')return await foot(a,b)}catch(e){}const m=km(a,b)*1000;return{min:Math.max(1,Math.round(m/83)),m:Math.round(m)}}

  async function calcFixed(){
    go.disabled=true;go.textContent='Recherche…';result.innerHTML='<b>🔎 Recherche du meilleur trajet…</b><div class="small">Recherche des lignes et des correspondances.</div>';
    try{
      const A=await point(document.getElementById('from')),B=await point(document.getElementById('to'));
      if(!A){result.innerHTML='<b class="err">📍 Position indisponible</b><div class="small">Safari ne nous a pas transmis ta position. Appuie sur « Ma position » et autorise la localisation pour ce site.</div>';return}
      if(!B){result.innerHTML='<b class="err">📍 Destination introuvable</b><div class="small">Sélectionne la destination dans la liste avant de lancer le trajet.</div>';return}
      const c=candidates(A,B)[0];
      if(!c){result.innerHTML='<b>Aucun trajet trouvé.</b><div class="small">Les données cartographiques disponibles ne couvrent pas encore ce trajet.</div>';return}

      if(c.kind==='direct'){
        const w1=await walk(A,c.a),w2=await walk(c.b,B),total=w1.min+c.busMin+w2.min;
        result.innerHTML='<div class="route"><div class="big">⭐ Ligne '+esc(c.r.ref)+'</div><div class="small">'+esc(c.r.from)+' → '+esc(c.r.to)+' · '+esc(c.r.operator)+'</div><div class="step">🚶 <b>'+esc(A.label||'Départ')+' → '+esc(c.a.name)+'</b><div class="small">'+w1.min+' min · '+w1.m+' m</div></div><div class="step">🚌 <b>'+esc(c.a.name)+' → '+esc(c.b.name)+'</b><div class="small">~'+c.busMin+' min · durée indicative de planification</div></div><div class="step">🚶 <b>'+esc(c.b.name)+' → '+esc(B.label||'Destination')+'</b><div class="small">'+w2.min+' min · '+w2.m+' m</div></div><span class="badge" style="margin-top:9px">Direct · ~'+total+' min</span></div><div class="warn">ℹ️ Aucun ETA temps réel n’est inventé.</div>';
        if(typeof draw==='function')await draw(A,c.a,c.b,B);
      }else{
        const w1=await walk(A,c.a),wT=await walk(c.t,c.t),w2=await walk(c.b,B),total=w1.min+c.bus1+c.bus2+w2.min+5;
        result.innerHTML='<div class="route"><div class="big">⭐ 2 lignes · 1 correspondance</div><div class="small">Trajet vers Cascavelle</div><div class="step">🚶 <b>'+esc(A.label||'Départ')+' → '+esc(c.a.name)+'</b><div class="small">'+w1.min+' min · '+w1.m+' m</div></div><div class="step">🚌 <b>Ligne 123</b> · '+esc(c.a.name)+' → Flic en Flac Junction<div class="small">~'+c.bus1+' min · durée indicative</div></div><div class="step">🔄 <b>Correspondance à Flic en Flac Junction</b><div class="small">Prévoir ~5 min pour changer de bus.</div></div><div class="step">🚌 <b>Ligne 69</b> · Flic en Flac Junction → '+esc(c.b.name)+'<div class="small">~'+c.bus2+' min · durée indicative</div></div><div class="step">🚶 <b>'+esc(c.b.name)+' → '+esc(B.label||'Destination')+'</b><div class="small">'+w2.min+' min · '+w2.m+' m</div></div><span class="badge" style="margin-top:9px">~'+total+' min · 1 correspondance</span></div><div class="warn">ℹ️ Les lignes 123 et 69 sont présentes dans les données officielles du CNT. Les durées affichées ici sont des estimations de planification, pas des ETA temps réel.</div>';
        if(typeof draw==='function')await draw(A,c.a,c.t,B);
      }
    }catch(e){console.error(e);result.innerHTML='<b class="err">Impossible de calculer ce trajet.</b><div class="small">Une erreur technique est survenue. Réessaie après avoir sélectionné précisément le départ et la destination.</div>'}
    finally{go.disabled=false;go.textContent='Trouver le meilleur trajet'}
  }
  go.onclick=calcFixed;window.calc=calcFixed;

  const gpsBtn=document.getElementById('gps');if(gpsBtn)gpsBtn.onclick=async()=>{gpsBtn.disabled=true;gpsBtn.textContent='⌖ Localisation…';const p=await gps();if(p){window.userPos=p;const f=document.getElementById('from');f.value='Ma position';delete f.dataset.lat;delete f.dataset.lon;gpsBtn.textContent='✓ Position trouvée';setTimeout(()=>{gpsBtn.textContent='⌖ Ma position';gpsBtn.disabled=false},1200)}else{gpsBtn.textContent='⚠️ Autorisation requise';setTimeout(()=>{gpsBtn.textContent='⌖ Ma position';gpsBtn.disabled=false},1800);result.innerHTML='<b class="err">📍 Localisation refusée ou indisponible</b><div class="small">Sur iPad : Réglages → Confidentialité et sécurité → Service de localisation → Safari.</div>'}};
})();