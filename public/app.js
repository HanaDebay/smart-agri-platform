const state = {
  token: localStorage.getItem('smart_agri_token'),
  user: JSON.parse(localStorage.getItem('smart_agri_user') || 'null'),
  farms: [],
  activeFarm: null
};

const pages = {
  dashboard: 'Dashboard',
  soil: 'Soil Input',
  history: 'History',
  automation: 'Irrigation',
  profile: 'Profile'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function iconRefresh() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

function setSession({ token, user }) {
  state.token = token;
  state.user = user;
  localStorage.setItem('smart_agri_token', token);
  localStorage.setItem('smart_agri_user', JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  state.farms = [];
  state.activeFarm = null;
  localStorage.removeItem('smart_agri_token');
  localStorage.removeItem('smart_agri_user');
}

function showApp(isLoggedIn) {
  $('#authPanel').classList.toggle('hidden', isLoggedIn);
  $$('.view').forEach((view) => view.classList.toggle('active', isLoggedIn && view.id === 'dashboardView'));
  $$('.nav-item, #logoutBtn').forEach((item) => item.style.display = isLoggedIn ? 'flex' : 'none');
  if (isLoggedIn) {
    setView('dashboard');
  }
}

function setView(view) {
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `${view}View`));
  $('#pageTitle').textContent = pages[view];
  if (view === 'history') loadHistory();
  if (view === 'automation') renderFarms();
  if (view === 'profile') fillProfile();
}

function setStatus(online) {
  const status = $('#apiStatus');
  status.classList.toggle('online', online);
  status.lastChild.textContent = online ? 'Online' : 'Offline';
}

function adviceHtml(rec) {
  if (!rec) return '<span class="muted">No recommendation yet. Add soil data to get started.</span>';
  return `
    <div class="advice-item">
      <span class="severity ${rec.severity}">${rec.severity}</span>
      <strong>${rec.crop}</strong>
      <p>${rec.irrigation}</p>
    </div>
    <div class="advice-item"><strong>Fertilizer</strong><p>${rec.fertilizer.join(' ')}</p></div>
    <div class="advice-item"><strong>Soil correction</strong><p>${rec.soilCorrection.join(' ')}</p></div>
    <div class="advice-item"><strong>Biofortification</strong><p>${rec.biofortifiedCrop}</p></div>
    <div class="advice-item"><strong>Actions</strong><p>${rec.actions.join(' ')}</p></div>
  `;
}

function renderDashboard(data) {
  const soil = data.latestSoil;
  $('#metricMoisture').textContent = soil ? `${soil.moisture}%` : '--';
  $('#metricPh').textContent = soil ? soil.ph.toFixed(1) : '--';
  $('#metricNpk').textContent = soil ? `${soil.nitrogen}/${soil.phosphorus}/${soil.potassium}` : '--';
  $('#metricAlerts').textContent = data.notifications.length;
  $('#latestRecommendation').innerHTML = adviceHtml(data.recommendations[0]);
  $('#notificationList').innerHTML = data.notifications.length
    ? data.notifications.map((item) => `
      <div class="notice">
        <strong>${item.title}</strong>
        <span>${item.message}</span>
      </div>
    `).join('')
    : '<span class="muted">No alerts.</span>';
  state.farms = data.farms;
  state.activeFarm = data.farms[0] || null;
  iconRefresh();
}

async function loadDashboard() {
  if (!state.token) return;
  try {
    const data = await api('/api/dashboard');
    renderDashboard(data);
    setStatus(true);
  } catch (error) {
    setStatus(false);
  }
}

async function loadHistory() {
  try {
    const { records } = await api('/api/soil-data');
    $('#historyTable').innerHTML = records.map((row) => `
      <tr>
        <td>${new Date(row.createdAt).toLocaleDateString()}</td>
        <td>${row.crop}</td>
        <td>${row.moisture}%</td>
        <td>${row.ph}</td>
        <td>${row.nitrogen}</td>
        <td>${row.phosphorus}</td>
        <td>${row.potassium}</td>
      </tr>
    `).join('') || '<tr><td colspan="7">No records yet.</td></tr>';
  } catch (error) {
    $('#historyTable').innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
  }
}

