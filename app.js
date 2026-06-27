/* =========================================================
   InsperPrep — app.js
   Complete application logic: auth, data, AI tools, UI
   ========================================================= */

'use strict';

// ── CONFIG ──────────────────────────────────────────────────
const PROVA_DATE = new Date('2025-10-10T13:00:00');
const START_DATE = new Date('2025-06-15T00:00:00');
const TOTAL_DAYS = Math.ceil((PROVA_DATE - START_DATE) / 86400000);
const API_URL = 'https://api.anthropic.com/v1/messages';

// ── STORAGE HELPERS ─────────────────────────────────────────
const LS = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  rm: (k) => localStorage.removeItem(k)
};

// ── STATE ────────────────────────────────────────────────────
let currentUser = null;
let currentFlashcards = [];
let fcIndex = 0;
let fcCorrect = 0;
let fcIsFlipped = false;
let qCorrect = 0;
let qWrong = 0;
let tutorHistory = [];
let tutorIsLoading = false;
let currentPage = 'dashboard';

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = LS.get('insper_current_user');
  if (saved) {
    currentUser = saved;
    bootApp();
  } else {
    showAuthScreen();
  }
  startCountdown();
});

// ── AUTH ─────────────────────────────────────────────────────
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showLogin() {
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
}
function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
}
function togglePw(id) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
function getUsers() { return LS.get('insper_users') || {}; }
function saveUsers(u) { LS.set('insper_users', u); }

function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim().toLowerCase();
  const password = document.getElementById('reg-password').value;
  const course = document.getElementById('reg-course').value;
  const err = document.getElementById('reg-error');
  err.classList.add('hidden');

  if (!name || !username || !password || !course) { err.textContent = 'Preencha todos os campos.'; err.classList.remove('hidden'); return; }
  if (username.length < 3) { err.textContent = 'Usuário deve ter ao menos 3 caracteres.'; err.classList.remove('hidden'); return; }
  if (password.length < 4) { err.textContent = 'Senha deve ter ao menos 4 caracteres.'; err.classList.remove('hidden'); return; }

  const users = getUsers();
  if (users[username]) { err.textContent = 'Esse nome de usuário já está em uso.'; err.classList.remove('hidden'); return; }

  const user = {
    name, username, password, course,
    avatar: '', banner: '', bio: '',
    xp: 0, streak: 0, maxStreak: 0,
    lastLogin: new Date().toDateString(),
    redacoes: 0, simulados: 0, flashcardsGenerated: 0,
    weeksDone: {}, topicsDone: {}, tasksDone: {},
    notes: { mat: '', red: '', port: '', hum: '', nat: '' },
    highlights: { mat: [], red: [], port: [], hum: [], nat: [] },
    createdAt: Date.now()
  };
  users[username] = user;
  saveUsers(users);
  currentUser = user;
  LS.set('insper_current_user', user);
  bootApp();
}

function doLogin() {
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.classList.add('hidden');

  if (!username || !password) { err.textContent = 'Preencha usuário e senha.'; err.classList.remove('hidden'); return; }
  const users = getUsers();
  const user = users[username];
  if (!user || user.password !== password) { err.textContent = 'Usuário ou senha incorretos.'; err.classList.remove('hidden'); return; }

  // Streak logic
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (user.lastLogin === yesterday) {
    user.streak = (user.streak || 0) + 1;
    user.maxStreak = Math.max(user.maxStreak || 0, user.streak);
  } else if (user.lastLogin !== today) {
    user.streak = 1;
  }
  user.lastLogin = today;
  users[username] = user;
  saveUsers(users);

  currentUser = user;
  LS.set('insper_current_user', user);
  bootApp();
}

function doLogout() {
  LS.rm('insper_current_user');
  currentUser = null;
  location.reload();
}

// ── SAVE USER ────────────────────────────────────────────────
function saveCurrentUser() {
  const users = getUsers();
  users[currentUser.username] = currentUser;
  saveUsers(users);
  LS.set('insper_current_user', currentUser);
}

// ── BOOT ─────────────────────────────────────────────────────
function bootApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  updateTopbar();
  renderDashboard();
  populateSubjectPages();
  renderCronograma();
  renderRotina(0);
  renderPerfil();
  navigateTo('dashboard');
}

// ── NAVIGATION ───────────────────────────────────────────────
function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  closeSidebar();
  window.scrollTo(0, 0);
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  let overlay = document.getElementById('sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.className = 'sidebar-overlay';
    overlay.onclick = closeSidebar;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.classList.remove('active');
}

// ── TOPBAR ───────────────────────────────────────────────────
function updateTopbar() {
  document.getElementById('streak-count').textContent = currentUser.streak || 0;
  const img = document.getElementById('topbar-avatar-img');
  img.src = currentUser.avatar || generateAvatarSvg(currentUser.name);
}

