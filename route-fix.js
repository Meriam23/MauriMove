(()=>{
  const officialTimes={
    '203':[0,5,10,15,20,25,30,35,40,45,50],
    '57':[0,10,18,20,22,24,27,30,35,38,41,43,45,50]
  };
  function plausible(r){
    const ref=String(r?.ref||'').trim().toUpperCase();
    if(ref!=='203') return true;
    const from=String(r.from||'').toLowerCase(),to=String(r.to||'').toLowerCase();
    const names=(r.stops||[]).map(s=>String(s.name||'').toLowerCase());
    const known=['port louis','brabant','grnw','camp benoit','petite riviere','foyer','gros cailloux','canot','saint martin','mont roches','camp levieux'];
    const hits=names.filter(n=>known.some(k=>n.includes(k))).length;
    return hits>=3 && ((from.includes('port louis')&&to.includes('camp levieux'))||(to.includes('port louis')&&from.includes('camp levieux')));
  }
  function busMinutes(x){
    const ref=String(x?.route?.ref||'').trim().toUpperCase();
    if(ref==='203') return Math.max(1,(x.j-x.i)*5);
    if(ref==='57'){
      const forward=officialTimes['57'];
      const reverse=[0,5,7,9,12,15,20,23,26,28,30,32,40,50];
      const a=(String(x.route.from||'').toLowerCase().includes('wolmar')||String(x.route.to||'').toLowerCase().includes('quatre'))?reverse:forward;
      if(x.i>=0&&x.j<a.length) return Math.max(1,a[x.j]-a[x.i]);
    }
    return null;
  }
  window.routeCandidates=function(from,to){
    const A=nearestStops(from,10),B=nearestStops(to,10),res=[];
    for(const s of A) for(const t of B) for(const ri of [...s.routes]){
      const r=routes[ri]; if(!plausible(r)) continue;
      const i=r.stops.findIndex(x=>x.id===s.id),j=r.stops.findIndex(x=>x.id===t.id);
      if(i>=0&&j>i) res.push({type:'direct',route:r,ri,i,j,os:s,ds:t,walkA:s.d,walkB:t.d,busStops:j-i});
    }
    return res.sort((a,b)=>(a.walkA+a.walkB)-(b.walkA+b.walkB)).slice(0,12);
  };
  window.draw=function(points){
    clearMarks();
    const fallback=L.polyline(points,{color:'#246bfd',weight:5,dashArray:'8 8'}).addTo(map); marks.push(fallback);
    const coords=points.map(p=>p[1]+','+p[0]).join(';');
    fetch('https://router.project-osrm.org/route/v1/driving/'+coords+'?overview=full&geometries=geojson&steps=false')
      .then(r=>r.ok?r.json():Promise.reject()).then(j=>{
        const c=j.routes?.[0]?.geometry?.coordinates; if(!c) return;
        fallback.remove();
        const ll=c.map(p=>[p[1],p[0]]);
        marks.push(L.polyline(ll,{color:'#246bfd',weight:5}).addTo(map));
        marks.push(L.marker(points[0]).addTo(map).bindPopup('Départ'));
        marks.push(L.marker(points.at(-1)).addTo(map).bindPopup('Destination'));
        map.fitBounds(ll,{padding:[80,80]});
      }).catch(()=>map.fitBounds(points,{padding:[80,80]}));
  };
  window.cardDirect=function(x,w1,w2){
    const bus=busMinutes(x), total=bus===null?null:w1.min+bus+w2.min;
    const busText=bus===null?'Durée bus officielle indisponible pour ce tronçon':'~'+bus+' min · durée moyenne officielle NLTA';
    return '<div class="card best"><div class="big">⭐ Ligne '+esc(x.route.ref)+'</div><div class="small">'+esc(x.route.from||'')+(x.route.to?' → '+esc(x.route.to):'')+(x.route.operator?' · '+esc(x.route.operator):'')+'</div><div class="step"><div class="ico">🚶</div><div><b>'+esc(x.os.name||'Arrêt de bus')+'</b><div class="small">'+w1.min+' min · '+w1.m+' m depuis le départ</div></div></div><div class="step"><div class="ico">🚌</div><div><b>'+esc(x.os.name||'Arrêt de bus')+' → '+esc(x.ds.name||'Arrêt de bus')+'</b><div class="small">'+busText+'</div></div></div><div class="step"><div class="ico">🚶</div><div><b>'+esc(x.ds.name||'Arrêt de bus')+'</b><div class="small">'+w2.min+' min · '+w2.m+' m jusqu’à la destination</div></div></div><span class="pill">Correspondance : directe</span></div><div class="warn">'+(total===null?'⏱️ Durée totale non affichée : durée bus officielle manquante.':'⏱️ Durée indicative totale : <b>~'+total+' min</b>.')+' Aucun ETA temps réel n’est inventé.</div>';
  };
})();