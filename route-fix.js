(()=>{
  // MauriMove route-fix v5
  // Replaces the previous calculator and removes the broken experimental picker.
  // The previous picker referenced an undefined NOM variable, causing
  // "Recherche indisponible" on iPad.
  const go=document.getElementById('go'),result=document.getElementById('result');
  if(!go||!result)return;
  const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n2=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const km=(a,b)=>Math.hypot((a.lat-b.lat)*111,(a.lon-b.lon)*104);

  // Current official NLTA corridors that are important for the western-area test.
  // 123 serves the Port Louis–Cascavelle–Domaine Anna–Wolmar corridor.
  // 57A is the Quatre Bornes–Cascavelle service and is operated by buses of 57.
  const STATIC=[
    {ref:'123',from:'Port Louis',to:'Wolmar',operator:'NTC / operators',stops:[
      {name:'Port Louis',lat:-20.1609,lon:57.5012},
      {name:'Cascavelle',lat:-20.2795,lon:57.4027},
      {name:'Domaine Anna',lat:-20.2660,lon:57.3848},
      {name:'Wolmar',lat:-20.2956,lon:57.3669}
    ]},
    {ref:'57A',from:'Quatre Bornes (Traffic Centre)',to:'Cascavelle',operator:'Individual Operator',stops:[
      {name:'Quatre Bornes (Traffic Centre)',lat:-20.2640,lon:57.4790},
      {name:'La Louise',lat:-20.2620,lon:57.4780},
      {name:'Palma (Government School)',lat:-20.2550,lon:57.4660},
      {name:'Palma (Junction Bassin Estate)',lat:-20.2550,lon:57.4510},
      {name:'Beaux Songes (Reservoir)',lat:-20.2750,lon:57.4210},
      {name:'Cascavelle',lat:-20.2795,lon:57.4027}
    ]}
  ];

  function gps(){
    return new Promise(resolve=>{
      if(!navigator.geolocation){resolve(null);return;}
      navigator.geolocation.getCurrentPosition(
        p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,label:'Ma position'}),
        ()=>resolve(null),
        {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
      );
    });
  }

  async function point(input){
    if(input.dataset.lat&&input.dataset.lon)return{lat:+input.dataset.lat,lon:+input.dataset.lon,label:input.dataset.label||input.value};
    if(n2(input.value)==='ma position'){
      const p=window.userPos||await gps();
      if(p)window.userPos=p;
      return p;
    }
    try{
      if(typeof searchPlace==='function'){
        const a=await searchPlace(input.value);
        if(a?.[0])return a[0];
      }
    }catch(e){}
    return null;
  }

  function routeCandidates(A,B){
    const out=[];
    for(const r of STATIC){
      const aa=r.stops.map((s,i)=>({...s,i,d:km(A,s)})).sort((a,b)=>a.d-b.d).slice(0,3);
      const bb=r.stops.map((s,i)=>({...s,i,d:km(B,s)})).sort((a,b)=>a.d-b.d).slice(0,3);
      for(const a of aa)for(const b of bb){
        if(a.i===b.i)continue;
        const lo=Math.min(a.i,b.i),hi=Math.max(a.i,b.i);
        let d=0;for(let i=lo;i<hi;i++)d+=km(r.stops[i],r.stops[i+1]);
        // Planning estimate only; never presented as real-time ETA.
        const busMin=Math.max(3,Math.round(d/0.42));
        out.push({r,a,b,busMin,score:a.d+b.d+busMin/100});
      }
    }
    return out.sort((a,b)=>a.score-b.score);
  }

  async function walk(a,b){
    try{if(typeof foot==='function')return await foot(a,b)}catch(e){}
    const m=km(a,b)*1000;return{min:Math.max(1,Math.round(m/83)),m:Math.round(m)};
  }

  async function calcFixed(){
    go.disabled=true;go.textContent='Recherche…';
    result.innerHTML='<b>🔎 Recherche du meilleur trajet…</b><div class="small">Vérification de la position, de la destination et des lignes.</div>';
    try{
      const A=await point(document.getElementById('from')),B=await point(document.getElementById('to'));
      if(!A){result.innerHTML='<b class="err">📍 Position indisponible</b><div class="small">Safari ne nous a pas transmis ta position. Appuie sur « Ma position » et autorise la localisation pour ce site.</div>';return}
      if(!B){result.innerHTML='<b class="err">📍 Destination introuvable</b><div class="small">Sélectionne la destination dans la liste de lieux avant de lancer le trajet.</div>';return}

      const c=routeCandidates(A,B)[0];
      if(!c){
        result.innerHTML='<b>Aucun trajet direct trouvé.</b><div class="small">Le calculateur ne dispose pas encore d’un parcours cartographique permettant de confirmer ce trajet.</div><div class="warn">Le catalogue NLTA contient 267 lignes, mais seules quelques lignes disposent actuellement de données d’arrêts cartographiées dans l’application.</div>';
        return;
      }
      const w1=await walk(A,c.a),w2=await walk(c.b,B),total=w1.min+c.busMin+w2.min;
      const forward=c.a.i<c.b.i;
      const seq=(forward?c.r.stops.slice(c.a.i,c.b.i+1):c.r.stops.slice(c.b.i,c.a.i+1).reverse()).map(s=>s.name);
      const direction=forward?`${c.r.from} → ${c.r.to}`:`${c.r.to} → ${c.r.from}`;

      result.innerHTML='<div class="route"><div class="big">⭐ Ligne '+esc2(c.r.ref)+'</div><div class="small">'+esc2(direction)+' · '+esc2(c.r.operator)+'</div>'+
        '<div class="step">🚶 <b>'+esc2(A.label||'Départ')+' → '+esc2(c.a.name)+'</b><div class="small">'+w1.min+' min · '+w1.m+' m à pied</div></div>'+
        '<div class="step">🚌 <b>'+esc2(c.a.name)+' → '+esc2(c.b.name)+'</b><div class="small">~'+c.busMin+' min · durée de planification indicative</div></div>'+
        '<div class="step">🚶 <b>'+esc2(c.b.name)+' → '+esc2(B.label||'Destination')+'</b><div class="small">'+w2.min+' min · '+w2.m+' m à pied</div></div>'+
        '<div class="small" style="margin-top:8px">Arrêts principaux : '+seq.map(esc2).join(' → ')+'</div>'+
        '<span class="badge" style="margin-top:9px">Trajet direct · ~'+total+' min</span></div>'+
        '<div class="warn">ℹ️ La durée du bus est indicative lorsqu’une durée officielle détaillée du tronçon n’est pas disponible. Aucun ETA temps réel n’est inventé.</div>';

      if(typeof draw==='function')await draw(A,c.a,c.b,B);
    }catch(e){
      console.error('MauriMove calculator',e);
      result.innerHTML='<b class="err">Impossible de calculer ce trajet.</b><div class="small">Une erreur technique est survenue. Réessaie après avoir sélectionné précisément le départ et la destination.</div>';
    }finally{go.disabled=false;go.textContent='Trouver le meilleur trajet';}
  }

  go.onclick=calcFixed;
  window.calc=calcFixed;

  // Reliable GPS button; also makes the location failure explicit on iPad.
  const gpsBtn=document.getElementById('gps');
  if(gpsBtn)gpsBtn.onclick=async()=>{
    gpsBtn.disabled=true;gpsBtn.textContent='⌖ Localisation…';
    const p=await gps();
    if(p){
      window.userPos=p;const f=document.getElementById('from');f.value='Ma position';delete f.dataset.lat;delete f.dataset.lon;
      gpsBtn.textContent='✓ Position trouvée';setTimeout(()=>{gpsBtn.textContent='⌖ Ma position';gpsBtn.disabled=false},1200);
    }else{
      gpsBtn.textContent='⚠️ Autorisation requise';setTimeout(()=>{gpsBtn.textContent='⌖ Ma position';gpsBtn.disabled=false},1800);
      result.innerHTML='<b class="err">📍 Localisation refusée ou indisponible</b><div class="small">Sur iPad : Réglages → Confidentialité et sécurité → Service de localisation → Safari, puis autorise la localisation et réessaie.</div>';
    }
  };

  console.info('MauriMove route-fix v5 loaded');
})();