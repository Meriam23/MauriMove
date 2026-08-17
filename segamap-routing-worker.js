(() => {
  const API = window.SEGAMAP_ROUTING_API || '';
  if (!API) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const map = () => window.segaMap;
  const pos = input => input?.dataset?.lat ? { lat: Number(input.dataset.lat), lon: Number(input.dataset.lon), name: input.dataset.label || input.value } : null;
  async function resolve(input) {
    const p = pos(input);
    if (p) return p;
    if (String(input.value).trim().toLowerCase() === 'ma position' && window.userPos) return window.userPos;
    const r = await fetch(`${API}/api/route`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from: input.value, to: $('to').value }) });
    return r;
  }
  async function run() {
    const from = $('from'), to = $('to'), result = $('result'), button = $('go');
    if (!from || !to || !result || !button) return;
    const fp = pos(from) || (String(from.value).trim().toLowerCase() === 'ma position' && window.userPos ? window.userPos : null);
    const tp = pos(to);
    if (!fp || !tp) {
      result.innerHTML = '<b>Choisis les deux lieux</b><div class="small">Sélectionne une suggestion pour que SegaMap utilise les coordonnées exactes.</div>';
      return;
    }
    button.disabled = true; result.innerHTML = '<b>Recherche du réseau Ouest…</b><div class="progress">Calcul de l’itinéraire bus et du chemin réel sur les routes.</div>';
    try {
      const r = await fetch(`${API}/api/route`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from: fp, to: tp }) });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'Aucun trajet bus trouvé');
      const m = map();
      if (m && data.geometry?.coordinates?.length) {
        if (window.segaRoutingLayer) m.removeLayer(window.segaRoutingLayer);
        window.segaRoutingLayer = L.geoJSON(data.geometry, { style:{ weight:6, opacity:.9 } }).addTo(m);
        m.fitBounds(window.segaRoutingLayer.getBounds(), { padding:[30,30] });
      }
      const stops = (data.stops || []).map((s,i) => `<div class="step"><b>${i === 0 ? '🚌 ' : '→ '}${esc(s.name)}</b><div class="small">${Number(s.lat).toFixed(5)}, ${Number(s.lon).toFixed(5)}</div></div>`).join('');
      result.innerHTML = `<div class="ok">✓ Trajet Ouest trouvé</div><div class="small" style="margin-top:6px">${esc(data.from.name || from.value)} → ${esc(data.to.name || to.value)}</div><div class="title">Parcours complet</div>${stops || '<div class="small">Aucun arrêt intermédiaire.</div>'}<div class="warn">Temps indicatif basé sur les horaires publiés du réseau. Pas de temps réel.</div>`;
    } catch (e) {
      result.innerHTML = `<div class="err">${esc(e.message)}</div><div class="small" style="margin-top:6px">Le réseau Ouest n’a pas trouvé de correspondance fiable pour cette recherche.</div>`;
    } finally { button.disabled = false; }
  }
  window.addEventListener('load', () => {
    const button = $('go');
    if (button) button.onclick = run;
  });
})();