function renderFarms() {
  $('#farmList').innerHTML = state.farms.length
    ? state.farms.map((farm) => `
      <div class="farm-row">
        <strong>${farm.name}</strong>
        <span>${farm.location || 'No location'} · ${farm.irrigationMode} · Pump ${farm.pumpEnabled ? 'on' : 'off'}</span>
      </div>
    `).join('')
    : '<span class="muted">No farm record found.</span>';
  $('#pumpState').textContent = state.activeFarm?.pumpEnabled ? 'Pump running' : 'Pump ready';
  iconRefresh();
}

function fillProfile() {
  if (!state.user) return;
  const form = $('#profileForm');
  form.elements.name.value = state.user.name || '';
  form.elements.location.value = state.user.location || '';
  form.elements.farmSize.value = state.user.farmSize || 0;
}

function setupEvents() {
  $$('.nav-item').forEach((item) => {
    item.addEventListener('click', () => setView(item.dataset.view));
  });

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((button) => button.classList.toggle('active', button === tab));
      $('#loginForm').classList.toggle('hidden', tab.dataset.authTab !== 'login');
      $('#registerForm').classList.toggle('hidden', tab.dataset.authTab !== 'register');
      $('#authMessage').textContent = '';
    });
  });

  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#authMessage').textContent = '';
    try {
      const form = Object.fromEntries(new FormData(event.target));
      const session = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(form) });
      setSession(session);
      showApp(true);
      await loadDashboard();
    } catch (error) {
      $('#authMessage').textContent = error.message;
    }
  });

  $('#registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#authMessage').textContent = '';
    try {
      const form = Object.fromEntries(new FormData(event.target));
      const session = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(form) });
      setSession(session);
      showApp(true);
      await loadDashboard();
    } catch (error) {
      $('#authMessage').textContent = error.message;
    }
  });

  $('#soilForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#soilMessage').textContent = '';
    try {
      const form = Object.fromEntries(new FormData(event.target));
      const data = await api('/api/soil-data', {
        method: 'POST',
        body: JSON.stringify({ ...form, farm: state.activeFarm?._id })
      });
      $('#generatedAdvice').innerHTML = adviceHtml(data.recommendation);
      $('#soilMessage').textContent = 'Saved. Dashboard and history updated.';
      $('#soilMessage').style.color = 'var(--green)';
      await loadDashboard();
    } catch (error) {
      $('#soilMessage').style.color = 'var(--danger)';
      $('#soilMessage').textContent = error.message;
    }
  });

  $('#profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = Object.fromEntries(new FormData(event.target));
      const { user } = await api('/api/profile', { method: 'PUT', body: JSON.stringify(form) });
      state.user = user;
      localStorage.setItem('smart_agri_user', JSON.stringify(user));
      $('#profileMessage').style.color = 'var(--green)';
      $('#profileMessage').textContent = 'Profile saved.';
    } catch (error) {
      $('#profileMessage').style.color = 'var(--danger)';
      $('#profileMessage').textContent = error.message;
    }
  });

  $('#pumpToggle').addEventListener('click', async () => {
    if (!state.activeFarm) return;
    const next = !state.activeFarm.pumpEnabled;
    const { farm } = await api(`/api/farms/${state.activeFarm._id}/irrigation`, {
      method: 'PATCH',
      body: JSON.stringify({ pumpEnabled: next })
    });
    state.activeFarm = farm;
    state.farms = state.farms.map((item) => item._id === farm._id ? farm : item);
    renderFarms();
  });

  $('#logoutBtn').addEventListener('click', () => {
    clearSession();
    showApp(false);
  });
}

async function init() {
  setupEvents();
  iconRefresh();
  showApp(Boolean(state.token));
  try {
    await api('/api/health');
    setStatus(true);
  } catch {
    setStatus(false);
  }
  if (state.token) {
    await loadDashboard();
  }
}

document.addEventListener('DOMContentLoaded', init);
