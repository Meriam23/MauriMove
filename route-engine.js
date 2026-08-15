(()=>{
  const go=document.getElementById('go'), result=document.getElementById('result');
  if(!go||!result) return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const km=(a,b)=>Math.hypot((a.lat-b.lat)*111,(a.lon-b.lon)*104);
  const walkMin=d=>Math.max(1,Math.round(d*1000/83));
  let liveWatch=null, liveState=null, progressMarkers=[];

  function key(r,i){return r+'|'+i}
  function stopPoint(s){return {lat:+s.lat,lon:+s.lon,label:s.name||'Arrêt de bus',route:s.route,index:s.i}}
  function buildNodes(){
    const nodes=new Map(), edges=new Map();
    routes.forEach((r,ri)=>r.stops.forEach((s,i)=>{const k=key(ri,i);nodes.set(k,{r:ri,i,s:stopPoint({...s,route:ri,i})});edges.set(k,[])}));
    routes.forEach((r,ri)=>{
      for(let i=0;i<r.stops.length-1;i++){
        const a=stopPoint({...r.stops[i],route:ri,i}),b=stopPoint({...r.stops[i+1],route:ri,i:i+1});
        const mins=Math.max(1,Math.round(km(a,b)*1000/420));
        edges.get(key(ri,i)).push({to:key(ri,i+1),kind:'bus',min:mins,km:km(a,b),ri,i,j:i+1});
      }
    });
    // Automatic transfer edges: any two different routes with stops within 450 m.
    // This is deliberately a network rule, not a C-Care-specific exception.
    const buckets=new Map(), cell=.0045;
    const bucket=(s)=>Math.floor(s.lat/cell)+':'+Math.floor(s.lon/cell);
    stops.forEach((s,idx)=>{
      const p=stopPoint({...s,index:idx});
      const b=bucket(p); if(!buckets.has(b))buckets.set(b,[]); buckets.get(b).push({...p,global:idx});
    });
    stops.forEach((s,idx)=>{
      const p=stopPoint({...s,index:idx}), [la,lo]=[Math.floor(p.lat/cell),Math.floor(p.lon/cell)];
      for(let da=-1;da<=1;da++)for(let db=-1;db<=1;db++){
        const arr=buckets.get((la+da)+':'+(lo+db))||[];
        for(const q of arr){
          if(q.route===p.route)continue;
          const d=km(p,q); if(d>.45)continue;
          const a=key(p.route,p.indexInRoute??findIndex(p.route,p)), b=key(q.route,q.indexInRoute??findIndex(q.route,q));
          if(!edges.has(a)||!edges.has(b))continue;
          const min=Math.max(1,walkMin(d)+2);
          edges.get(a).push({to:b,kind:'transfer',min,km:d,fromStop:p,toStop:q});
        }
      }
    });
    return {nodes,edges};
  }
  function findIndex(ri,s){const r=routes[ri];return r?r.stops.findIndex(x=>x.id===s.id || (Math.abs(+x.lat-+s.lat)<1e-8&&Math.abs(+x.lon-+s.lon)<1e-8)):-1}

  function nearestForPoint(p,limit=1.2){
    if(!p)return [];
    return stops.map((s,idx)=>{const ri=s.route, r=routes[ri], i=r?.stops.findIndex(x=>x.id===s.id);return {p:stopPoint({...s,route:ri,i}),ri,i,idx,d:km(p,s)}}).filter(x=>x.i>=0&&x.d<=limit).sort((a,b)=>a.d-b.d).slice(0,24);
  }
  function dijkstra(A,B){
    const {nodes,edges}=buildNodes();
    if(!nodes.size)return null;
    const starts=nearestForPoint(A), ends=nearestForPoint(B);
    if(!starts.length||!ends.length)return null;
    const dist=new Map(), prev=new Map(), queue=[];
    starts.forEach(x=>{const k=key(x.ri,x.i),c=walkMin(x.d);if(!dist.has(k)||c<dist.get(k)){dist.set(k,c);queue.push([c,k,0])}});
    const endKeys=new Map(ends.map(x=>[key(x.ri,x.i),x]));
    let best=null;
    while(queue.length){
      queue.sort((a,b)=>a[0]-b[0]); const [d,u,transfers]=queue.shift();
      if(d!==dist.get(u))continue;
      if(endKeys.has(u)){best={end:u,cost:d+walkMin(endKeys.get(u).d),endInfo:endKeys.get(u)};break}
      if(transfers>3)continue;
      for(const e of edges.get(u)||[]){
        const nt=transfers+(e.kind==='transfer'?1:0); if(nt>3)continue;
        const nd=d+e.min;
        if(nd<(dist.get(e.to)??Infinity)){dist.set(e.to,nd);prev.set(e.to,{u,e});queue.push([nd,e.to,nt])}
      }
    }
    if(!best)return null;
    const chain=[];let cur=best.end;while(cur){chain.push(cur);const p=prev.get(cur);if(!p)break;cur=p.u}chain.reverse();
    const legs=[];let current=null;
    for(let n=0;n<chain.length;n++){
      const k=chain[n],node=nodes.get(k); if(!node)continue;
      if(!current||current.route!==node.r){
        if(current)legs.push(current);
        current={route:node.r,stops:[node.s],from:node.s,to:node.s};
      }else current.stops.push(node.s);
    }
    if(current)legs.push(current);
    const first=nodes.get(chain[0]).s,last=nodes.get(chain[chain.length-1]).s;
    const segments=[];
    let prevPoint=A;
    segments.push({kind:'walk',from:A,to:first,min:walkMin(km(A,first)),m:Math.round(km(A,first)*1000)});
    for(let i=0;i<legs.length;i++){
      const leg=legs[i];leg.from=leg.stops[0];leg.to=leg.stops[leg.stops.length-1];
      segments.push({kind:'bus',route:leg.route,stops:leg.stops,min:Math.max(1,Math.round(leg.stops.slice(0,-1).reduce((sum,s,j)=>sum+km(s,leg.stops[j+1])*1000/420,0)))});
      if(i<legs.length-1){
        const a=leg.to,b=legs[i+1].stops[0];segments.push({kind:'transfer',from:a,to:b,min:walkMin(km(a,b)),m:Math.round(km(a,b)*1000)});
      }
    }
    segments.push({kind:'walk',from:last,to:B,min:walkMin(km(last,B)),m:Math.round(km(last,B)*1000)});
    return {segments,totalMin:Math.round(best.cost),legs};
  }

  async function drawGeneral(A,B,plan){
    clearMap();
    const all=[];
    for(const seg of plan.segments){
      if(seg.kind==='bus'){
        const pts=seg.stops.map(s=>[s.lat,s.lon]);
        const road=await realRoad(pts);
        if(road)all.push(...road); else all.push(...pts);
      }else all.push([seg.from.lat,seg.from.lon],[seg.to.lat,seg.to.lon]);
    }
    if(all.length>1)routeLayers.push(L.polyline(all,{color:'#0072CE',weight:6,opacity:.95,lineCap:'round',lineJoin:'round'}).addTo(map));
    plan.segments.forEach((seg,si)=>{if(seg.kind==='bus'){seg.stops.forEach((s,i)=>{const m=L.circleMarker([s.lat,s.lon],{radius:5,weight:2,color:'#0072CE',fillColor:'#fff',fillOpacity:1}).addTo(map);m.bindTooltip(String(i+1)+' · '+s.label);progressMarkers.push(m)})}});
    map.fitBounds(L.latLngBounds(all),{padding:[70,70]});
  }
  function renderPlan(A,B,plan){
    const busLegs=plan.segments.filter(s=>s.kind==='bus');
    let html='<div class="route"><div class="big">⭐ Meilleur trajet · ~'+plan.totalMin+' min</div>';
    plan.segments.forEach((s,i)=>{
      if(s.kind==='walk')html+='<div class="step">🚶 <b>'+esc(s.from.label)+' → '+esc(s.to.label)+'</b><div class="small">'+s.min+' min · '+s.m+' m</div></div>';
      else if(s.kind==='transfer')html+='<div class="step">🔄 <b>Correspondance à '+esc(s.from.label)+'</b><div class="small">🚶 '+s.min+' min jusqu’à '+esc(s.to.label)+'</div></div>';
      else {const r=routes[s.route];html+='<div class="step"><span class="badge">🚌 Ligne '+esc(r.ref)+'</span> <b>'+esc(r.from||'')+' → '+esc(r.to||'')+'</b><div class="small">'+s.stops.length+' arrêts · ~'+s.min+' min</div></div>'}
    });
    html+='<button id="trackBtn" class="btn" style="margin-top:10px">📍 Démarrer le suivi des arrêts</button></div><div id="liveProgress" class="warn">Le suivi GPS indiquera l’arrêt actuel, les arrêts déjà passés et le prochain arrêt. Il ne prétend pas connaître la position du bus en temps réel.</div>';
    result.innerHTML=html;
    const tb=document.getElementById('trackBtn');if(tb)tb.onclick=()=>startTracking(plan);
  }
  function startTracking(plan){
    if(liveWatch!==null){navigator.geolocation.clearWatch(liveWatch);liveWatch=null}
    if(!navigator.geolocation){document.getElementById('liveProgress').innerHTML='📍 La géolocalisation n’est pas disponible sur cet appareil.';return}
    const busStops=plan.segments.filter(s=>s.kind==='bus').flatMap(s=>s.stops.map(x=>({...x,leg:s}))); liveState={plan,busStops};
    document.getElementById('liveProgress').innerHTML='📍 <b>Suivi activé</b><br>Recherche de ta position…';
    liveWatch=navigator.geolocation.watchPosition(updateProgress,()=>{document.getElementById('liveProgress').innerHTML='⚠️ Suivi GPS indisponible. Vérifie l’autorisation de localisation de Safari.'},{enableHighAccuracy:true,maximumAge:5000,timeout:10000});
  }
  function updateProgress(pos){
    if(!liveState)return;const p={lat:pos.coords.latitude,lon:pos.coords.longitude};
    let best=null;liveState.busStops.forEach((s,i)=>{const d=km(p,s);if(!best||d<best.d)best={s,i,d}});
    if(!best)return;const next=liveState.busStops[best.i+1];
    const passed=best.i, total=liveState.busStops.length;
    document.getElementById('liveProgress').innerHTML='📍 <b>Tu es près de '+esc(best.s.label)+'</b><br><span class="small">'+passed+' arrêt'+(passed>1?'s':'')+' passé'+(passed>1?'s':'')+' · '+Math.max(0,total-passed-1)+' restant'+(total-passed-1>1?'s':'')+(next?' · Prochain : <b>'+esc(next.label)+'</b>':'')+'</span>';
    progressMarkers.forEach((m,i)=>m.setStyle(i<=best.i?{fillColor:'#0072CE',color:'#0072CE'}:{fillColor:'#fff',color:'#0072CE'}));
  }

  async function calcGeneral(){
    go.disabled=true;go.textContent='Recherche…';result.innerHTML='<b>🔎 Calcul du réseau…</b><div class="small">Recherche des arrêts proches, des correspondances et des meilleurs itinéraires.</div>';
    try{
      const A=await resolveInput($('from')),B=await resolveInput($('to'));
      if(!A){result.innerHTML='<b class="err">📍 Départ introuvable</b><div class="small">Sélectionne un lieu ou autorise la localisation.</div>';return}
      if(!B){result.innerHTML='<b class="err">📍 Destination introuvable</b><div class="small">Sélectionne une destination dans la liste.</div>';return}
      if(!routes.length){result.innerHTML='<b class="err">Réseau bus indisponible</b><div class="small">Le catalogue NLTA est disponible, mais les parcours géographiques ne sont pas encore chargés.</div>';return}
      const plan=dijkstra(A,B);
      if(!plan){result.innerHTML='<b>Aucun itinéraire confirmé.</b><div class="small">Aucun chemin multimodal n’a pu être établi avec les parcours cartographiques actuellement disponibles. Aucun trajet n’est inventé.</div>';return}
      await drawGeneral(A,B,plan);renderPlan(A,B,plan);
    }catch(e){console.error(e);result.innerHTML='<b class="err">Erreur de calcul</b><div class="small">'+esc(e.message||'Erreur inconnue')+'</div>'}
    finally{go.disabled=false;go.textContent='Trouver le meilleur trajet'}
  }
  go.onclick=calcGeneral; window.calc=calcGeneral;
})();