function generateAvatarSvg(name) {
  const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const colors = ['7c3aed', 'a855f7', '06b6d4', '10b981', 'f59e0b', 'f43f5e'];
  const color = colors[name.charCodeAt(0) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#${color}"/><text x="50" y="64" text-anchor="middle" font-family="Inter,sans-serif" font-weight="800" font-size="38" fill="white">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ── COUNTDOWN ────────────────────────────────────────────────
function startCountdown() {
  updateCountdown();
  setInterval(updateCountdown, 60000);
}
function updateCountdown() {
  const now = new Date();
  const diff = PROVA_DATE - now;
  if (diff <= 0) {
    document.getElementById('countdown-text').textContent = '🎯 Dia da Prova!';
    return;
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  document.getElementById('countdown-text').textContent = `${days}d ${hours}h para a prova`;
}

// ── DASHBOARD ────────────────────────────────────────────────
function renderDashboard() {
  const now = new Date();
  document.getElementById('dash-welcome').textContent = currentUser.name.split(' ')[0];
  document.getElementById('dash-xp').textContent = currentUser.xp || 0;

  const daysLeft = Math.max(0, Math.ceil((PROVA_DATE - now) / 86400000));
  const daysPassed = Math.max(0, Math.floor((now - START_DATE) / 86400000));
  const pct = Math.min(100, Math.round((daysPassed / TOTAL_DAYS) * 100));

  document.getElementById('hero-days').textContent = daysLeft;
  document.getElementById('hs-weeks').textContent = Math.ceil(daysLeft / 7);
  document.getElementById('hs-days').textContent = daysPassed;
  document.getElementById('hs-streak').textContent = currentUser.streak || 0;
  document.getElementById('hs-redacoes').textContent = currentUser.redacoes || 0;
  document.getElementById('hero-progress-bar').style.width = pct + '%';
  document.getElementById('hero-progress-label').textContent = `${pct}% do caminho percorrido (${daysPassed} de ${TOTAL_DAYS} dias)`;

  renderTodayTasks(now);
  renderSubjectsGrid();
}

const DAY_SUBJECTS = ['Matemática', 'Biologia', 'Química', 'Física', 'Ciências Humanas', 'Simulado', 'Português + Redação'];
const DAY_ICONS = ['fa-square-root-variable', 'fa-dna', 'fa-flask', 'fa-bolt', 'fa-globe', 'fa-chart-bar', 'fa-pen-nib'];
const DAY_COLORS = ['#a855f7', '#10b981', '#06b6d4', '#f59e0b', '#f59e0b', '#f43f5e', '#06b6d4'];
const DAY_DURATIONS = ['5-6h', '2-3h', '2-3h', '2-3h', '5h', '4-5h', '4-5h'];

function renderTodayTasks(now) {
  const dow = now.getDay(); // 0=Sun,1=Mon...
  const dayIndex = dow === 0 ? 6 : dow - 1; // 0=Mon,6=Sun
  document.getElementById('today-subject-label').textContent = DAY_SUBJECTS[dayIndex];

  const week = getCurrentWeekNum(now);
  const tasks = getTodayTasks(dayIndex, week);
  const container = document.getElementById('today-tasks');
  container.innerHTML = '';

  tasks.forEach((task, i) => {
    const key = `${now.toDateString()}_${i}`;
    const done = (currentUser.tasksDone || {})[key];
    const card = document.createElement('div');
    card.className = `task-card ${done ? 'done' : ''}`;
    card.onclick = () => toggleTask(key, card, task.title);
    card.innerHTML = `
      <div class="task-check">${done ? '<i class="fa-solid fa-check"></i>' : ''}</div>
      <div class="task-body">
        <div class="task-title">${task.title}</div>
        <div class="task-meta">${task.meta}</div>
      </div>
      <div class="task-duration">${task.duration}</div>
    `;
    container.appendChild(card);
  });
}

function toggleTask(key, card, title) {
  if (!currentUser.tasksDone) currentUser.tasksDone = {};
  const done = !currentUser.tasksDone[key];
  currentUser.tasksDone[key] = done;
  if (done) { currentUser.xp = (currentUser.xp || 0) + 10; showToast(`✓ "${title}" concluído! +10 XP`, 'success'); }
  saveCurrentUser();
  card.classList.toggle('done', done);
  const check = card.querySelector('.task-check');
  check.innerHTML = done ? '<i class="fa-solid fa-check"></i>' : '';
  document.getElementById('dash-xp').textContent = currentUser.xp || 0;
}

function getTodayTasks(dayIndex, week) {
  const weekData = WEEK_DATA[week - 1] || WEEK_DATA[WEEK_DATA.length - 1];
  const tasks = [];
  switch (dayIndex) {
    case 0: // Segunda - Matemática
      tasks.push({ title: 'Recall — tópico anterior', meta: 'Resolva 3-5 exercícios sem consulta', duration: '20min' });
      tasks.push({ title: `Matemática — ${weekData.mat}`, meta: 'Estude a teoria + resumo próprio', duration: '60min' });
      tasks.push({ title: 'Exercícios do tópico novo', meta: 'Do mais fácil ao difícil, anote erros', duration: '2h' });
      tasks.push({ title: 'Intercalação', meta: 'Mix de tópicos das últimas semanas', duration: '40min' });
      break;
    case 1: // Terça - Biologia
      tasks.push({ title: 'Recall de Biologia', meta: 'Flashcards do tópico anterior', duration: '10min' });
      tasks.push({ title: `Biologia — ${weekData.bio}`, meta: 'Leitura ativa + mapa mental', duration: '50min' });
      tasks.push({ title: 'Flashcards do dia', meta: 'Termos-chave e conceitos', duration: '15min' });
      tasks.push({ title: 'Questões de prova', meta: '10-15 questões de vestibulares', duration: '50min' });
      break;
    case 2: // Quarta - Química
      tasks.push({ title: 'Recall de Química', meta: 'Flashcards rápidos', duration: '10min' });
      tasks.push({ title: `Química — ${weekData.qui}`, meta: 'Teoria + esquema visual', duration: '50min' });
      tasks.push({ title: 'Exercícios numéricos', meta: 'Cálculos e resoluções', duration: '40min' });
      tasks.push({ title: 'Questões de prova', meta: '10 questões cronometradas', duration: '40min' });
      break;
    case 3: // Quinta - Física
      tasks.push({ title: 'Recall de Física', meta: 'Conceitos e fórmulas', duration: '10min' });
      tasks.push({ title: `Física — ${weekData.fis}`, meta: 'Entenda o fenômeno antes da fórmula', duration: '50min' });
      tasks.push({ title: 'Resolução de exercícios', meta: 'Tente sempre antes de ver a resposta', duration: '60min' });
      tasks.push({ title: 'Questões de prova', meta: 'Exercícios de vestibulares', duration: '40min' });
      break;
    case 4: // Sexta - Humanas
      tasks.push({ title: 'Recall de Humanas', meta: 'Recall do tópico anterior', duration: '15min' });
      tasks.push({ title: `Humanas — ${weekData.hum}`, meta: 'Linha do tempo / mapa conceitual', duration: '90min' });
      tasks.push({ title: 'Conexão com redação', meta: 'Como usaria como repertório?', duration: '20min' });
      tasks.push({ title: 'Questões de prova', meta: 'Questões de vestibulares anteriores', duration: '2h' });
      break;
    case 5: // Sábado - Simulado
      tasks.push({ title: 'Simulado cronometrado', meta: 'Condição real — sem consulta, sem celular', duration: '4-5h' });
      tasks.push({ title: 'Correção ativa', meta: 'Entenda o raciocínio antes de ver a resposta', duration: '1h' });
      tasks.push({ title: 'Caderno de erros', meta: 'Anote o raciocínio errado, não só "errei"', duration: '30min' });
      break;
    case 6: // Domingo - Português + Redação
      tasks.push({ title: 'Recall de Português', meta: 'Tópico gramatical/literário anterior', duration: '15min' });
      tasks.push({ title: `Português — ${weekData.port}`, meta: 'Teoria + exercícios', duration: '90min' });
      tasks.push({ title: 'Redação completa', meta: 'Tema, rascunho, texto completo cronometrado', duration: '90min' });
      tasks.push({ title: 'Autocorreção Vunesp', meta: 'Releia com os 4 critérios como checklist', duration: '30min' });
      break;
  }
  return tasks;
}

function renderSubjectsGrid() {
  const subjects = [
    { key: 'mat', label: 'Matemática', icon: 'fa-square-root-variable', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', prio: '1', desc: 'Peso até 40%', page: 'matematica' },
    { key: 'red', label: 'Redação', icon: 'fa-pen-nib', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', prio: '2', desc: 'Eliminatória', page: 'redacao' },
    { key: 'port', label: 'Português', icon: 'fa-book-open', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)', prio: '3', desc: 'Peso 25-40%', page: 'portugues' },
    { key: 'hum', label: 'Humanas', icon: 'fa-globe', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', prio: '4', desc: 'Peso 25-30%', page: 'humanas' },
    { key: 'nat', label: 'Ciências da Natureza', icon: 'fa-flask', color: '#10b981', bg: 'rgba(16,185,129,0.12)', prio: '5', desc: 'Peso 10%', page: 'natureza' },
  ];
  const grid = document.getElementById('subjects-grid');
  grid.innerHTML = '';
  subjects.forEach(s => {
    const done = Object.keys((currentUser.topicsDone || {})).filter(k => k.startsWith(s.key) && currentUser.topicsDone[k]).length;
    const total = getTopicsForSubject(s.key).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const card = document.createElement('div');
    card.className = 'subject-card';
    card.onclick = () => navigateTo(s.page);
    card.innerHTML = `
      <div class="subject-card-header">
        <div class="subject-icon" style="background:${s.bg};color:${s.color}"><i class="fa-solid ${s.icon}"></i></div>
        <span class="subject-priority" style="color:${s.color}">P${s.prio}</span>
      </div>
      <h3>${s.label}</h3>
      <p>${s.desc}</p>
      <div class="subject-progress-wrap">
        <div class="subject-progress-fill" style="width:${pct}%;background:${s.color}"></div>
      </div>
      <div class="subject-progress-label">${pct}% dos tópicos concluídos</div>
    `;
    grid.appendChild(card);
  });
}

// ── CRONOGRAMA ───────────────────────────────────────────────
function getCurrentWeekNum(date) {
  const diff = date - START_DATE;
  return Math.min(17, Math.max(1, Math.ceil(diff / 604800000)));
}

const WEEK_DATA = [
  { num: 1, dates: '15–21/jun', mat: 'Conjuntos, razão e proporção', bio: 'Ecologia básica', qui: 'Estrutura atômica e tabela periódica', fis: 'Cinemática (MU, MUV)', hum: 'História Geral + cartografia', port: 'Classes de palavras, concordância verbal', phase: 'Fundamentos', phaseColor: '#06b6d4' },
  { num: 2, dates: '22–28/jun', mat: 'Porcentagem, juros simples e compostos', bio: 'Impactos ambientais', qui: 'Ligações químicas', fis: 'Leis de Newton', hum: 'Iluminismo e Revolução Industrial', port: 'Regência, crase', phase: 'Fundamentos', phaseColor: '#06b6d4' },
  { num: 3, dates: '29/jun–05/jul', mat: 'Sequências: PA e PG', bio: 'Citologia básica', qui: 'Funções inorgânicas', fis: 'Trabalho, energia, potência', hum: 'Revolução Francesa, séc. XIX', port: 'Coesão, conectivos', phase: 'Fundamentos', phaseColor: '#06b6d4' },
  { num: 4, dates: '06–12/jul', mat: 'Função do 1º grau', bio: 'Genética — 1ª e 2ª Lei de Mendel', qui: 'Reações e estequiometria', fis: 'Hidrostática', hum: 'Guerras Mundiais, Guerra Fria', port: 'Figuras de linguagem', phase: 'Fundamentos', phaseColor: '#06b6d4' },
  { num: 5, dates: '13–19/jul', mat: 'Função do 2º grau', bio: 'Genética — grupos sanguíneos', qui: 'Soluções', fis: 'Termologia básica', hum: 'Brasil Colônia e Império', port: 'Literatura: Trovadorismo ao Arcadismo', phase: 'Aprofundamento', phaseColor: '#a855f7' },
  { num: 6, dates: '20–26/jul', mat: 'Função exponencial e logarítmica', bio: 'Corpo humano — digestório, circulatório', qui: 'Termoquímica básica', fis: 'Eletricidade básica', hum: 'Primeira República e Era Vargas ⭐', port: 'Romantismo e Realismo (Machado)', phase: 'Aprofundamento', phaseColor: '#a855f7' },
  { num: 7, dates: '27/jul–02/ago', mat: 'Estatística', bio: 'Corpo humano — doenças', qui: 'Química orgânica', fis: 'Óptica básica', hum: 'Regime Militar e Redemocratização ⭐', port: 'Parnasianismo, Simbolismo, Pré-Modernismo', phase: 'Aprofundamento', phaseColor: '#a855f7' },
  { num: 8, dates: '03–09/ago', mat: 'Análise combinatória', bio: 'Evolução', qui: 'Polímeros e química do cotidiano', fis: 'Ondas e som básico', hum: 'Geopolítica, blocos econômicos', port: 'Modernismo e Pós-Modernismo', phase: 'Aprofundamento', phaseColor: '#a855f7' },
  { num: 9, dates: '10–16/ago', mat: 'Probabilidade', bio: 'Revisão 1 (ecologia + genética)', qui: 'Revisão 1', fis: 'Revisão 1', hum: 'Questão ambiental, sustentabilidade', port: 'Literatura portuguesa', phase: 'Consolidação', phaseColor: '#f59e0b' },
  { num: 10, dates: '17–23/ago', mat: 'Geometria plana', bio: 'Revisão 2 (corpo humano + evolução)', qui: 'Eletroquímica básica', fis: 'Eletromagnetismo básico', hum: 'População, urbanização, espaço rural', port: 'Literaturas africana e indígena', phase: 'Consolidação', phaseColor: '#f59e0b' },
  { num: 11, dates: '24–30/ago', mat: 'Geometria espacial', bio: 'Biotecnologia', qui: 'Radioatividade básica', fis: 'Física moderna', hum: 'Sociologia — Durkheim, Weber, Marx', port: 'Revisão gramatical geral', phase: 'Consolidação', phaseColor: '#f59e0b' },
  { num: 12, dates: '31/ago–06/set', mat: 'Trigonometria', bio: 'Revisão geral com questões', qui: 'Revisão geral com questões', fis: 'Revisão geral com questões', hum: 'Sociologia — cultura, indústria cultural', port: 'Interpretação de textos longos', phase: 'Consolidação', phaseColor: '#f59e0b' },
  { num: 13, dates: '07–13/set', mat: 'Sistemas lineares + revisão', bio: 'Simulado de Biologia', qui: 'Simulado de Química', fis: 'Simulado de Física', hum: 'Filosofia — ética, contratualismo', port: 'Revisão geral de Português', phase: 'Consolidação', phaseColor: '#f59e0b' },
  { num: 14, dates: '14–20/set', mat: 'Revisão geral 1 — caderno de erros', bio: 'Revisão leve rotativa', qui: 'Revisão leve rotativa', fis: 'Revisão leve rotativa', hum: 'Revisão cruzada — linha do tempo', port: 'Revisão focada nos erros recorrentes', phase: 'Simulados', phaseColor: '#f43f5e' },
  { num: 15, dates: '21–27/set', mat: 'Revisão geral 2 — provas anteriores', bio: 'Revisão leve rotativa', qui: 'Revisão leve rotativa', fis: 'Revisão leve rotativa', hum: 'Revisão 2 + questões de provas', port: 'Revisão leve, erros recorrentes', phase: 'Simulados', phaseColor: '#f43f5e' },
  { num: 16, dates: '28/set–04/out', mat: 'Simulado de Matemática + revisão', bio: 'Revisão leve rotativa', qui: 'Revisão leve rotativa', fis: 'Revisão leve rotativa', hum: 'Simulado de Humanas + revisão', port: 'Revisão leve, erros recorrentes', phase: 'Simulados', phaseColor: '#f43f5e' },
  { num: 17, dates: '05–10/out', mat: 'Revisão leve — só fórmulas', bio: 'Revisão das 3 (caderno de erros)', qui: 'Revisão das 3 (caderno de erros)', fis: 'Revisão das 3 (caderno de erros)', hum: 'Revisão leve', port: 'Última redação leve', phase: '🏁 Semana da Prova', phaseColor: '#f43f5e' },
];

function renderCronograma() {
  const now = new Date();
  const currentWeek = getCurrentWeekNum(now);
  const container = document.getElementById('cronograma-list');
  container.innerHTML = '';

  WEEK_DATA.forEach(w => {
    const isCurrent = w.num === currentWeek;
    const isDone = (currentUser.weeksDone || {})[w.num];
    const block = document.createElement('div');
    block.className = `week-block ${isCurrent ? 'current-week' : ''}`;

    block.innerHTML = `
      <div class="week-header ${isCurrent ? 'open' : ''}" onclick="toggleWeek(this)">
        <div class="week-num">S${w.num}</div>
        <div>
          <div style="font-weight:700;font-size:0.875rem">Semana ${w.num}</div>
          <div class="week-date">${w.dates}</div>
        </div>
        <span class="week-phase-badge" style="background:${w.phaseColor}22;color:${w.phaseColor}">${w.phase}</span>
        ${isCurrent ? '<span class="week-current-badge">▶ Agora</span>' : ''}
        ${isDone ? '<span style="color:#10b981;font-size:0.75rem;font-weight:700;">✓ Concluída</span>' : ''}
        <i class="fa-solid fa-chevron-down week-chevron"></i>
      </div>
      <div class="week-content ${isCurrent ? 'open' : ''}">
        <div class="week-subjects">
          <div class="wsub-card"><div class="wsub-dot" style="background:#a855f7"></div><div><div class="wsub-label">Mat</div><div class="wsub-topic">${w.mat}</div></div></div>
          <div class="wsub-card"><div class="wsub-dot" style="background:#06b6d4"></div><div><div class="wsub-label">Port</div><div class="wsub-topic">${w.port}</div></div></div>
          <div class="wsub-card"><div class="wsub-dot" style="background:#f59e0b"></div><div><div class="wsub-label">Humanas</div><div class="wsub-topic">${w.hum}</div></div></div>
          <div class="wsub-card"><div class="wsub-dot" style="background:#10b981"></div><div><div class="wsub-label">Bio</div><div class="wsub-topic">${w.bio}</div></div></div>
          <div class="wsub-card"><div class="wsub-dot" style="background:#06b6d4"></div><div><div class="wsub-label">Quím</div><div class="wsub-topic">${w.qui}</div></div></div>
          <div class="wsub-card"><div class="wsub-dot" style="background:#f59e0b"></div><div><div class="wsub-label">Fís</div><div class="wsub-topic">${w.fis}</div></div></div>
        </div>
        <div class="week-check">
          <span class="week-check-label">Marcar como concluída:</span>
          <button class="week-done-btn ${isDone ? 'done' : ''}" onclick="markWeekDone(${w.num}, this)">${isDone ? '✓ Concluída' : 'Marcar como feita'}</button>
        </div>
      </div>
    `;
    container.appendChild(block);
  });
}

function toggleWeek(header) {
  header.classList.toggle('open');
  const content = header.nextElementSibling;
  content.classList.toggle('open');
}

function markWeekDone(weekNum, btn) {
  if (!currentUser.weeksDone) currentUser.weeksDone = {};
  const done = !currentUser.weeksDone[weekNum];
  currentUser.weeksDone[weekNum] = done;
  if (done) { currentUser.xp = (currentUser.xp || 0) + 100; showToast(`Semana ${weekNum} concluída! +100 XP 🎉`, 'success'); }
  saveCurrentUser();
  btn.classList.toggle('done', done);
  btn.textContent = done ? '✓ Concluída' : 'Marcar como feita';
  document.getElementById('dash-xp').textContent = currentUser.xp || 0;
}

// ── ROTINA ───────────────────────────────────────────────────
const ROTINA_DATA = [
  {
    day: 'Segunda-feira', subject: 'Matemática', icon: 'fa-square-root-variable',
    color: '#a855f7', bg: 'rgba(168,85,247,0.15)', duration: '5–6h',
    steps: [
      { num: 1, title: 'Recall', duration: '15-20min', desc: 'Sem consultar nada, resolva de cor 3-5 exercícios do assunto da semana passada. Esse é o "espaçamento" funcionando.', tip: '🧠 Testing effect (Roediger & Karpicke): testar a si mesmo fixa muito mais que reler.' },
      { num: 2, title: 'Conteúdo novo', duration: '45-60min', desc: 'Estude a teoria do tópico do dia (vídeo-aula ou livro), fazendo seu próprio resumo ou esquema — nunca copiando.' },
      { num: 3, title: 'Exercícios do tópico novo', duration: '90-120min', desc: 'Do mais fácil ao mais difícil. Tente sempre resolver antes de olhar a resposta. Errou? Anote no caderno de erros: qual foi o erro de raciocínio, não só "errei a conta".', tip: '⚡ Efeito de geração: tentar resolver antes de olhar a resposta fixa muito mais.' },
      { num: 4, title: 'Intercalação', duration: '30-40min', desc: 'Resolva 8-10 questões misturando o tópico de hoje com tópicos de semanas anteriores, fora de ordem. Isso treina identificar qual estratégia usar sem dica do contexto.', tip: '🔀 Interleaving (Rohrer & Taylor): misturar tópicos gera retenção muito maior.' },
      { num: 5, title: 'Fechamento', duration: '10min', desc: 'Explique em voz alta o que aprendeu hoje, como se estivesse ensinando alguém.', tip: '🗣️ Técnica Feynman: explicar expõe rapidamente o que você não entendeu de fato.' },
    ]
  },
  {
    day: 'Terça-feira', subject: 'Biologia', icon: 'fa-dna',
    color: '#10b981', bg: 'rgba(16,185,129,0.15)', duration: '2–3h',
    steps: [
      { num: 1, title: 'Recall rápido', duration: '10min', desc: 'Flashcards do tópico da semana anterior. Biologia tem muito vocabulário técnico — cartões são eficientes.' },
      { num: 2, title: 'Leitura ativa + mapa mental', duration: '40-50min', desc: 'Leia o tópico do dia e crie 1 esquema visual ou mapa mental. Não releia o texto, desenhe o que entendeu.', tip: '🎨 Dual coding (Paivio): combinar texto com esquema visual ajuda muito em conteúdos narrativos.' },
      { num: 3, title: 'Flashcards do dia', duration: '15min', desc: 'Crie flashcards dos termos-chave do dia. Tente gerar com a IA da plataforma!' },
      { num: 4, title: 'Questões de vestibulares', duration: '45-60min', desc: '10-15 questões de provas anteriores sobre o tema. Simule a condição real de prova.' },
    ]
  },
  {
    day: 'Quarta-feira', subject: 'Química', icon: 'fa-flask',
    color: '#06b6d4', bg: 'rgba(6,182,212,0.15)', duration: '2–3h',
    steps: [
      { num: 1, title: 'Recall rápido', duration: '10min', desc: 'Flashcards do tópico anterior de Química.' },
      { num: 2, title: 'Teoria + esquema visual', duration: '40-50min', desc: 'Estude o tópico do dia com criação de esquema — igual à estrutura da terça.' },
      { num: 3, title: 'Exercícios numéricos', duration: '30-40min', desc: 'Extra para tópicos com cálculo (estequiometria, concentração). Não pule essa etapa.' },
      { num: 4, title: 'Questões de vestibulares', duration: '40min', desc: '10 questões cronometradas de provas anteriores.' },
    ]
  },
  {
    day: 'Quinta-feira', subject: 'Física', icon: 'fa-bolt',
    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', duration: '2–3h',
    steps: [
      { num: 1, title: 'Recall + conceito do dia', duration: '10min', desc: 'Fórmulas e conceitos do tópico anterior.' },
      { num: 2, title: 'Fenômeno antes da fórmula', duration: '50min', desc: 'Entenda o porquê do fenômeno antes da fórmula. Conecte com um exemplo do dia a dia.', tip: '⚠️ Física pune quem memoriza fórmula sem entender o conceito.' },
      { num: 3, title: 'Resolução de exercícios', duration: '60min', desc: 'Sempre tente resolver antes de ver a resposta. Raciocínio primeiro, matemática depois.' },
      { num: 4, title: 'Questões de prova', duration: '40min', desc: 'Exercícios de vestibulares anteriores com cronômetro.' },
    ]
  },
  {
    day: 'Sexta-feira', subject: 'Ciências Humanas', icon: 'fa-globe',
    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', duration: '5h',
    steps: [
      { num: 1, title: 'Recall do tópico anterior', duration: '15min', desc: 'Recall rápido do que foi estudado na sexta passada.' },
      { num: 2, title: 'Leitura ativa + linha do tempo', duration: '60-90min', desc: 'Crie linha do tempo visual (História) ou mapa conceitual (Geo/Sociologia/Filosofia).', tip: '🎨 Dual coding: é o que funciona melhor para conteúdo narrativo.' },
      { num: 3, title: 'Conexão com redação', duration: '20min', desc: 'Pergunte: "como usaria esse conteúdo como repertório em uma redação?" Isso mata dois coelhos: fixa o conteúdo E constrói seu banco de repertório.', tip: '🎯 Elaborative interrogation: conectar informações entre si gera retenção muito maior.' },
      { num: 4, title: 'Questões de vestibulares', duration: '90-120min', desc: 'Questões de provas anteriores sobre o tema — sempre cronometrado.' },
      { num: 5, title: 'Resumo falado', duration: '10min', desc: 'Fale em voz alta o que estudou hoje em 5 minutos. Se não conseguir, ainda não fixou.' },
    ]
  },
  {
    day: 'Sábado', subject: 'Simulados', icon: 'fa-chart-bar',
    color: '#f43f5e', bg: 'rgba(244,63,94,0.15)', duration: '4–5h',
    steps: [
      { num: 1, title: 'Simulado em condição real', duration: '4-5h', desc: 'Sempre com cronômetro, sem celular, sem consulta. De preferência no mesmo horário da prova real (13h-18h).', tip: '⏱️ Dificuldade desejável (Bjork): treinar em condição real de prova garante desempenho no dia.' },
      { num: 2, title: 'Correção ativa', duration: '1h', desc: 'Tente entender o raciocínio certo ANTES de ler a explicação. Só então atualize seu caderno de erros.' },
      { num: 3, title: 'Caderno de erros', duration: '30min', desc: 'Anote o raciocínio errado e o correto. Semanas 13-16: simulado completo de 5h com redação.' },
    ]
  },
  {
    day: 'Domingo', subject: 'Português + Redação', icon: 'fa-pen-nib',
    color: '#a855f7', bg: 'rgba(168,85,247,0.15)', duration: '4–5h',
    steps: [
      { num: 1, title: 'Recall de Português', duration: '15min', desc: 'Recall do tópico gramatical ou literário anterior.' },
      { num: 2, title: 'Estudo de Português', duration: '45min', desc: 'Teoria do tópico do dia + resumo próprio.' },
      { num: 3, title: 'Questões de Português', duration: '60min', desc: '15-20 questões sobre o tema de hoje.' },
      { num: 4, title: 'Redação completa', duration: '60-90min', desc: 'Leia o tema 2x. Rascunhe tese e argumentos. Escreva o texto completo cronometrado.', tip: '⚠️ Releia o tema 2x antes de começar — fuga ao tema = nota zero total.' },
      { num: 5, title: 'Autocorreção com checklist Vunesp', duration: '30min', desc: 'Releia com os 4 critérios: Tema / Estrutura-coerência / Língua / Coesão. Reescreva os trechos fracos.' },
    ]
  },
];

function selectRotinaDay(dayIndex) {
  document.querySelectorAll('.rotina-day-btn').forEach((b, i) => b.classList.toggle('active', i === dayIndex));
  renderRotina(dayIndex);
}

function renderRotina(dayIndex) {
  const d = ROTINA_DATA[dayIndex];
  const container = document.getElementById('rotina-content');
  container.innerHTML = `
    <div class="neuroscience-box">
      <h3><i class="fa-solid fa-brain"></i> Método baseado em neurociência — por que funciona</h3>
      <div class="neuro-grid">
        <div class="neuro-item"><div class="neuro-dot"></div><div class="neuro-text"><strong>Testing Effect:</strong> Testar a si mesmo fixa muito mais que reler</div></div>
        <div class="neuro-item"><div class="neuro-dot"></div><div class="neuro-text"><strong>Repetição espaçada:</strong> Revisar depois de dias gera retenção duradoura</div></div>
        <div class="neuro-item"><div class="neuro-dot"></div><div class="neuro-text"><strong>Intercalação:</strong> Misturar tópicos gera retenção muito maior que blocos isolados</div></div>
        <div class="neuro-item"><div class="neuro-dot"></div><div class="neuro-text"><strong>Blocos 50min + 10min pausa:</strong> Sustenta atenção plena ao longo do dia</div></div>
        <div class="neuro-item"><div class="neuro-dot"></div><div class="neuro-text"><strong>Dual coding:</strong> Texto + esquema visual = muito mais retenção</div></div>
        <div class="neuro-item"><div class="neuro-dot"></div><div class="neuro-text"><strong>Técnica Feynman:</strong> Explicar expõe o que você não entendeu de fato</div></div>
      </div>
    </div>
    <div class="rotina-day-content">
      <div class="rotina-day-header">
        <div class="rotina-day-icon" style="background:${d.bg};color:${d.color}"><i class="fa-solid ${d.icon}"></i></div>
        <div>
          <div class="rotina-day-title">${d.day}</div>
          <div class="rotina-day-subtitle">${d.subject}</div>
        </div>
        <div class="rotina-duration-chip"><i class="fa-solid fa-clock"></i> ${d.duration}</div>
      </div>
      <div class="rotina-steps">
        ${d.steps.map(s => `
          <div class="rotina-step">
            <div class="step-num">${s.num}</div>
            <div class="step-body">
              <div class="step-title">${s.title}</div>
              <div class="step-desc">${s.desc}</div>
              ${s.tip ? `<div class="step-tip">${s.tip}</div>` : ''}
            </div>
            <div class="step-duration">${s.duration}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── SUBJECT PAGES ────────────────────────────────────────────
function populateSubjectPages() {
  populateMatematica();
  populateRedacao();
  populatePortugues();
  populateHumanas();
  populateNatureza();
  loadNotes();
}

function openSubjTab(btn, tabId) {
  const tabs = btn.closest('.subject-tabs');
  tabs.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const page = btn.closest('.page');
  page.querySelectorAll('.stab-content').forEach(c => c.classList.remove('active'));
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
}

function getTopicsForSubject(key) {
  const map = { mat: MAT_TOPICOS, red: [], port: PORT_TOPICOS, hum: HUM_TOPICOS, nat: NAT_TOPICOS };
  return map[key] || [];
}

const MAT_TOPICOS = [
  { title: 'Funções do 1º grau', week: 4, freq: 'alto' },
  { title: 'Função quadrática (vértice, máx/mín)', week: 5, freq: 'alto' },
  { title: 'Porcentagem e juros compostos', week: 2, freq: 'alto' },
  { title: 'Estatística (médias, desvio padrão)', week: 7, freq: 'alto' },
  { title: 'Análise combinatória', week: 8, freq: 'medio' },
  { title: 'Probabilidade', week: 9, freq: 'medio' },
  { title: 'Geometria plana', week: 10, freq: 'medio' },
  { title: 'Função exponencial e logarítmica', week: 6, freq: 'medio' },
  { title: 'Progressões (PA e PG)', week: 3, freq: 'medio' },
  { title: 'Geometria espacial', week: 11, freq: 'baixo' },
  { title: 'Trigonometria', week: 12, freq: 'baixo' },
  { title: 'Sistemas lineares', week: 13, freq: 'baixo' },
];

const PORT_TOPICOS = [
  { title: 'Concordância verbal e nominal', week: 1, freq: 'alto' },
  { title: 'Regência e crase', week: 2, freq: 'alto' },
  { title: 'Figuras de linguagem', week: 4, freq: 'alto' },
  { title: 'Romantismo e Realismo (Machado)', week: 6, freq: 'alto' },
  { title: 'Modernismo (1922, 1930, 1945)', week: 8, freq: 'alto' },
  { title: 'Conectivos e coesão textual', week: 3, freq: 'alto' },
  { title: 'Interpretação de textos', week: 12, freq: 'medio' },
  { title: 'Literatura portuguesa', week: 9, freq: 'baixo' },
];

const HUM_TOPICOS = [
  { title: 'Primeira República e Era Vargas', week: 6, freq: 'alto' },
  { title: 'Regime Militar e Redemocratização', week: 7, freq: 'alto' },
  { title: 'Sociologia — Durkheim, Weber, Marx', week: 11, freq: 'alto' },
  { title: 'Imperialismo e Guerras Mundiais', week: 4, freq: 'medio' },
  { title: 'Geopolítica e blocos econômicos', week: 8, freq: 'medio' },
  { title: 'Questão ambiental e sustentabilidade', week: 9, freq: 'medio' },
  { title: 'Ética — virtudes, utilitarismo, dever', week: 13, freq: 'medio' },
  { title: 'Revolução Francesa e Iluminismo', week: 3, freq: 'medio' },
  { title: 'Brasil Colônia e Império', week: 5, freq: 'baixo' },
];

const NAT_TOPICOS = [
  { title: 'Ecologia e cadeias alimentares', week: 1, freq: 'alto' },
  { title: 'Genética básica (Mendel)', week: 4, freq: 'medio' },
  { title: 'Funções inorgânicas (ácidos, bases)', week: 3, freq: 'medio' },
  { title: 'Força, energia e trabalho (Física)', week: 3, freq: 'medio' },
  { title: 'Eletricidade básica', week: 6, freq: 'baixo' },
  { title: 'Química orgânica básica', week: 7, freq: 'baixo' },
];

function renderTopicos(containerId, topicos, subjKey) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  topicos.forEach((t, i) => {
    const key = `${subjKey}_${i}`;
    const done = (currentUser.topicsDone || {})[key];
    const el = document.createElement('div');
    el.className = `topico-item ${done ? 'done' : ''}`;
    el.onclick = () => toggleTopico(key, el);
    el.innerHTML = `
      <div class="topico-check">${done ? '<i class="fa-solid fa-check"></i>' : ''}</div>
      <span class="topico-title">${t.title}</span>
      <span class="topico-week">Sem. ${t.week}</span>
      <div class="topico-badges">
        <span class="resumo-freq-badge freq-${t.freq}">${t.freq === 'alto' ? '🔥 Alta frequência' : t.freq === 'medio' ? '⚡ Média' : '📝 Baixa'}</span>
      </div>
    `;
    container.appendChild(el);
  });
}

function toggleTopico(key, el) {
  if (!currentUser.topicsDone) currentUser.topicsDone = {};
  const done = !currentUser.topicsDone[key];
  currentUser.topicsDone[key] = done;
  if (done) { currentUser.xp = (currentUser.xp || 0) + 25; showToast('Tópico concluído! +25 XP', 'success'); }
  saveCurrentUser();
  el.classList.toggle('done', done);
  const check = el.querySelector('.topico-check');
  check.innerHTML = done ? '<i class="fa-solid fa-check"></i>' : '';
  renderSubjectsGrid();
  document.getElementById('dash-xp').textContent = currentUser.xp || 0;
}

function populateMatematica() {
  // Resumos
  const resumos = [
    { title: 'Funções (1º, 2º grau, Exp, Log)', freq: 'alto', diff: 4, body: `<p>Base de tudo em Matemática no Insper. Funções de 1º grau: y = ax + b (reta). O coeficiente <em>a</em> indica a inclinação e <em>b</em> o ponto onde corta o eixo y.</p><p>Função Quadrática: f(x) = ax² + bx + c. O <strong>vértice</strong> (ponto de máx/mín) é a parte mais cobrada: xv = -b/2a, yv = -Δ/4a.</p><div class="formula-box">Δ = b² - 4ac &nbsp;&nbsp;|&nbsp;&nbsp; xv = -b/2a &nbsp;&nbsp;|&nbsp;&nbsp; yv = -Δ/4a</div><p>Função exponencial: f(x) = aˣ, base > 0 e ≠ 1. Logarítmica: sua inversa. log_b(x) = y ↔ bʸ = x.</p>` },
    { title: 'Porcentagem e Juros', freq: 'alto', diff: 3, body: `<p>Praticamente garantido na prova do Insper (escola de negócios!). Juros simples: M = P(1 + it). Juros compostos: M = P(1 + i)ᵗ.</p><div class="formula-box">J.Simples: M = P(1+it) &nbsp;|&nbsp; J.Composto: M = P(1+i)ᵗ</div><p>Aumento/desconto sucessivos: um aumento de 20% e desconto de 20% NÃO resultam no mesmo valor. O fator de aumento/desconto é multiplicado!</p><ul><li>Porcentagem sobre porcentagem: 10% + 10% ≠ 20%</li><li>Desconto de x% sobre y% = y × (1 - x/100)</li></ul>` },
    { title: 'Estatística', freq: 'alto', diff: 3, body: `<p>Muito cobrado de forma contextualizada — gráficos, tabelas, dados do IBGE etc.</p><ul><li><strong>Média aritmética:</strong> soma ÷ quantidade</li><li><strong>Média ponderada:</strong> (Σ xi × pi) ÷ Σpi</li><li><strong>Mediana:</strong> valor central (ordene antes!)</li><li><strong>Moda:</strong> valor que mais se repete</li><li><strong>Desvio padrão:</strong> mede a dispersão dos dados em torno da média</li></ul><div class="formula-box">σ = √[ Σ(xi - x̄)² / n ]</div>` },
    { title: 'Análise Combinatória e Probabilidade', freq: 'medio', diff: 5, body: `<p><strong>Princípio multiplicativo:</strong> se uma coisa pode ser feita de m modos e outra de n, juntas podem ser feitas de m × n modos.</p><ul><li><strong>Arranjo:</strong> A(n,p) = n! / (n-p)! — ordem importa, sem repetição</li><li><strong>Combinação:</strong> C(n,p) = n! / [p!(n-p)!] — ordem não importa</li><li><strong>Probabilidade:</strong> P = casos favoráveis / casos totais</li><li><strong>Probabilidade condicional:</strong> P(A|B) = P(A∩B) / P(B)</li></ul>` },
    { title: 'Geometria Plana', freq: 'medio', diff: 3, body: `<p>Áreas e semelhança de triângulos são os mais cobrados.</p><ul><li>Triângulo: A = base × altura / 2</li><li>Círculo: A = πr², C = 2πr</li><li>Trapézio: A = (B + b) × h / 2</li><li>Teorema de Pitágoras: a² = b² + c²</li></ul><p><strong>Semelhança:</strong> triângulos semelhantes têm lados proporcionais e mesmos ângulos. A razão das áreas é o quadrado da razão dos lados.</p>` },
  ];
  const container = document.getElementById('resumo-mat');
  if (container) renderResumos(container, resumos, 'r-mat');
  renderTopicos('topicos-mat', MAT_TOPICOS, 'mat');

  const mac = document.getElementById('macetes-mat');
  if (mac) mac.innerHTML = `
    <div class="macete-card"><h4><i class="fa-solid fa-lightbulb"></i> Macete: Vértice da Parábola</h4><p>Para encontrar o vértice de ax² + bx + c: xv = -b/2a. Memorize assim: "meia-be negativo sobre 2a". O valor de yv substitua xv na função.</p></div>
    <div class="macete-card"><h4><i class="fa-solid fa-lightbulb"></i> Macete: Juros Compostos</h4><p>Taxa de 10% ao mês por 2 meses NÃO é 20%! É (1,1)² - 1 = 21%. O Insper adora pegar candidatos nessa armadilha.</p></div>
    <div class="tip-card"><h4><i class="fa-solid fa-circle-check"></i> Dica: Leitura de gráfico</h4><p>Estatística é quase sempre contextualizada com gráficos. Leia o eixo x e y com atenção antes de responder. Verifique se a escala começa em zero — é uma armadilha clássica.</p></div>
    <div class="alert-card"><h4><i class="fa-solid fa-triangle-exclamation"></i> Cuidado: Combinação vs Arranjo</h4><p>A diferença crucial: em combinação a ORDEM NÃO importa (escolher 3 pessoas de 10 para um grupo). Em arranjo a ORDEM IMPORTA (1º, 2º, 3º lugares). Sempre pergunte: trocar a ordem muda o resultado?</p></div>
    <div class="macete-card"><h4><i class="fa-solid fa-lightbulb"></i> Macete: Progressão Aritmética</h4><p>Soma dos termos de uma PA: S = n × (a1 + an) / 2. "Soma é a média dos extremos vezes o número de termos." Fácil de memorizar assim!</p></div>
  `;
}

function populateRedacao() {
  const resumo = document.getElementById('red-resumo');
  if (resumo) resumo.innerHTML = `
    <div class="macete-card"><h4><i class="fa-solid fa-pen-nib"></i> A Redação Vunesp em 1 parágrafo</h4>
    <p>Dissertação de 25 a 30 linhas, gênero dissertativo-argumentativo, com posicionamento claro (tese). Peso de 25% na nota final. Nota mínima 30 (em 100) — eliminatória. Não é obrigatória proposta de intervenção (diferente do Enem). Os 4 critérios têm peso igual: Tema, Estrutura/Coerência, Língua e Coesão.</p></div>
    <div class="alert-card"><h4><i class="fa-solid fa-skull"></i> O que ZERA a redação — decore para nunca cair</h4><ul style="color:var(--text-secondary);padding-left:16px;list-style:disc;line-height:1.8">
    <li>Fuga do tema ou do gênero proposto</li><li>Qualquer marca de identificação (nome, número etc.)</li>
    <li>Menos de 8 linhas autorais contínuas, ou cópia predominante da coletânea</li>
    <li>Letra predominantemente ilegível</li><li>Texto fora do espaço reservado</li></ul></div>
    <div class="tip-card"><h4><i class="fa-solid fa-info-circle"></i> Boas notícias que tiram a pressão</h4>
    <p>✓ Proposta de intervenção NÃO é obrigatória (diferente do Enem!)<br>
    ✓ O título não é considerado na nota do tema<br>
    ✓ Com 20 linhas ou menos você não alcança nota máxima em C e D — então escreva bastante!</p></div>
    <div class="macete-card"><h4><i class="fa-solid fa-diagram-project"></i> Estrutura recomendada</h4>
    <p><strong>1. Introdução (1 parágrafo):</strong> Apresente o tema com contextualização e sua tese de forma clara.<br>
    <strong>2. Desenvolvimento 1 (1 parágrafo):</strong> 1º argumento + repertório sociocultural + desenvolvimento.<br>
    <strong>3. Desenvolvimento 2 (1 parágrafo):</strong> 2º argumento + contraponto ou aprofundamento.<br>
    <strong>4. Conclusão (1 parágrafo):</strong> Reafirme a tese, síntese dos argumentos. Proposta de intervenção se fluir naturalmente.</p></div>
  `;

  const crit = document.getElementById('red-criterios');
  if (crit) crit.innerHTML = `
    <div class="resumo-card"><div class="resumo-card-header" onclick="toggleResumo(this)"><h3>A — Tema</h3><span class="resumo-freq-badge freq-alto">Eliminatória se zero</span><i class="fa-solid fa-chevron-down week-chevron"></i></div>
    <div class="resumo-card-body open"><p>Fugir do tema = nota ZERO total em toda a redação. Releia o enunciado 2x antes de escrever. Sua tese deve ser <strong>diretamente relacionada ao tema</strong>, não apenas tangenciar. Cuidado com recortes muito específicos que ignoram o tema central.</p></div></div>
    <div class="resumo-card"><div class="resumo-card-header" onclick="toggleResumo(this)"><h3>B — Estrutura e Coerência</h3><span class="resumo-freq-badge freq-alto">Alto impacto</span><i class="fa-solid fa-chevron-down week-chevron"></i></div>
    <div class="resumo-card-body open"><p>Precisa ser dissertativo-argumentativo (intro, desenvolvimento, conclusão), com posicionamento claro. Evite 1ª pessoa do singular e 2ª pessoa. <strong>Não cite a prova ou os textos motivadores diretamente</strong> (ex: "como diz o texto 1" — tira pontos! Seu texto precisa ter autonomia). Cada parágrafo = 1 ideia central.</p></div></div>
    <div class="resumo-card"><div class="resumo-card-header" onclick="toggleResumo(this)"><h3>C — Língua</h3><span class="resumo-freq-badge freq-alto">Alto impacto</span><i class="fa-solid fa-chevron-down week-chevron"></i></div>
    <div class="resumo-card-body open"><p>Concordância verbal e nominal, regência, ortografia, pontuação, registro formal. Evite gírias, coloquialismos e linguagem informal. A riqueza vocabular conta positivamente — use sinônimos e palavras precisas.</p></div></div>
    <div class="resumo-card"><div class="resumo-card-header" onclick="toggleResumo(this)"><h3>D — Coesão</h3><span class="resumo-freq-badge freq-medio">Médio impacto</span><i class="fa-solid fa-chevron-down week-chevron"></i></div>
    <div class="resumo-card-body open"><p>Conectivos variados (não repita sempre o mesmo), parágrafos bem divididos (nem monobloco, nem um período por parágrafo). Use: <em>todavia, no entanto, além disso, dessa forma, por conseguinte, ademais, sob essa perspectiva, nesse contexto...</em></p><p>Cuidado com parágrafos-monobloco (sem divisão) ou parágrafos minúsculos de 1 frase.</p></div></div>
  `;

  const rep = document.getElementById('red-repertorio');
  if (rep) rep.innerHTML = `
    <div class="tip-card"><h4><i class="fa-solid fa-book"></i> Como usar repertório corretamente</h4><p>Citar nome de pensador SEM relação com a tese é PENALIZADO, não pontuado. O repertório deve ser um argumento que sustenta sua tese, não uma decoração. Sempre conecte ao seu ponto principal.</p></div>
    <div class="resumo-grid">
      ${[
        { area: 'Filosofia', items: ['Platão: justiça e ideal da república', 'Rousseau: contrato social (soberania popular)', 'Kant: imperativo categórico (ética do dever)', 'John Locke: direitos naturais (vida, liberdade, propriedade)', 'Gramsci: hegemonia cultural e subalternidade'] },
        { area: 'Sociologia', items: ['Durkheim: fatos sociais, anomia, solidariedade', 'Weber: dominação, burocracia, ética protestante', 'Marx: luta de classes, mais-valia, alienação', 'Bourdieu: capital cultural, habitus, campo social', 'Bauman: modernidade líquida, identidade fluida'] },
        { area: 'Dados e Fatos Históricos', items: ['IBGE: dados de desigualdade, IDH, Gini brasileiro', 'ONU: Objetivos de Desenvolvimento Sustentável (ODS 2030)', 'Constituição de 1988: direitos fundamentais', 'ECA (1990): proteção da criança e do adolescente', 'Lei Maria da Penha (2006), Lei Áurea (1888)'] },
        { area: 'Tecnologia e Contemporaneidade', items: ['Revolução 4.0 e impactos no mercado de trabalho', 'Cambridge Analytica: dados e democracia', 'Fake news e pós-verdade — era da desinformação', 'Inteligência Artificial e regulação ética', 'Economia verde e crise climática (COP)'] },
      ].map(r => `<div class="resumo-card"><div class="resumo-card-header" onclick="toggleResumo(this)" style="cursor:pointer"><h3>${r.area}</h3><i class="fa-solid fa-chevron-down week-chevron"></i></div><div class="resumo-card-body open"><ul>${r.items.map(i => `<li>${i}</li>`).join('')}</ul></div></div>`).join('')}
    </div>
  `;
}

function populatePortugues() {
  const resumo = document.getElementById('port-resumo');
  if (resumo) {
    const rs = [
      { title: 'Concordância Verbal e Nominal', freq: 'alto', diff: 3, body: `<p>Uma das que mais cai em provas. Regras principais:</p><ul><li><strong>Sujeito composto antes do verbo:</strong> verbo no plural. Ex: "Maria e João <em>foram</em>"</li><li><strong>Sujeito composto após o verbo:</strong> pode concordar com o mais próximo. Ex: "Saíram Maria e os alunos" ou "Saiu Maria e os alunos"</li><li><strong>Pronome relativo "que":</strong> o verbo concorda com o antecedente. Ex: "Fui eu que <em>fiz</em>"</li><li><strong>Pronome relativo "quem":</strong> verbo na 3ª pessoa. Ex: "Fui eu quem <em>fez</em>"</li></ul>` },
      { title: 'Regência e Crase', freq: 'alto', diff: 4, body: `<p><strong>Crase:</strong> acento grave que funde a preposição "a" com o artigo "a" (feminino). Ocorre antes de palavras femininas que aceitam artigo.</p><ul><li>Antes de pronomes: NUNCA usa crase (à ela? Não!)</li><li>Antes de nomes masculinos: nunca (a pé, a cavalo)</li><li>Antes de verbos: nunca</li><li>Expressões adverbiais femininas: sempre (às vezes, à tarde)</li></ul><p><strong>Regência verbal:</strong> cada verbo pede determinada preposição. Ex: "assistir a um filme" (não "assistir um"). "Obedecer a alguém" não é transitivo direto.</p>` },
      { title: 'Machado de Assis e Realismo', freq: 'alto', diff: 2, body: `<p>O mais cobrado da literatura brasileira no Insper. Características do Realismo:</p><ul><li>Objetividade, crítica social, personagens psicologicamente complexas</li><li>Sem idealização romântica — a realidade é mostrada como é</li><li>Determinismo e positivismo influenciam a visão de mundo</li></ul><p><strong>Obras principais de Machado:</strong></p><ul><li><em>Dom Casmurro</em> — Bentinho/Capitu, dúvida sobre traição</li><li><em>Memórias Póstumas de Brás Cubas</em> — narrador defunto, inovador</li><li><em>Quincas Borba</em> — humanitismo (filosofia cômica)</li></ul>` },
      { title: 'Modernismo Brasileiro', freq: 'alto', diff: 3, body: `<p><strong>1ª Fase (1922-1930):</strong> Semana de Arte Moderna (1922). Ruptura com o passado, experimentalismo. Oswald de Andrade ("Manifesto Antropofágico"), Mário de Andrade ("Macunaíma"), Manuel Bandeira.</p><p><strong>2ª Fase (1930-1945):</strong> Romance regionalista e poesia mais reflexiva. Graciliano Ramos ("Vidas Secas"), Jorge Amado, José Lins do Rego, Carlos Drummond de Andrade.</p><p><strong>3ª Fase/Pós-Modernismo (1945+):</strong> João Guimarães Rosa ("Grande Sertão: Veredas" — linguagem sertaneja reinventada), João Cabral de Melo Neto, Clarice Lispector.</p>` },
    ];
    renderResumos(resumo, rs, 'r-port');
  }
  renderTopicos('port-topicos', PORT_TOPICOS, 'port');
}

function populateHumanas() {
  const resumo = document.getElementById('hum-resumo');
  if (resumo) {
    const rs = [
      { title: 'Brasil República — Era Vargas (1930-1945)', freq: 'alto', diff: 3, body: `<p>Uma das mais cobradas da prova. Getúlio Vargas ao poder após Revolução de 1930 (fim da República Velha / política do café com leite).</p><ul><li><strong>1930-1937:</strong> Governo Provisório. Crise da República Velha.</li><li><strong>1937-1945:</strong> Estado Novo — ditadura, Constituição de 1937 ("Polaca"), censura, trabalhismo, CLT (1943).</li><li><strong>Getulismo:</strong> populismo, sindicalismo controlado, industrialização, nacionalismo. "Pai dos pobres."</li><li><strong>Queda em 1945:</strong> pressão dos militares após fim da 2ª Guerra (Brasil lutou pela democracia, mas tinha ditador).</li></ul>` },
      { title: 'Regime Militar no Brasil (1964-1985)', freq: 'alto', diff: 3, body: `<p>Golpe de 1964 — militares derrubam João Goulart (Jango). Contexto: Guerra Fria, medo do comunismo.</p><ul><li><strong>Atos Institucionais (AI):</strong> AI-1 (1964), AI-5 (1968) — o mais duro: suspende habeas corpus, fecha Congresso, censura total.</li><li><strong>Milagre Econômico (1968-73):</strong> crescimento acelerado com aumento da dívida externa e desigualdade.</li><li><strong>Abertura Lenta e Gradual:</strong> Geisel → Figueiredo → eleições diretas (Diretas Já! 1984) → Tancredo Neves (1985).</li><li><strong>Repressão:</strong> DOI-CODI, tortura, exílio, desaparecimentos. Lei de Anistia (1979).</li></ul>` },
      { title: 'Sociologia — Os 3 Clássicos', freq: 'alto', diff: 2, body: `<p><strong>Émile Durkheim:</strong> fundador da Sociologia como ciência. Fatos sociais (externos e coercitivos). Anomia (ausência de normas). Solidariedade mecânica (sociedades simples) vs orgânica (complexas).</p><p><strong>Max Weber:</strong> ação social e seus tipos (tradicional, afetiva, racional por valores, racional com relação a fins). Dominação: carismática, tradicional, racional-legal. Ética protestante e o espírito do capitalismo.</p><p><strong>Karl Marx:</strong> materialismo histórico. Modos de produção. Luta de classes. Mais-valia. Infraestrutura (base econômica) determina a superestrutura (ideologia, política, cultura). Alienação do trabalhador.</p>` },
    ];
    renderResumos(resumo, rs, 'r-hum');
  }
  renderTopicos('hum-topicos', HUM_TOPICOS, 'hum');
}

function populateNatureza() {
  const resumo = document.getElementById('nat-resumo');
  if (resumo) {
    const rs = [
      { title: 'Ecologia Básica', freq: 'alto', diff: 1, body: `<p>Cadeia alimentar: produtores (plantas) → consumidores primários → secundários → decompositores. Pirâmide ecológica: energia se perde (10%) a cada nível trófico.</p><ul><li><strong>Ciclos biogeoquímicos:</strong> carbono, nitrogênio, água — sabendo o básico já garante pontos</li><li><strong>Biomas brasileiros:</strong> Amazônia, Cerrado, Caatinga, Mata Atlântica, Pampa, Pantanal</li><li><strong>Impactos ambientais:</strong> desmatamento, efeito estufa, chuva ácida, ilha de calor</li></ul>` },
      { title: 'Funções Inorgânicas (Química)', freq: 'medio', diff: 2, body: `<p>Ácidos: liberam H⁺ em água (HCl, H₂SO₄). Bases: liberam OH⁻ (NaOH). pH: < 7 ácido, 7 neutro, > 7 básico.</p><p>Sais: neutro, ácido, básico. Formados por reação ácido-base.</p><p>Óxidos: compostos binários com oxigênio (CO₂, Fe₂O₃). Classificação: ácidos, básicos, anfóteros, neutros.</p>` },
      { title: 'Genética Básica (Mendel)', freq: 'medio', diff: 3, body: `<p><strong>1ª Lei de Mendel (Segregação):</strong> cada indivíduo possui dois alelos para cada característica, que se separam durante a formação dos gametas. Quadrado de Punnett para cruzamentos.</p><p><strong>Dominante vs Recessivo:</strong> AA (homozigoto dominante), Aa (heterozigoto), aa (homozigoto recessivo). O alelo dominante mascara o recessivo.</p><p><strong>Grupos sanguíneos ABO:</strong> IA e IB são codominantes; i é recessivo. O = ii, A = IAIA ou IAi, B = IBIB ou IBi, AB = IAIB.</p>` },
    ];
    renderResumos(resumo, rs, 'r-nat');
  }
  renderTopicos('nat-topicos', NAT_TOPICOS, 'nat');
}

function renderResumos(container, resumos, prefix) {
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'resumo-grid';
  resumos.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'resumo-card';
    const dots = Array.from({length: 5}, (_, d) => `<div class="diff-dot ${d < r.diff ? 'filled' : ''}"></div>`).join('');
    card.innerHTML = `
      <div class="resumo-card-header" onclick="toggleResumo(this)" style="cursor:pointer">
        <h3>${r.title}</h3>
        <span class="resumo-freq-badge freq-${r.freq}">${r.freq === 'alto' ? '🔥 Alta frequência' : r.freq === 'medio' ? '⚡ Média' : '📝 Baixa'}</span>
        <i class="fa-solid fa-chevron-down week-chevron"></i>
      </div>
      <div class="resumo-card-body">
        ${r.body}
        <div class="difficulty-bar">
          <span class="difficulty-bar-label">Dificuldade:</span>
          <div class="difficulty-dots">${dots}</div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
  container.appendChild(grid);
}

function toggleResumo(header) {
  const body = header.nextElementSibling;
  header.querySelector('.week-chevron').style.transform = body.classList.contains('open') ? 'rotate(0deg)' : 'rotate(180deg)';
  body.classList.toggle('open');
}

// ── NOTES ────────────────────────────────────────────────────
function loadNotes() {
  const notes = currentUser.notes || {};
  ['mat','red','port','hum','nat'].forEach(k => {
    const el = document.getElementById(`textarea-${k}`);
    if (el) el.value = notes[k] || '';
  });
}

function saveNote(key) {
  if (!currentUser.notes) currentUser.notes = {};
  const el = document.getElementById(`textarea-${key}`);
  if (el) {
    currentUser.notes[key] = el.value;
    saveCurrentUser();
    showToast('Anotação salva!', 'success');
  }
}

// ── FLASHCARDS IA ─────────────────────────────────────────────
async function generateFlashcards() {
  const subject = document.getElementById('fc-subject').value;
  const topic = document.getElementById('fc-topic').value.trim();
  const count = document.getElementById('fc-count').value;
  if (!subject) { showToast('Selecione uma matéria!', 'error'); return; }

  document.getElementById('fc-placeholder').classList.add('hidden');
  document.getElementById('fc-study-mode').classList.add('hidden');
  document.getElementById('fc-loading').classList.remove('hidden');

  try {
    const prompt = `Você é um professor especialista no Vestibular Insper (Vunesp). Crie EXATAMENTE ${count} flashcards de estudo sobre "${subject}"${topic ? ` com foco em "${topic}"` : ''}.

Responda APENAS com um JSON array, sem markdown, sem explicações:
[{"front":"pergunta ou conceito","back":"resposta completa e didática"},...]

Os flashcards devem ser no nível do vestibular Insper, objetivos e úteis para memorização rápida.`;

    const res = await callClaude(prompt);
    const clean = res.replace(/```json|```/g, '').trim();
    currentFlashcards = JSON.parse(clean);

    currentUser.flashcardsGenerated = (currentUser.flashcardsGenerated || 0) + currentFlashcards.length;
    saveCurrentUser();

    fcIndex = 0; fcCorrect = 0; fcIsFlipped = false;
    document.getElementById('fc-loading').classList.add('hidden');
    document.getElementById('fc-result').classList.add('hidden');
    document.getElementById('fc-study-mode').classList.remove('hidden');
    showFlashcard();
  } catch (e) {
    document.getElementById('fc-loading').classList.add('hidden');
    document.getElementById('fc-placeholder').classList.remove('hidden');
    showToast('Erro ao gerar flashcards. Verifique sua chave de API.', 'error');
    console.error(e);
  }
}

function showFlashcard() {
  const fc = currentFlashcards[fcIndex];
  document.getElementById('fc-front-text').textContent = fc.front;
  document.getElementById('fc-back-text').textContent = fc.back;
  document.getElementById('fc-counter').textContent = `${fcIndex + 1} / ${currentFlashcards.length}`;
  document.getElementById('fc-progress-bar').style.width = `${((fcIndex) / currentFlashcards.length) * 100}%`;

  const card = document.getElementById('fc-card');
  card.classList.remove('flipped');
  fcIsFlipped = false;
}

function flipCard() {
  const card = document.getElementById('fc-card');
  fcIsFlipped = !fcIsFlipped;
  card.classList.toggle('flipped', fcIsFlipped);
}

function rateCard(knew) {
  if (knew) fcCorrect++;
  fcIndex++;
  document.getElementById('fc-result').classList.add('hidden');

  if (fcIndex >= currentFlashcards.length) {
    const pct = Math.round((fcCorrect / currentFlashcards.length) * 100);
    const result = document.getElementById('fc-result');
    result.classList.remove('hidden');
    result.innerHTML = `
      <h3>${pct >= 70 ? '🎉 Ótimo resultado!' : pct >= 50 ? '📚 Continue praticando!' : '💪 Precisa revisar mais!'}</h3>
      <p>Você acertou <strong>${fcCorrect} de ${currentFlashcards.length}</strong> flashcards (${pct}%)</p>
      <button class="btn-primary" onclick="resetFlashcards()"><i class="fa-solid fa-rotate-right"></i> Repetir</button>
      <button class="btn-sm" style="margin-left:8px" onclick="generateFlashcards()"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar novos</button>
    `;
    currentUser.xp = (currentUser.xp || 0) + Math.round(pct / 10) * 5;
    saveCurrentUser();
    document.getElementById('dash-xp').textContent = currentUser.xp || 0;
    return;
  }
  showFlashcard();
}

function resetFlashcards() {
  fcIndex = 0; fcCorrect = 0;
  document.getElementById('fc-result').classList.add('hidden');
  showFlashcard();
}

// ── QUESTÕES IA ───────────────────────────────────────────────
async function generateQuestion() {
  const subject = document.getElementById('q-subject').value;
  const topic = document.getElementById('q-topic').value.trim();
  const difficulty = document.getElementById('q-difficulty').value;
  if (!subject) { showToast('Selecione uma matéria!', 'error'); return; }

  document.getElementById('q-placeholder').classList.add('hidden');
  document.getElementById('q-loading').classList.remove('hidden');
  document.getElementById('q-area').innerHTML = '';

  try {
    const prompt = `Você é um professor que cria questões no estilo do Vestibular Insper (Vunesp). Crie 1 questão de ${difficulty} sobre "${subject}"${topic ? ` com foco em "${topic}"` : ''}.

Responda APENAS com JSON, sem markdown:
{
  "enunciado": "texto completo do enunciado, pode ser longo e contextualizado como na Vunesp",
  "alternativas": [
    {"letra": "A", "texto": "..."},
    {"letra": "B", "texto": "..."},
    {"letra": "C", "texto": "..."},
    {"letra": "D", "texto": "..."},
    {"letra": "E", "texto": "..."}
  ],
  "gabarito": "letra da alternativa correta",
  "explicacao": "explicação detalhada do porquê cada alternativa está certa ou errada"
}`;

    const res = await callClaude(prompt);
    const clean = res.replace(/```json|```/g, '').trim();
    const q = JSON.parse(clean);

    document.getElementById('q-loading').classList.add('hidden');
    renderQuestion(q, subject, difficulty);
  } catch (e) {
    document.getElementById('q-loading').classList.add('hidden');
    document.getElementById('q-placeholder').classList.remove('hidden');
    showToast('Erro ao gerar questão. Verifique sua chave de API.', 'error');
    console.error(e);
  }
}

function renderQuestion(q, subject, difficulty) {
  const diffColors = { fácil: '#10b981', médio: '#f59e0b', difícil: '#f43f5e', misto: '#06b6d4' };
  const area = document.getElementById('q-area');
  const card = document.createElement('div');
  card.className = 'question-card';
  card.innerHTML = `
    <div class="question-header">
      <span class="question-subject-badge">${subject}</span>
      <span class="question-diff" style="background:${diffColors[difficulty] || '#06b6d4'}22;color:${diffColors[difficulty] || '#06b6d4'}">${difficulty.toUpperCase()}</span>
    </div>
    <div class="question-text">${q.enunciado}</div>
    <div class="question-options" id="q-options">
      ${q.alternativas.map(a => `
        <button class="q-option" data-letter="${a.letra}" onclick="selectOption(this,'${q.gabarito}')">
          <span class="q-letter">${a.letra}</span>
          <span>${a.texto}</span>
        </button>
      `).join('')}
    </div>
    <div class="question-explanation hidden" id="q-explanation">
      <strong>Gabarito: ${q.gabarito}</strong><br>${q.explicacao}
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn-ai" onclick="generateQuestion()"><i class="fa-solid fa-rotate-right"></i> Nova questão</button>
    </div>
  `;
  area.prepend(card);
}

function selectOption(btn, gabarito) {
  const options = btn.closest('.question-options');
  options.querySelectorAll('.q-option').forEach(o => {
    o.classList.add('revealed');
    if (o.dataset.letter === gabarito) o.classList.add('correct');
  });
  const isRight = btn.dataset.letter === gabarito;
  if (!isRight) btn.classList.add('wrong');
  const expl = btn.closest('.question-card').querySelector('#q-explanation');
  if (expl) expl.classList.remove('hidden');

  if (isRight) { qCorrect++; currentUser.xp = (currentUser.xp || 0) + 20; showToast('Correto! +20 XP', 'success'); }
  else { qWrong++; showToast('Resposta incorreta. Estude a explicação!', 'error'); }
  document.getElementById('q-correct').textContent = qCorrect;
  document.getElementById('q-wrong').textContent = qWrong;
  document.getElementById('dash-xp').textContent = currentUser.xp || 0;
  saveCurrentUser();
}

// ── CORRETOR IA ───────────────────────────────────────────────
function updateCharCount() {
  const text = document.getElementById('corr-texto').value;
  document.getElementById('corr-char-count').textContent = `${text.length} caracteres (~${Math.round(text.length / 5)} palavras)`;
}

async function corrigirRedacao() {
  const tema = document.getElementById('corr-tema').value.trim();
  const texto = document.getElementById('corr-texto').value.trim();
  if (!texto) { showToast('Escreva ou cole sua redação!', 'error'); return; }
  if (texto.length < 200) { showToast('Redação muito curta! Mínimo 8 linhas autorais.', 'error'); return; }

  document.getElementById('corr-loading').classList.remove('hidden');
  document.getElementById('corr-resultado').innerHTML = '';

  try {
    const prompt = `Você é um corretor especialista em redações do Vestibular Insper (Vunesp). Corrija a redação abaixo usando EXATAMENTE os 4 critérios oficiais da Vunesp.

TEMA: ${tema || 'Não informado'}
REDAÇÃO:
${texto}

Responda APENAS com JSON:
{
  "notaFinal": 0-100,
  "criterioA": {"nota": 0-25, "comentario": "análise detalhada do critério A - Tema"},
  "criterioB": {"nota": 0-25, "comentario": "análise detalhada do critério B - Estrutura e Coerência"},
  "criterioC": {"nota": 0-25, "comentario": "análise detalhada do critério C - Língua"},
  "criterioD": {"nota": 0-25, "comentario": "análise detalhada do critério D - Coesão"},
  "pontosFort": ["ponto forte 1", "ponto forte 2"],
  "melhorias": ["melhoria prioritária 1", "melhoria prioritária 2", "melhoria prioritária 3"]
}`;

    const res = await callClaude(prompt, 1500);
    const clean = res.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    document.getElementById('corr-loading').classList.add('hidden');
    renderCorrecao(result);

    currentUser.redacoes = (currentUser.redacoes || 0) + 1;
    currentUser.xp = (currentUser.xp || 0) + 30;
    saveCurrentUser();
    document.getElementById('dash-xp').textContent = currentUser.xp || 0;
    document.getElementById('hs-redacoes').textContent = currentUser.redacoes || 0;
  } catch (e) {
    document.getElementById('corr-loading').classList.add('hidden');
    showToast('Erro ao corrigir. Verifique sua chave de API.', 'error');
    console.error(e);
  }
}

function renderCorrecao(r) {
  const noteColor = r.notaFinal >= 70 ? '#10b981' : r.notaFinal >= 50 ? '#f59e0b' : '#f43f5e';
  const criterios = [
    { label: 'A — Tema', data: r.criterioA },
    { label: 'B — Estrutura e Coerência', data: r.criterioB },
    { label: 'C — Língua', data: r.criterioC },
    { label: 'D — Coesão', data: r.criterioD },
  ];

  document.getElementById('corr-resultado').className = 'corr-result-box';
  document.getElementById('corr-resultado').innerHTML = `
    <div class="corr-score-main">
      <h3>Nota Final</h3>
      <div class="corr-nota" style="color:${noteColor}">${r.notaFinal}<span style="font-size:1.5rem;color:var(--text-muted)">/100</span></div>
      <p style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">${r.notaFinal >= 30 ? '✓ Acima do mínimo eliminatório (30)' : '⚠️ Abaixo do mínimo — seria eliminado!'}</p>
    </div>
    ${criterios.map(c => {
      const pct = (c.data.nota / 25) * 100;
      const cor = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#f43f5e';
      return `<div class="corr-criterio">
        <div class="corr-criterio-header">
          <span class="corr-criterio-label">${c.label}</span>
          <span class="corr-criterio-nota" style="color:${cor}">${c.data.nota}/25</span>
        </div>
        <div class="corr-criterio-bar"><div class="corr-criterio-fill" style="width:${pct}%;background:${cor}"></div></div>
        <p>${c.data.comentario}</p>
      </div>`;
    }).join('')}
    ${r.pontosFort ? `
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <h4 style="font-size:0.85rem;color:var(--success);margin-bottom:8px"><i class="fa-solid fa-circle-check"></i> Pontos fortes</h4>
      ${r.pontosFort.map(p => `<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:4px">✓ ${p}</p>`).join('')}
    </div>` : ''}
    ${r.melhorias ? `
    <div style="margin-top:12px">
      <h4 style="font-size:0.85rem;color:#fb7185;margin-bottom:8px"><i class="fa-solid fa-arrow-trend-up"></i> Melhorias prioritárias</h4>
      ${r.melhorias.map(m => `<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:4px">→ ${m}</p>`).join('')}
    </div>` : ''}
  `;
}

// ── TUTOR IA ─────────────────────────────────────────────────
function tutorEnter(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTutorMessage();
  }
}

async function sendTutorMessage() {
  if (tutorIsLoading) return;
  const input = document.getElementById('tutor-input');
  const text = input.value.trim();
  if (!text) return;

  const subject = document.getElementById('tutor-subject').value;
  input.value = '';
  addTutorMsg(text, 'user');
  tutorHistory.push({ role: 'user', content: text });
  tutorIsLoading = true;

  const loading = document.createElement('div');
  loading.className = 'tutor-msg tutor-msg-ai tutor-loading-msg';
  loading.innerHTML = `<div class="tutor-avatar"><i class="fa-solid fa-robot"></i></div><div class="tutor-bubble tutor-loading"><div class="dot-typing"><span></span><span></span><span></span></div></div>`;
  document.getElementById('tutor-messages').appendChild(loading);
  scrollTutor();

  try {
    const systemPrompt = `Você é um tutor especialista no Vestibular Insper 2027 (Vunesp). Foco atual: ${subject}. Seja didático, claro e sempre relacione com o contexto do vestibular Insper. Use exemplos práticos. Responda em português.`;
    const res = await callClaude(null, 1000, systemPrompt, tutorHistory);

    loading.remove();
    tutorHistory.push({ role: 'assistant', content: res });
    addTutorMsg(res, 'ai');
    tutorIsLoading = false;
  } catch (e) {
    loading.remove();
    addTutorMsg('Erro ao conectar com a IA. Verifique sua chave de API em app.js.', 'ai');
    tutorIsLoading = false;
    console.error(e);
  }
}

function addTutorMsg(text, role) {
  const msgs = document.getElementById('tutor-messages');
  const div = document.createElement('div');
  div.className = `tutor-msg ${role === 'user' ? 'tutor-msg-user' : 'tutor-msg-ai'}`;
  const icon = role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';
  const formatted = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
  div.innerHTML = `<div class="tutor-avatar">${icon}</div><div class="tutor-bubble"><p>${formatted}</p></div>`;
  msgs.appendChild(div);
  scrollTutor();
}

function scrollTutor() {
  const msgs = document.getElementById('tutor-messages');
  msgs.scrollTop = msgs.scrollHeight;
}

// ── API CALL ─────────────────────────────────────────────────
async function callClaude(userMessage, maxTokens = 1000, system = null, history = null) {
  const messages = history ? [...history] : [];
  if (userMessage) messages.push({ role: 'user', content: userMessage });

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages
  };
  if (system) body.system = system;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.content.map(b => b.text || '').filter(Boolean).join('\n');
}

// ── PERFIL ───────────────────────────────────────────────────
function renderPerfil() {
  document.getElementById('perfil-name-display').textContent = currentUser.name;
  document.getElementById('perfil-username-display').textContent = `@${currentUser.username}`;
  const courseMap = { adm: 'Administração / Economia', dir: 'Direito', ambos: 'Administração / Direito (decidindo)' };
  document.getElementById('perfil-course-display').textContent = `Curso: ${courseMap[currentUser.course] || '--'}`;

  const avatarSrc = currentUser.avatar || generateAvatarSvg(currentUser.name);
  document.getElementById('perfil-avatar-img').src = avatarSrc;
  document.getElementById('topbar-avatar-img').src = avatarSrc;

  if (currentUser.banner) {
    document.getElementById('perfil-banner').style.backgroundImage = `url(${currentUser.banner})`;
    document.getElementById('perfil-banner').style.backgroundSize = 'cover';
    document.getElementById('perfil-banner').style.backgroundPosition = 'center';
  }

  document.getElementById('ps-xp').textContent = currentUser.xp || 0;
  document.getElementById('ps-streak').textContent = currentUser.maxStreak || 0;
  document.getElementById('ps-redacoes').textContent = currentUser.redacoes || 0;
  document.getElementById('ps-simulados').textContent = currentUser.simulados || 0;
  document.getElementById('ps-flashcards').textContent = currentUser.flashcardsGenerated || 0;

  // Edit form
  document.getElementById('edit-name').value = currentUser.name;
  document.getElementById('edit-bio').value = currentUser.bio || '';
  document.getElementById('edit-course').value = currentUser.course || 'adm';

  renderAchievements();
}

const ACHIEVEMENTS = [
  { id: 'first_login', icon: '🚀', name: 'Primeiro Passo', desc: 'Criou sua conta', condition: (u) => true },
  { id: 'streak_3', icon: '🔥', name: 'Em Chamas', desc: '3 dias seguidos', condition: (u) => (u.streak || 0) >= 3 },
  { id: 'streak_7', icon: '⚡', name: 'Uma Semana!', desc: '7 dias seguidos', condition: (u) => (u.streak || 0) >= 7 },
  { id: 'streak_30', icon: '🌟', name: 'Mês Perfeito', desc: '30 dias seguidos', condition: (u) => (u.streak || 0) >= 30 },
  { id: 'first_redacao', icon: '✍️', name: 'Primeiro Rascunho', desc: 'Corrigiu 1 redação', condition: (u) => (u.redacoes || 0) >= 1 },
  { id: 'five_redacoes', icon: '📝', name: 'Redator', desc: '5 redações corrigidas', condition: (u) => (u.redacoes || 0) >= 5 },
  { id: 'ten_redacoes', icon: '🖊️', name: 'Mestre das Palavras', desc: '10 redações', condition: (u) => (u.redacoes || 0) >= 10 },
  { id: 'xp_100', icon: '⭐', name: '100 XP', desc: 'Atingiu 100 XP', condition: (u) => (u.xp || 0) >= 100 },
  { id: 'xp_500', icon: '🏅', name: '500 XP', desc: 'Atingiu 500 XP', condition: (u) => (u.xp || 0) >= 500 },
  { id: 'xp_1000', icon: '🏆', name: '1000 XP', desc: 'Atingiu 1000 XP!', condition: (u) => (u.xp || 0) >= 1000 },
  { id: 'flashcards_50', icon: '🃏', name: 'Maratonista', desc: '50 flashcards', condition: (u) => (u.flashcardsGenerated || 0) >= 50 },
  { id: 'week_done', icon: '📅', name: 'Semana Completa', desc: 'Concluiu uma semana', condition: (u) => Object.values(u.weeksDone || {}).some(v => v) },
];

function renderAchievements() {
  const grid = document.getElementById('achievements-grid');
  if (!grid) return;
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const unlocked = a.condition(currentUser);
    const card = document.createElement('div');
    card.className = `achievement-card ${unlocked ? 'unlocked' : 'locked'}`;
    card.innerHTML = `<div class="achievement-icon">${a.icon}</div><div class="achievement-name">${a.name}</div><div class="achievement-desc">${a.desc}</div>`;
    if (unlocked) card.style.boxShadow = '0 0 12px rgba(251,191,36,0.2)';
    grid.appendChild(card);
  });
}

function saveProfile() {
  const name = document.getElementById('edit-name').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  const course = document.getElementById('edit-course').value;
  if (!name) { showToast('O nome não pode ficar em branco!', 'error'); return; }
  currentUser.name = name;
  currentUser.bio = bio;
  currentUser.course = course;
  saveCurrentUser();
  renderPerfil();
  updateTopbar();
  document.getElementById('dash-welcome').textContent = name.split(' ')[0];
  showToast('Perfil atualizado!', 'success');
}

function changeAvatar() { document.getElementById('avatar-upload').click(); }
function changeBanner() { document.getElementById('banner-upload').click(); }

function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentUser.avatar = ev.target.result;
    saveCurrentUser();
    document.getElementById('perfil-avatar-img').src = ev.target.result;
    document.getElementById('topbar-avatar-img').src = ev.target.result;
    showToast('Foto de perfil atualizada!', 'success');
  };
  reader.readAsDataURL(file);
}

function handleBannerUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentUser.banner = ev.target.result;
    saveCurrentUser();
    const banner = document.getElementById('perfil-banner');
    banner.style.backgroundImage = `url(${ev.target.result})`;
    banner.style.backgroundSize = 'cover';
    banner.style.backgroundPosition = 'center';
    showToast('Capa atualizada!', 'success');
  };
  reader.readAsDataURL(file);
}

// ── TOAST ────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ── HELPERS ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (currentPage === 'flashcards') {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
    if (e.key === 'ArrowRight' || e.key === 'l') rateCard(true);
    if (e.key === 'ArrowLeft' || e.key === 'j') rateCard(false);
  }
});