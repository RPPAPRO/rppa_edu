// Loader + toast
const loaderEl = document.getElementById('loader');
const toastsEl = document.getElementById('toasts');

function startLoading(){ if(loaderEl){ loaderEl.style.width='25%'; setTimeout(()=>loaderEl.style.width='80%',10); } }
function stopLoading(){ if(loaderEl){ loaderEl.style.width='100%'; setTimeout(()=>loaderEl.style.width='0',350); } }

function toast(msg, kind='ok', timeout=2600){
  if(!toastsEl) return alert(msg);
  const el = document.createElement('div');
  el.className = 'toast '+kind; el.textContent = msg;
  toastsEl.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),260); }, timeout);
}

// Request wrapper + status helpers
function setStatus(where, code, ms){
  const s = document.getElementById(`${where}-status`);
  const t = document.getElementById(`${where}-time`);
  if(!s || !t) return;
  s.textContent = 'status: '+code;
  t.textContent = 'time: '+ms+' ms';
  s.className = 'badge ' + (code>=200 && code<300 ? 'ok' : 'err');
}
function errText(err){
  if(!err) return 'Unknown error';
  if(err.data) try{return JSON.stringify(err.data,null,2)}catch{ return String(err) }
  return String(err.message||err);
}
async function apiRequest(where, method, url, body){
  const t0 = performance.now(); startLoading();
  try{
    const res = await fetch(url, {
      method,
      headers: body ? { 'content-type':'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data; try{ data = text ? JSON.parse(text) : null; } catch{ data = { raw:text }; }
    const dt = Math.round(performance.now() - t0);
    setStatus(where, res.status, dt);
    if(!res.ok){
      const e = new Error((data && data.error) || text || res.statusText);
      e.status = res.status; e.data = data; throw e;
    }
    return data;
  } finally { stopLoading(); }
}

// Small utils
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Hash router for per-page subsections
function initHashRouter(navSelector, defaultRoute='/list', onChange){
  const nav = document.querySelector(navSelector);
  function setActive(route){
    if(nav) [...nav.querySelectorAll('a')].forEach(a=>a.classList.toggle('active', a.dataset.route===route));
    [...document.querySelectorAll('.route')].forEach(s=>s.hidden = s.dataset.route !== route);
  }
  function go(){
    const route = (location.hash.slice(1) || defaultRoute);
    setActive(route);
    if(typeof onChange==='function') onChange(route);
  }
  window.addEventListener('hashchange', go);
  if(!location.hash) location.hash = '#'+defaultRoute;
  go();
}

// Logout helper
function bindLogout(selector){
  const btn = document.querySelector(selector);
  if(!btn) return;
  btn.addEventListener('click', async ()=>{
    await apiRequest('logout','POST','/api/auth/logout').catch(()=>{});
    location.href = '/login.html';
  });
}
