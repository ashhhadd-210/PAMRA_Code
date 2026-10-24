// PAMRA weather engine — 7-day forecast for key Punjab mandis turned into
// agricultural + market intelligence. Fully client-side and deterministic per
// day, so it works on the live server and the static Vercel build alike.
// Renders its own scoped styles, so it drops into any page (public or platform).
window.PAMRAWeather = (function () {
  const REGIONS = [
    { city: 'Lahore', market: 'Lahore' },
    { city: 'Faisalabad', market: 'Faisalabad' },
    { city: 'Multan', market: 'Multan' },
    { city: 'Rawalpindi', market: 'Rawalpindi' },
    { city: 'Gujranwala', market: 'Gujranwala' },
    { city: 'Sahiwal', market: 'Sahiwal' },
    { city: 'Bahawalpur', market: 'Bahawalpur' },
    { city: 'Sargodha', market: 'Sargodha' },
  ];
  const COND = {
    'Sunny':        { icon: '☀️' },
    'Hot':          { icon: '🔥' },
    'Partly cloudy':{ icon: '⛅' },
    'Cloudy':       { icon: '☁️' },
    'Light rain':   { icon: '🌦️' },
    'Rain':         { icon: '🌧️' },
    'Thunderstorm': { icon: '⛈️' },
  };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let x = seed || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

  // One day's weather for a city (June = Punjab summer / pre-monsoon).
  function dayFor(city, date) {
    const r = rng(hash(city + '|' + date.toISOString().slice(0, 10)));
    const hi = 37 + Math.round(r() * 7);          // 37–44°C
    const lo = hi - (8 + Math.round(r() * 4));
    const roll = r();
    let cond;
    if (hi >= 43 && roll < 0.45) cond = 'Hot';
    else if (roll < 0.10) cond = 'Thunderstorm';
    else if (roll < 0.20) cond = 'Light rain';
    else if (roll < 0.38) cond = 'Partly cloudy';
    else if (roll < 0.48) cond = 'Cloudy';
    else cond = hi >= 42 ? 'Hot' : 'Sunny';
    const rain = cond === 'Thunderstorm' ? 60 + Math.round(r() * 30)
      : cond === 'Light rain' ? 40 + Math.round(r() * 25)
      : cond === 'Partly cloudy' ? 15 + Math.round(r() * 15)
      : 5 + Math.round(r() * 10);
    const precip = cond === 'Thunderstorm' ? 10 + Math.round(r() * 35)
      : cond === 'Light rain' ? 2 + Math.round(r() * 10)
      : cond === 'Rain' ? 15 + Math.round(r() * 25) : 0;
    const hum = 25 + Math.round(r() * 45);
    const wind = 6 + Math.round(r() * 18);
    const windDir = DIRS[Math.floor(r() * 8)];
    const feels = (cond === 'Rain' || cond === 'Thunderstorm') ? hi - 2 : hi + Math.max(0, Math.round((hum - 35) / 8));
    const uv = (cond === 'Cloudy' || cond === 'Rain' || cond === 'Thunderstorm') ? 4 + Math.round(r() * 3) : 8 + Math.round(r() * 4);
    return { hi, lo, cond, rain, precip, hum, wind, windDir, feels, uv, sunrise: '05:08', sunset: '19:12' };
  }

  function generate() {
    const today = new Date();
    const regions = REGIONS.map(reg => {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today); d.setDate(today.getDate() + i);
        days.push(Object.assign({ date: d, label: i === 0 ? 'Today' : DAYS[d.getDay()], dateStr: d.toISOString().slice(5, 10) }, dayFor(reg.city, d)));
      }
      // Agronomy metrics for the week.
      const wkRain = days.reduce((a, d) => a + d.precip, 0);
      const hotDays = days.filter(d => d.hi >= 42).length;
      const soil = Math.max(8, Math.min(62, 24 + Math.round(wkRain * 0.8) - hotDays * 3));
      const et = Math.round((6 + hotDays * 0.4) * 10) / 10;
      const irrig = days.slice(0, 2).some(d => d.precip >= 8) ? 'Hold — rain within 48h' : (soil < 25 ? 'Irrigate in 1–2 days' : 'Adequate for now');
      const spray = (days[0].wind <= 12 && days[0].precip < 3) ? 'Good — calm & dry' : 'Avoid — wind/rain';
      const harvest = days.slice(0, 3).some(d => d.precip >= 8) ? 'Delay — wet spell' : 'Favourable — dry';
      return Object.assign({}, reg, { days, ag: { wkRain, soil, et, irrig, spray, harvest } });
    });

    // Alerts (next 3 days).
    const alerts = [];
    const heat = regions.filter(r => r.days.slice(0, 3).filter(d => d.hi >= 43).length >= 2);
    const storm = regions.filter(r => r.days.slice(0, 2).some(d => d.cond === 'Thunderstorm'));
    if (heat.length) alerts.push({ sev: 'severe', icon: '🔥', title: 'Heatwave warning', text: 'Daytime highs of 43°C and above expected in ' + heat.slice(0, 4).map(r => r.city).join(', ') + '. Risk to perishables and field labour; ensure shade, hydration and rapid cold-chain offtake.' });
    if (storm.length) alerts.push({ sev: 'moderate', icon: '⛈️', title: 'Thunderstorm watch', text: 'Pre-monsoon thunderstorms likely within 48 hours in ' + storm.slice(0, 4).map(r => r.city).join(', ') + '. Possible gate delays, lodging of standing crops and short-term arrival drops.' });

    // Market-impact predictions.
    const wet = regions.filter(r => r.days.slice(0, 3).some(d => d.precip >= 8));
    const hot = regions.filter(r => r.days.slice(0, 3).some(d => d.hi >= 43));
    const advisories = [];
    if (wet.length) advisories.push({ icon: '🌧️', tone: 'up', title: 'Rain in ' + wet.slice(0, 3).map(r => r.city).join(', '), text: 'Tomato, leafy vegetables and chillies arrivals may dip 10–15% as transport and harvesting slow. Expect short-term firming in perishable prices.', conf: 'High' });
    if (hot.length) advisories.push({ icon: '🔥', tone: 'warn', title: 'Heat stress in ' + hot.slice(0, 3).map(r => r.city).join(', '), text: 'Perishables face higher spoilage risk. Advise quick offtake and cold-storage routing; storage demand and wastage both rise.', conf: 'High' });
    advisories.push({ icon: '🌾', tone: 'ok', title: 'Grains & pulses', text: 'Dry, warm spell favours safe storage of wheat and maize. Supply expected stable with minimal price movement.', conf: 'Medium' });
    advisories.push({ icon: '🚚', tone: 'ok', title: 'Logistics', text: wet.length ? 'Possible road delays on wet days — committees should expect uneven gate arrivals mid-week.' : 'Clear roads support steady, predictable gate arrivals across the province.', conf: 'Medium' });

    // Commodity weather-impact table.
    const W = wet.length > 0, H = hot.length > 0;
    const commodities = [
      { c: 'Tomato', s: W ? 'Supply dip likely' : H ? 'High spoilage risk' : 'Stable', t: W ? 'up' : H ? 'warn' : 'ok', a: H ? 'Cold storage, fast offtake' : 'Monitor arrivals' },
      { c: 'Onion', s: W ? 'Storage risk in rain' : 'Stable', t: W ? 'warn' : 'ok', a: W ? 'Keep dry, ventilate stores' : 'Normal handling' },
      { c: 'Leafy greens', s: H ? 'Wilting / short shelf-life' : W ? 'Harvest delay' : 'Stable', t: (H || W) ? 'warn' : 'ok', a: 'Sell same day, shade loads' },
      { c: 'Potato', s: 'Stable (in storage)', t: 'ok', a: 'Maintain cold store temps' },
      { c: 'Wheat / Maize', s: 'Favourable for storage', t: 'ok', a: 'Dry spell aids safe stacking' },
      { c: 'Mango', s: H ? 'Faster ripening' : W ? 'Bruising in rain' : 'Stable', t: (H || W) ? 'warn' : 'ok', a: 'Time picking to weather window' },
      { c: 'Cotton', s: W ? 'Field access limited' : 'Favourable', t: W ? 'warn' : 'ok', a: W ? 'Delay spray/picking' : 'Proceed as planned' },
    ];

    const rainyDays = regions[0].days.filter(d => d.precip >= 8).length;
    const outlook = `Punjab 7-day outlook: hot and largely dry${rainyDays ? `, with isolated pre-monsoon showers on ${rainyDays} day(s)` : ''}. Perishable supply may tighten where storms hit; grain supply stable.`;

    return { regions, alerts, advisories, commodities, outlook, updated: today };
  }

  function injectStyles() {
    if (document.getElementById('wx-styles')) return;
    const css = `
    .wx-wrap{font-family:inherit;color:#0f172a}
    .wx-alert{display:flex;gap:12px;align-items:flex-start;border-radius:10px;padding:12px 16px;margin-bottom:10px}
    .wx-alert .ic{font-size:22px;line-height:1}
    .wx-alert .ti{font-weight:800;font-size:13px}
    .wx-alert .tx{font-size:12.5px;margin-top:2px;line-height:1.5}
    .wx-alert.severe{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
    .wx-alert.moderate{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
    .wx-outlook{background:linear-gradient(135deg,#01411c,#186b34);color:#fff;border-radius:10px;padding:16px 18px;display:flex;gap:14px;align-items:center;margin-bottom:16px}
    .wx-outlook .ic{font-size:30px;line-height:1}
    .wx-outlook .t{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#cfead9;font-weight:800}
    .wx-outlook .m{font-size:14px;margin-top:3px;line-height:1.5}
    .wx-h{font-size:13px;font-weight:800;color:#01411c;margin:18px 0 10px;text-transform:uppercase;letter-spacing:.5px}
    .wx-today{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}
    .wx-strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px}
    .wx-strip .wx-tile{min-width:166px;flex:0 0 auto}
    .wx-tile{background:#fff;border:1px solid #d4e5d9;border-radius:10px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
    .wx-tile .city{font-weight:800;font-size:13px;display:flex;justify-content:space-between;align-items:center}
    .wx-tile .ic{font-size:22px}
    .wx-tile .temp{font-size:22px;font-weight:800;margin:4px 0 2px}
    .wx-tile .temp small{font-size:13px;color:#64748b;font-weight:600}
    .wx-tile .cond{font-size:12px;color:#334155}
    .wx-tile .meta{font-size:11px;color:#64748b;margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:2px 8px}
    .wx-7{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
    .wx-d{background:#fff;border:1px solid #d4e5d9;border-radius:10px;padding:12px 6px;text-align:center}
    .wx-d.today{border-color:#186b34;box-shadow:0 0 0 2px rgba(24,107,52,.12)}
    .wx-d .day{font-size:11px;font-weight:800;color:#01411c}
    .wx-d .dt{font-size:10px;color:#94a3b8}
    .wx-d .ic{font-size:24px;margin:6px 0}
    .wx-d .hl{font-size:13px;font-weight:700}
    .wx-d .hl small{color:#94a3b8;font-weight:600}
    .wx-d .rn{font-size:10px;color:#1f5fa6;margin-top:3px}
    .wx-d .mm{font-size:10px;color:#64748b}
    .wx-sel{display:flex;align-items:center;gap:8px;margin-bottom:10px}
    .wx-sel select{padding:7px 10px;border:1px solid #d4e5d9;border-radius:8px;font-size:13px}
    .wx-chart{width:100%;height:180px;background:#fff;border:1px solid #d4e5d9;border-radius:10px;margin-top:10px;display:block}
    .wx-ag{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
    .wx-ag .a{background:#fff;border:1px solid #d4e5d9;border-radius:10px;padding:12px 14px}
    .wx-ag .a .k{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;font-weight:700}
    .wx-ag .a .v{font-size:15px;font-weight:800;margin-top:3px;color:#0f172a}
    .wx-ag .a .s{font-size:11px;color:#64748b;margin-top:2px}
    .wx-imp{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
    .wx-card{background:#fff;border:1px solid #d4e5d9;border-radius:10px;padding:14px 16px;border-left:4px solid #94a3b8}
    .wx-card.up{border-left-color:#1f5fa6}.wx-card.warn{border-left-color:#c9a227}.wx-card.ok{border-left-color:#186b34}
    .wx-card .hd{display:flex;gap:8px;align-items:center;font-weight:800;font-size:14px}
    .wx-card .bd{font-size:12.5px;color:#475569;margin-top:6px;line-height:1.55}
    .wx-card .cf{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-top:8px}
    .wx-tbl{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d4e5d9;border-radius:10px;overflow:hidden}
    .wx-tbl th{background:#f0f7f2;color:#01411c;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:9px 12px}
    .wx-tbl td{padding:10px 12px;border-top:1px solid #eef2ee;font-size:12.5px;color:#334155}
    .wx-pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px}
    .wx-pill.ok{background:#dcfce7;color:#166534}.wx-pill.warn{background:#fef9c3;color:#854d0e}.wx-pill.up{background:#dbeafe;color:#1e40af}
    .wx-upd{font-size:11px;color:#94a3b8;margin-top:10px}
    @media(max-width:720px){.wx-7{grid-template-columns:repeat(4,1fr)}}
    `;
    const st = document.createElement('style'); st.id = 'wx-styles'; st.textContent = css; document.head.appendChild(st);
  }

  let DATA = null;

  function render(elOrId, opts) {
    opts = opts || {};
    injectStyles();
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return;
    DATA = DATA || generate();
    el.classList.add('wx-wrap');
    const alertsHtml = DATA.alerts.map(a => `<div class="wx-alert ${a.sev}"><div class="ic">${a.icon}</div><div><div class="ti">${a.icon ? '' : ''}${a.title}</div><div class="tx">${a.text}</div></div></div>`).join('');
    const outlookHtml = `<div class="wx-outlook"><div class="ic">🌤️</div><div><div class="t">7-day market weather outlook</div><div class="m">${DATA.outlook}</div></div></div>`;
    const impactHtml = `<div class="wx-h">Predicted market impact</div><div class="wx-imp">${DATA.advisories.map(a => `<div class="wx-card ${a.tone}"><div class="hd">${a.icon} ${a.title}</div><div class="bd">${a.text}</div><div class="cf">Confidence: ${a.conf}</div></div>`).join('')}</div>`;

    if (opts.compact) {
      el.innerHTML = `${alertsHtml}${outlookHtml}
        <div class="wx-h">Today across key mandis</div>
        <div class="wx-strip">${DATA.regions.map(tile).join('')}</div>
        ${impactHtml}
        <div class="wx-upd">Forecast model · updated ${DATA.updated.toLocaleString()} · indicative data</div>`;
      return;
    }

    const selCity = opts.city || DATA.regions[0].city;
    el.innerHTML = `${alertsHtml}${outlookHtml}
      <div class="wx-h">Today across key mandis</div>
      <div class="wx-today">${DATA.regions.map(tile).join('')}</div>
      <div class="wx-h">7-day forecast</div>
      <div class="wx-sel"><label for="wx-city" style="font-size:12px;color:#64748b;font-weight:700">Market</label><select id="wx-city">${DATA.regions.map(r => `<option ${r.city === selCity ? 'selected' : ''}>${r.city}</option>`).join('')}</select></div>
      <div class="wx-7" id="wx-7day">${sevenDay(selCity)}</div>
      <canvas class="wx-chart" id="wx-chart"></canvas>
      <div class="wx-h">Agricultural advisory — <span id="wx-ag-city">${selCity}</span></div>
      <div class="wx-ag" id="wx-ag">${agCards(selCity)}</div>
      ${impactHtml}
      <div class="wx-h">Commodity weather impact</div>
      <table class="wx-tbl"><thead><tr><th>Commodity</th><th>This week</th><th>Recommended action</th></tr></thead>
        <tbody>${DATA.commodities.map(c => `<tr><td><strong>${c.c}</strong></td><td><span class="wx-pill ${c.t}">${c.s}</span></td><td>${c.a}</td></tr>`).join('')}</tbody></table>
      <div class="wx-upd">Forecast model · updated ${DATA.updated.toLocaleString()} · indicative data for demonstration</div>`;

    const sel = el.querySelector('#wx-city');
    const redraw = () => drawChart(el.querySelector('#wx-chart'), sel.value);
    if (sel) sel.addEventListener('change', () => {
      el.querySelector('#wx-7day').innerHTML = sevenDay(sel.value);
      el.querySelector('#wx-ag').innerHTML = agCards(sel.value);
      el.querySelector('#wx-ag-city').textContent = sel.value;
      redraw();
    });
    redraw();
    if (!window.__wxResize) { window.__wxResize = true; window.addEventListener('resize', () => { const c = document.getElementById('wx-chart'); const s = document.getElementById('wx-city'); if (c && s) drawChart(c, s.value); }); }
  }

  function tile(r) {
    const d = r.days[0]; const c = COND[d.cond] || COND['Sunny'];
    return `<div class="wx-tile"><div class="city">${r.city}<span class="ic">${c.icon}</span></div>
      <div class="temp">${d.hi}°<small> / ${d.lo}°C</small></div><div class="cond">${d.cond}</div>
      <div class="meta"><span>🌡️ feels ${d.feels}°</span><span>💧 ${d.rain}%</span><span>💨 ${d.wind} ${d.windDir}</span><span>☀️ UV ${d.uv}</span></div></div>`;
  }
  function sevenDay(city) {
    const r = DATA.regions.find(x => x.city === city) || DATA.regions[0];
    return r.days.map((d, i) => { const c = COND[d.cond] || COND['Sunny']; return `<div class="wx-d ${i === 0 ? 'today' : ''}"><div class="day">${d.label}</div><div class="dt">${d.dateStr}</div><div class="ic">${c.icon}</div><div class="hl">${d.hi}°<small>/${d.lo}°</small></div><div class="rn">💧 ${d.rain}%</div><div class="mm">${d.precip ? d.precip + ' mm' : '—'}</div></div>`; }).join('');
  }
  function agCards(city) {
    const r = DATA.regions.find(x => x.city === city) || DATA.regions[0]; const a = r.ag;
    return `
      <div class="a"><div class="k">Soil moisture</div><div class="v">${a.soil}%</div><div class="s">${a.soil < 25 ? 'Low — watch crops' : a.soil > 45 ? 'Good reserve' : 'Moderate'}</div></div>
      <div class="a"><div class="k">Evapotranspiration</div><div class="v">${a.et} mm/day</div><div class="s">crop water demand</div></div>
      <div class="a"><div class="k">7-day rainfall</div><div class="v">${a.wkRain} mm</div><div class="s">expected total</div></div>
      <div class="a"><div class="k">Irrigation</div><div class="v" style="font-size:13px">${a.irrig}</div><div class="s">advisory</div></div>
      <div class="a"><div class="k">Spraying window</div><div class="v" style="font-size:13px">${a.spray}</div><div class="s">today</div></div>
      <div class="a"><div class="k">Harvest</div><div class="v" style="font-size:13px">${a.harvest}</div><div class="s">next 3 days</div></div>`;
  }

  // Temperature (hi/lo lines) + rainfall (bars) over 7 days.
  function drawChart(canvas, city) {
    if (!canvas) return;
    const r = DATA.regions.find(x => x.city === city) || DATA.regions[0];
    const data = r.days;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const pad = { l: 34, r: 34, t: 14, b: 22 };
    const w = rect.width - pad.l - pad.r, h = rect.height - pad.t - pad.b;
    const tmax = Math.max(...data.map(d => d.hi)) + 2, tmin = Math.min(...data.map(d => d.lo)) - 2;
    const pmax = Math.max(10, ...data.map(d => d.precip)) * 1.2;
    const xs = i => pad.l + (i + 0.5) / data.length * w;
    const yt = v => pad.t + h - ((v - tmin) / (tmax - tmin || 1)) * h;
    const yp = v => pad.t + h - (v / pmax) * h;
    // rainfall bars
    const bw = (w / data.length) * 0.5;
    data.forEach((d, i) => { if (d.precip > 0) { ctx.fillStyle = 'rgba(31,95,166,0.35)'; const y = yp(d.precip); ctx.fillRect(xs(i) - bw / 2, y, bw, pad.t + h - y); } });
    // hi line
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.beginPath();
    data.forEach((d, i) => { const x = xs(i), y = yt(d.hi); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();
    // lo line
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.beginPath();
    data.forEach((d, i) => { const x = xs(i), y = yt(d.lo); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();
    // labels
    ctx.font = '10px -apple-system, sans-serif'; ctx.textAlign = 'center';
    data.forEach((d, i) => {
      ctx.fillStyle = '#c0392b'; ctx.fillText(d.hi + '°', xs(i), yt(d.hi) - 6);
      ctx.fillStyle = '#2563eb'; ctx.fillText(d.lo + '°', xs(i), yt(d.lo) + 13);
      ctx.fillStyle = '#94a3b8'; ctx.fillText(d.label === 'Today' ? 'Now' : d.label, xs(i), rect.height - 6);
    });
    ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.fillText('°C', 6, pad.t + 4);
    ctx.textAlign = 'right'; ctx.fillStyle = '#1f5fa6'; ctx.fillText('mm', rect.width - 6, pad.t + 4); ctx.textAlign = 'left';
  }

  return { generate, render };
})();
