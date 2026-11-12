// SIAKAD Learn - Client Application Script (Student-Only LMS with Login & KRS)

let activeTab = 'dashboard';
let currentStudent = null;
let currentDashboardData = null;
let currentCourses = [];
let currentFilter = 'all';

// Helper to get environment-aware API URL (supports both Node.js port 3000 and XAMPP /lms-kampus/)
function getApiUrl(endpoint) {
  const isXampp = window.location.pathname.includes('/lms-kampus');
  const base = isXampp ? '/lms-kampus/api' : '/api';
  const clean = endpoint.replace(/^\/?(api\/)?/, '');
  return `${base}/${clean}`;
}

// Centralized authenticated API Fetch
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('siakad_token');
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : getApiUrl(endpoint);
  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401) {
    // Session expired or unauthenticated
    localStorage.removeItem('siakad_token');
    showLoginView();
    throw new Error('Sesi telah berakhir. Silakan login kembali.');
  }

  return res;
}

// Real-time clock update
function updateClock() {
  const clockEl = document.getElementById('realtime-clock');
  if (!clockEl) return;
  const now = new Date();
  const options = {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  clockEl.textContent = now.toLocaleDateString('id-ID', options) + ' WIB';
}
setInterval(updateClock, 1000);
updateClock();

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-enter flex items-center space-x-3 p-4 rounded-2xl shadow-xl pointer-events-auto border transition text-xs font-semibold max-w-sm ${
    type === 'success'
      ? 'bg-emerald-900/90 text-white border-emerald-700 backdrop-blur-md'
      : type === 'error'
      ? 'bg-rose-900/90 text-white border-rose-700 backdrop-blur-md'
      : 'bg-slate-900/90 text-white border-slate-700 backdrop-blur-md'
  }`;

  const iconName = type === 'success' ? 'check-circle-2' : type === 'error' ? 'alert-triangle' : 'info';
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-5 h-5 shrink-0 ${type === 'success' ? 'text-emerald-400' : 'text-rose-400'}"></i>
    <div class="flex-1">${message}</div>
    <button onclick="this.parentElement.remove()" class="text-white/60 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal Helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
}

// View Switching: Login vs App
function showLoginView() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
  if (window.lucide) lucide.createIcons();
}

function showAppView() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

// Toggle password input visibility
function togglePasswordVisibility() {
  const pwdInput = document.getElementById('login-password');
  const icon = document.getElementById('toggle-pwd-icon');
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    icon.setAttribute('data-lucide', 'eye-off');
  } else {
    pwdInput.type = 'password';
    icon.setAttribute('data-lucide', 'eye');
  }
  if (window.lucide) lucide.createIcons();
}

// Fill demo credentials
function fillDemoLogin(nim, password) {
  document.getElementById('login-nim').value = nim;
  document.getElementById('login-password').value = password;
  document.getElementById('login-error').classList.add('hidden');
}

// Handle Student Login
async function handleLogin(e) {
  e.preventDefault();
  const nim = document.getElementById('login-nim').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errorEl = document.getElementById('login-error');
  const errorText = document.getElementById('login-error-text');
  const submitBtn = document.getElementById('btn-login-submit');

  errorEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="animate-spin inline-block mr-2">↻</span> Memverifikasi...`;

  try {
    const res = await fetch(getApiUrl('auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim, password })
    });

    const json = await res.json();
    if (!json.success) {
      errorEl.classList.remove('hidden');
      errorText.textContent = json.error || 'NIM atau password salah.';
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Masuk ke Portal LMS</span><i data-lucide="arrow-right" class="w-4 h-4 ml-1"></i>`;
      if (window.lucide) lucide.createIcons({ root: submitBtn });
      return;
    }

    // Login successful
    localStorage.setItem('siakad_token', json.token);
    currentStudent = json.student;
    updateStudentUI(currentStudent);
    showAppView();
    showToast(`Selamat datang, ${currentStudent.name}!`, 'success');

    // Load initial data
    await loadDashboard();
  } catch (err) {
    errorEl.classList.remove('hidden');
    errorText.textContent = 'Gagal menghubungi server: ' + err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Masuk ke Portal LMS</span><i data-lucide="arrow-right" class="w-4 h-4 ml-1"></i>`;
    if (window.lucide) lucide.createIcons({ root: submitBtn });
  }
}

// Handle Logout
async function handleLogout() {
  if (!confirm('Apakah Anda yakin ingin keluar dari portal LMS?')) return;
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}

  localStorage.removeItem('siakad_token');
  currentStudent = null;
  document.getElementById('login-password').value = '';
  document.getElementById('profile-menu').classList.add('hidden');
  showLoginView();
  showToast('Anda telah logout.', 'info');
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupProfileDropdown();
  setupDragAndDrop();

  const token = localStorage.getItem('siakad_token');
  if (!token) {
    showLoginView();
    return;
  }

  try {
    const res = await apiFetch('/api/auth/me');
    const json = await res.json();
    if (json.success && json.student) {
      currentStudent = json.student;
      updateStudentUI(currentStudent);
      showAppView();
      await loadDashboard();
    } else {
      showLoginView();
    }
  } catch (err) {
    showLoginView();
  }

  if (window.lucide) lucide.createIcons();
});

function updateStudentUI(student) {
  document.getElementById('nav-avatar').src = student.avatar;
  document.getElementById('nav-student-name').textContent = student.name;
  document.getElementById('nav-student-nim').textContent = `NIM: ${student.nim}`;
  document.getElementById('menu-student-name').textContent = student.name;
  document.getElementById('menu-student-prodi').textContent = `${student.prodi} (${student.faculty})`;

  document.getElementById('dash-student-name').textContent = student.name;
  document.getElementById('dash-student-prodi').textContent = student.prodi;
  document.getElementById('dash-student-semester').textContent = student.semester;
  document.getElementById('dash-student-nim').textContent = student.nim;
}

function setupProfileDropdown() {
  const btn = document.getElementById('profile-dropdown-btn');
  const menu = document.getElementById('profile-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
}

// Tab Switching
function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active-tab');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });

  const activeBtn = document.getElementById(`tab-nav-${tabName}`);
  const activeContent = document.getElementById(`tab-content-${tabName}`);

  if (activeBtn) activeBtn.classList.add('active-tab');
  if (activeContent) activeContent.classList.remove('hidden');

  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'presensi') loadAttendancePage();
  if (tabName === 'tugas') loadAssignmentsPage();
  if (tabName === 'krs') loadKrsPage();
  if (tabName === 'matakuliah') loadCoursesPage();

  if (window.lucide) lucide.createIcons();
}

// ==================== TAB 1: DASHBOARD ====================
async function loadDashboard() {
  try {
    const res = await apiFetch('/api/dashboard');
    const json = await res.json();
    if (!json.success) return;

    currentDashboardData = json.data;
    const { stats, activeSessions, todayCourses, announcements } = currentDashboardData;

    document.getElementById('dash-stat-ipk').textContent = stats.ipk.toFixed(2);
    document.getElementById('dash-stat-attendance').textContent = `${stats.attendanceRate}%`;
    document.getElementById('dash-stat-sks').textContent = `${stats.totalSks} SKS`;
    document.getElementById('dash-stat-course-count').textContent = `${stats.totalCourses} Mata Kuliah`;

    document.getElementById('dash-count-hadir').textContent = stats.presentCount;
    document.getElementById('dash-count-izin-sakit').textContent = stats.permissionCount + stats.sickCount;
    document.getElementById('dash-count-pending-tugas').textContent = stats.pendingAssignments;
    document.getElementById('dash-count-selesai-tugas').textContent = stats.submittedAssignments;

    // Badges
    const tabPresensiBadge = document.getElementById('tab-badge-presensi');
    const urgentBanner = document.getElementById('urgent-session-alert');
    const urgentText = document.getElementById('urgent-session-text');

    const openSessions = activeSessions.filter(s => !s.hasCheckedIn);
    if (openSessions.length > 0) {
      tabPresensiBadge.classList.remove('hidden');
      tabPresensiBadge.textContent = `${openSessions.length} Sesi`;
      urgentBanner.classList.remove('hidden');
      urgentText.textContent = `Ada ${openSessions.length} sesi perkuliahan aktif hari ini yang belum Anda isi! Silakan lakukan presensi sekarang.`;
    } else {
      tabPresensiBadge.classList.add('hidden');
      urgentBanner.classList.add('hidden');
    }

    const tabTugasBadge = document.getElementById('tab-badge-tugas');
    tabTugasBadge.textContent = stats.pendingAssignments;

    renderDashboardActiveSessions(activeSessions);
    renderDashboardSchedule(todayCourses);
    renderDashboardAnnouncements(announcements);
    loadUpcomingAssignmentsWidget();

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

function renderDashboardActiveSessions(sessions) {
  const container = document.getElementById('dash-active-sessions-list');
  if (!container) return;

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 bg-white rounded-2xl p-6 border border-slate-200 text-center space-y-2">
        <i data-lucide="calendar-check" class="w-8 h-8 mx-auto text-slate-300"></i>
        <p class="text-xs font-bold text-slate-700">Tidak ada sesi presensi yang sedang dibuka saat ini.</p>
        <p class="text-[11px] text-slate-400">Presensi akan dibuka secara otomatis sesuai jadwal perkuliahan tatap muka Anda.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = sessions.map(sess => {
    const isChecked = sess.hasCheckedIn;
    return `
      <div class="bg-white rounded-2xl p-5 border-2 ${isChecked ? 'border-emerald-200 bg-emerald-50/20' : 'border-brand-500 shadow-md shadow-brand-500/10'} space-y-3 relative overflow-hidden transition">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <span class="text-[10px] font-black px-2 py-0.5 rounded-md bg-brand-100 text-brand-800">${sess.course_code}</span>
              <span class="text-[10px] font-semibold text-slate-500">Pertemuan ${sess.session_no}</span>
            </div>
            <h4 class="text-sm font-extrabold text-slate-900">${sess.course_name}</h4>
            <p class="text-xs text-slate-500">${sess.title}</p>
          </div>
          ${isChecked ? `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold shrink-0">
              <i data-lucide="check" class="w-3.5 h-3.5"></i> Sudah Absen (${sess.myAttendance.status})
            </span>
          ` : `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-extrabold shrink-0 animate-pulse">
              <i data-lucide="radio" class="w-3.5 h-3.5"></i> Sesi Dibuka
            </span>
          `}
        </div>

        <div class="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <div class="flex items-center space-x-3 text-[11px]">
            <span><i data-lucide="clock" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i>${sess.time_start} - ${sess.time_end} WIB</span>
            <span><i data-lucide="map-pin" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i>${sess.room}</span>
          </div>
          ${sess.passcode ? `<span class="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold">Token: ${sess.passcode}</span>` : ''}
        </div>

        <div>
          ${isChecked ? `
            <div class="p-2.5 rounded-xl bg-white border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
              <span>Waktu absen: <b>${sess.myAttendance.attendance_time}</b></span>
              <span class="font-bold">${sess.myAttendance.status}</span>
            </div>
          ` : `
            <button onclick="openCheckinModal('${sess.id}', '${sess.course_name}', '${sess.course_code}', 'Pertemuan ${sess.session_no}: ${sess.title}', '${sess.lecturer}', '${sess.room}', '${sess.passcode || ''}')" class="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-brand-500/20 transition flex items-center justify-center space-x-1.5">
              <i data-lucide="user-check" class="w-4 h-4"></i>
              <span>Presensi Sekarang</span>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function renderDashboardSchedule(courses) {
  const container = document.getElementById('dash-today-schedule');
  if (!container) return;

  if (courses.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">Tidak ada perkuliahan untuk hari ini.</p>`;
    return;
  }

  container.innerHTML = courses.map(c => `
    <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-slate-900">${c.name}</span>
        <span class="text-[10px] font-mono font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">${c.time_start} - ${c.time_end}</span>
      </div>
      <div class="flex items-center justify-between text-[11px] text-slate-500">
        <span>${c.lecturer}</span>
        <span>${c.room.split('(')[0]}</span>
      </div>
    </div>
  `).join('');
}

function renderDashboardAnnouncements(announcements) {
  const container = document.getElementById('dash-announcements-list');
  if (!container) return;

  container.innerHTML = announcements.map(ann => `
    <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${ann.badge === 'Penting' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}">${ann.badge}</span>
        <span class="text-[10px] text-slate-400">${ann.date}</span>
      </div>
      <h5 class="text-xs font-bold text-slate-800">${ann.title}</h5>
      <p class="text-[11px] text-slate-500 line-clamp-2">${ann.content}</p>
    </div>
  `).join('');
}

async function loadUpcomingAssignmentsWidget() {
  const container = document.getElementById('dash-upcoming-assignments');
  if (!container) return;

  try {
    const res = await apiFetch('/api/assignments');
    const json = await res.json();
    if (!json.success) return;

    const assignments = json.data.slice(0, 3);
    if (assignments.length === 0) {
      container.innerHTML = `
        <div class="bg-white p-6 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
          Tidak ada tugas kuliah yang perlu dikumpulkan saat ini.
        </div>
      `;
      return;
    }

    container.innerHTML = assignments.map(asg => {
      const isSubmitted = !!asg.sub_id;
      return `
        <div class="bg-white p-4 rounded-2xl border border-slate-200 hover:border-brand-200 transition space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1">
              <div class="flex items-center space-x-2">
                <span class="text-[10px] font-bold text-slate-500 uppercase">${asg.course_name}</span>
                <span class="text-slate-300">•</span>
                <span class="text-[10px] text-slate-400">Batas: ${asg.deadline} WIB</span>
              </div>
              <h4 class="text-xs sm:text-sm font-bold text-slate-900">${asg.title}</h4>
            </div>
            ${isSubmitted ? `
              <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                <i data-lucide="check" class="w-3 h-3"></i> Terkumpul
              </span>
            ` : `
              <span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                Menunggu Pengumpulan
              </span>
            `}
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-100">
            <span class="text-xs text-slate-500">Dosen: ${asg.lecturer}</span>
            <button onclick="openUploadModal('${asg.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1">
              <i data-lucide="${isSubmitted ? 'file-check' : 'upload'}" class="w-3.5 h-3.5"></i>
              <span>${isSubmitted ? 'Lihat / Ubah Tugas' : 'Upload Berkas'}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons({ root: container });
  } catch (err) {
    console.error('Failed to load upcoming assignments:', err);
  }
}

// ==================== TAB 2: PRESENSI KULIAH ====================
async function loadAttendancePage() {
  try {
    const res = await apiFetch('/api/courses');
    const json = await res.json();
    if (!json.success) return;

    currentCourses = json.data;
    renderAttendanceCourses(json.data);

    const activeSessions = json.data.filter(c => c.activeSession);
    renderAttendanceActiveBanner(activeSessions);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Failed to load attendance page:', err);
  }
}

function renderAttendanceActiveBanner(activeCourses) {
  const container = document.getElementById('presensi-active-banner-container');
  if (!container) return;

  if (activeCourses.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = activeCourses.map(c => {
    const sess = c.activeSession;
    const isChecked = sess.hasCheckedIn;

    return `
      <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white p-5 rounded-2xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold">
            <span class="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
            <span>SESI PRESENSI AKTIF: ${c.code}</span>
          </div>
          <h3 class="text-base font-extrabold text-white">${c.name} - ${sess.title}</h3>
          <p class="text-xs text-white/80">
            Jam: ${sess.time_start} - ${sess.time_end} WIB • Ruang: ${c.room} • Dosen: ${c.lecturer}
          </p>
        </div>

        <div class="shrink-0">
          ${isChecked ? `
            <div class="px-4 py-2 bg-white/20 backdrop-blur-md rounded-xl text-xs font-bold text-white flex items-center space-x-2">
              <i data-lucide="check-circle" class="w-4 h-4 text-emerald-300"></i>
              <span>Presensi Tercatat (${sess.attendanceRecord.status})</span>
            </div>
          ` : `
            <button onclick="openCheckinModal('${sess.id}', '${c.name}', '${c.code}', '${sess.title}', '${c.lecturer}', '${c.room}', '${sess.passcode || ''}')" class="px-5 py-2.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-black shadow-md transition flex items-center space-x-2">
              <i data-lucide="user-check" class="w-4 h-4 text-emerald-600"></i>
              <span>Presensi Sekarang →</span>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function renderAttendanceCourses(courses) {
  const container = document.getElementById('presensi-courses-grid');
  if (!container) return;

  if (courses.length === 0) {
    container.innerHTML = `
      <div class="col-span-3 bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-2">
        <p class="text-sm font-bold text-slate-700">Belum ada mata kuliah dalam KRS Anda.</p>
        <p class="text-xs text-slate-400">Silakan buka tab Rencana Studi (KRS) untuk mengambil mata kuliah.</p>
        <button onclick="switchTab('krs')" class="mt-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold">Buka Menu KRS →</button>
      </div>
    `;
    return;
  }

  container.innerHTML = courses.map(c => {
    const { percentage, isEligibleUas, presentCount, permissionCount, sickCount, totalMeetings, heldMeetings } = c.stats;
    const active = c.activeSession;
    const progressColor = percentage >= 75 ? 'bg-emerald-500' : percentage >= 60 ? 'bg-amber-500' : 'bg-rose-500';

    return `
      <div class="bg-white rounded-2xl border border-slate-200 hover:border-brand-300 shadow-xs transition p-5 space-y-4 flex flex-col justify-between">
        <div class="space-y-3">
          <div class="flex items-start justify-between">
            <span class="text-[11px] font-black px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-mono">${c.code}</span>
            <div class="flex items-center space-x-1">
              ${active && !active.hasCheckedIn ? `<span class="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full animate-pulse">Sesi Buka</span>` : ''}
              <span class="text-xs font-bold px-2 py-0.5 rounded-full ${isEligibleUas ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                ${isEligibleUas ? '✓ Layak UAS' : '⚠ Perhatian'}
              </span>
            </div>
          </div>

          <div>
            <h4 class="text-sm font-bold text-slate-900 leading-snug">${c.name}</h4>
            <p class="text-xs text-slate-500 mt-0.5">${c.lecturer}</p>
          </div>

          <div class="p-2.5 rounded-xl bg-slate-50 text-[11px] text-slate-600 space-y-1">
            <div class="flex items-center justify-between">
              <span><i data-lucide="calendar" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i> ${c.day}, ${c.time_start} - ${c.time_end}</span>
              <span class="font-bold text-slate-700">${c.sks} SKS</span>
            </div>
            <div><i data-lucide="map-pin" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i> ${c.room}</div>
          </div>

          <div class="space-y-1.5 pt-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-slate-600">Kehadiran (${presentCount}/${heldMeetings} Pertemuan)</span>
              <span class="font-black text-slate-900">${percentage}%</span>
            </div>
            <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full ${progressColor} progress-bar-fill rounded-full" style="width: ${percentage}%"></div>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>Hadir: ${presentCount}</span>
              <span>Izin: ${permissionCount}</span>
              <span>Sakit: ${sickCount}</span>
              <span>Total: ${totalMeetings}</span>
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
          <button onclick="viewCourseSessionsDetail('${c.id}')" class="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1">
            <i data-lucide="list" class="w-3.5 h-3.5"></i>
            <span>Rekap 16 Sesi</span>
          </button>

          ${active ? (
            active.hasCheckedIn ? `
              <button disabled class="w-full py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200 flex items-center justify-center space-x-1 cursor-default">
                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                <span>Sudah Hadir</span>
              </button>
            ` : `
              <button onclick="openCheckinModal('${active.id}', '${c.name}', '${c.code}', '${active.title}', '${c.lecturer}', '${c.room}', '${active.passcode || ''}')" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition flex items-center justify-center space-x-1">
                <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
                <span>Absen Sekarang</span>
              </button>
            `
          ) : `
            <button onclick="switchTab('tugas')" class="w-full py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 border border-brand-200">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
              <span>Lihat Tugas</span>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function openCheckinModal(sessionId, courseName, courseCode, topic, lecturer, room, passcode) {
  document.getElementById('checkin-session-id').value = sessionId;
  document.getElementById('modal-presensi-course-code').textContent = `Mata Kuliah: ${courseCode}`;
  document.getElementById('modal-presensi-course-name').textContent = courseName;
  document.getElementById('modal-presensi-topic').textContent = topic;
  document.getElementById('modal-presensi-lecturer').textContent = lecturer;
  document.getElementById('modal-presensi-room').textContent = room;

  const passGroup = document.getElementById('checkin-passcode-group');
  const passHint = document.getElementById('checkin-passcode-hint');
  const passInput = document.getElementById('checkin-passcode');

  if (passcode) {
    passGroup.classList.remove('hidden');
    passHint.textContent = `(Token sesi: ${passcode})`;
    passInput.value = '';
    passInput.required = true;
  } else {
    passGroup.classList.add('hidden');
    passHint.textContent = '';
    passInput.value = '';
    passInput.required = false;
  }

  document.querySelector('input[name="presensiStatus"][value="Hadir"]').checked = true;
  document.getElementById('checkin-note').value = '';
  document.getElementById('checkin-proof-file').value = '';
  document.getElementById('checkin-proof-label').textContent = 'Pilih Berkas Bukti (PDF, JPG, PNG)';
  togglePresensiInputs();

  openModal('modal-presensi');
}

function togglePresensiInputs() {
  const selected = document.querySelector('input[name="presensiStatus"]:checked').value;
  const proofGroup = document.getElementById('checkin-proof-group');
  if (selected === 'Sakit' || selected === 'Izin') {
    proofGroup.classList.remove('hidden');
  } else {
    proofGroup.classList.add('hidden');
  }
}

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'checkin-proof-file') {
    const file = e.target.files[0];
    const label = document.getElementById('checkin-proof-label');
    if (file && label) {
      label.textContent = `Terpilih: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    }
  }
});

async function submitPresensi(e) {
  e.preventDefault();
  const sessionId = document.getElementById('checkin-session-id').value;
  const status = document.querySelector('input[name="presensiStatus"]:checked').value;
  const passcode = document.getElementById('checkin-passcode').value;
  const note = document.getElementById('checkin-note').value;
  const proofFileInput = document.getElementById('checkin-proof-file');

  const btn = document.getElementById('btn-submit-presensi');
  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin inline-block mr-1">↻</span> Menyimpan...`;

  try {
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('status', status);
    formData.append('passcode', passcode);
    formData.append('note', note);
    if (proofFileInput.files.length > 0) {
      formData.append('proofFile', proofFileInput.files[0]);
    }

    const res = await apiFetch('/api/attendance/submit', {
      method: 'POST',
      body: formData
    });

    const json = await res.json();
    if (!json.success) {
      showToast(json.error || 'Gagal mengisi presensi.', 'error');
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="check" class="w-4 h-4 inline mr-1"></i> Kirim Presensi`;
      if (window.lucide) lucide.createIcons({ root: btn });
      return;
    }

    closeModal('modal-presensi');
    showToast(`Presensi berhasil dicatat! Status: ${status}`, 'success');

    await loadAttendancePage();
    await loadDashboard();
  } catch (err) {
    showToast('Terjadi kesalahan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check" class="w-4 h-4 inline mr-1"></i> Kirim Presensi`;
    if (window.lucide) lucide.createIcons({ root: btn });
  }
}

async function viewCourseSessionsDetail(courseId) {
  try {
    const res = await apiFetch(`/api/courses/${courseId}`);
    const json = await res.json();
    if (!json.success) return;

    const { course, sessions } = json.data;
    document.getElementById('modal-rekap-title').textContent = `${course.code} - ${course.name}`;
    document.getElementById('modal-rekap-lecturer').textContent = `Dosen: ${course.lecturer} • Ruang: ${course.room}`;

    const held = sessions.filter(s => s.is_active === 1 || s.session_no < 8);
    const present = sessions.filter(s => s.att_status === 'Hadir').length;
    const izinSakit = sessions.filter(s => s.att_status === 'Izin' || s.att_status === 'Sakit').length;
    const percent = held.length > 0 ? Math.round((present / held.length) * 100) : 100;

    document.getElementById('modal-rekap-total').textContent = `${sessions.length} Sesi (${held.length} Terlaksana)`;
    document.getElementById('modal-rekap-hadir').textContent = `${present} Kali`;
    document.getElementById('modal-rekap-izin').textContent = `${izinSakit} Kali`;
    document.getElementById('modal-rekap-percent').textContent = `${percent}%`;

    const tbody = document.getElementById('modal-rekap-table-body');
    tbody.innerHTML = sessions.map(s => {
      let statusBadge = '';
      if (s.att_status === 'Hadir') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">Hadir</span>`;
      } else if (s.att_status === 'Izin') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">Izin</span>`;
      } else if (s.att_status === 'Sakit') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">Sakit</span>`;
      } else if (s.is_active === 1) {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold animate-pulse">Sesi Buka</span>`;
      } else if (s.session_no < 8) {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">Alpa</span>`;
      } else {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-[10px]">Terjadwal</span>`;
      }

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 font-bold text-slate-800 font-mono">P-${s.session_no}</td>
          <td class="py-2.5 px-3">
            <div class="font-semibold text-slate-800">${s.title}</div>
            <div class="text-[10px] text-slate-400">${s.topic || '-'}</div>
          </td>
          <td class="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
            <div>${s.date}</div>
            <div class="text-[10px] text-slate-400 font-mono">${s.time_start} - ${s.time_end}</div>
          </td>
          <td class="py-2.5 px-3 text-center">${statusBadge}</td>
          <td class="py-2.5 px-3 text-[11px] text-slate-500 whitespace-nowrap font-mono">
            ${s.attendance_time ? s.attendance_time : '-'}
          </td>
        </tr>
      `;
    }).join('');

    openModal('modal-rekap-sessions');
  } catch (err) {
    showToast('Gagal memuat rekap pertemuan: ' + err.message, 'error');
  }
}

// ==================== TAB 3: TUGAS & PENGUMPULAN ====================
async function loadAssignmentsPage(filter = currentFilter) {
  currentFilter = filter;
  try {
    const res = await apiFetch(`/api/assignments?filter=${filter}`);
    const json = await res.json();
    if (!json.success) return;

    renderAssignmentsList(json.data);
    updateFilterButtons(filter);
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Failed to load assignments:', err);
  }
}

function filterAssignments(filter) {
  loadAssignmentsPage(filter);
}

function updateFilterButtons(filter) {
  document.querySelectorAll('.asg-filter-btn').forEach(btn => {
    btn.className = 'asg-filter-btn px-3 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900';
  });
  const activeBtn = document.getElementById(`filter-asg-${filter}`);
  if (activeBtn) {
    activeBtn.className = 'asg-filter-btn px-3 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-800 shadow-xs';
  }
}

function renderAssignmentsList(assignments) {
  const container = document.getElementById('assignments-container');
  if (!container) return;

  if (assignments.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-10 border border-slate-200 text-center space-y-3">
        <i data-lucide="file-question" class="w-10 h-10 mx-auto text-slate-300"></i>
        <h4 class="text-sm font-bold text-slate-700">Tidak ada tugas dalam kategori ini</h4>
        <p class="text-xs text-slate-400">Semua tugas mata kuliah Anda telah selesai dikerjakan.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = assignments.map(asg => {
    const isSubmitted = !!asg.sub_id;
    return `
      <div class="bg-white rounded-2xl border border-slate-200 hover:border-brand-200 shadow-xs transition p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <span class="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">${asg.course_code}</span>
              <span class="text-xs font-semibold text-brand-700">${asg.course_name}</span>
            </div>
            <h3 class="text-base font-bold text-slate-900">${asg.title}</h3>
            <p class="text-xs text-slate-500">Dosen Pengampu: <span class="font-medium text-slate-700">${asg.lecturer}</span></p>
          </div>
          ${isSubmitted ? `
            <div class="text-right">
              <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                <i data-lucide="check" class="w-3.5 h-3.5"></i> Sudah Dikumpulkan
              </span>
              <span class="block text-[10px] text-slate-400 mt-1 font-mono">${asg.sub_submitted_at}</span>
            </div>
          ` : `
            <div class="text-right">
              <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200">
                <i data-lucide="clock" class="w-3.5 h-3.5"></i> Menunggu Pengumpulan
              </span>
              <span class="block text-[10px] text-rose-600 font-bold mt-1">Batas: ${asg.deadline}</span>
            </div>
          `}
        </div>

        <p class="text-xs text-slate-600 leading-relaxed bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
          ${asg.description}
        </p>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div class="flex items-center space-x-3 text-slate-500 text-[11px]">
            <span><i data-lucide="calendar" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i> Batas: <b>${asg.deadline} WIB</b></span>
            <span><i data-lucide="award" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i> Max Score: <b>${asg.max_score}</b></span>
          </div>

          <div class="flex items-center space-x-2">
            ${asg.attachment_name ? `
              <a href="${asg.attachment_url}" download class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition flex items-center space-x-1 text-xs">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
                <span>Unduh Soal</span>
              </a>
            ` : ''}

            <button onclick="openUploadModal('${asg.id}')" class="px-4 py-2 ${
              isSubmitted ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-500/20'
            } rounded-xl font-bold transition flex items-center space-x-1.5 text-xs">
              <i data-lucide="${isSubmitted ? 'eye' : 'upload'}" class="w-3.5 h-3.5"></i>
              <span>${isSubmitted ? 'Lihat / Perbarui Berkas' : 'Upload Berkas Tugas'}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function openUploadModal(assignmentId) {
  try {
    const res = await apiFetch(`/api/assignments/${assignmentId}`);
    const json = await res.json();
    if (!json.success) return;

    const asg = json.data;
    document.getElementById('upload-asg-id').value = asg.id;
    document.getElementById('modal-asg-course-code').textContent = `${asg.course_code} - ${asg.course_name}`;
    document.getElementById('modal-asg-title').textContent = asg.title;
    document.getElementById('modal-asg-desc').textContent = asg.description;

    const badge = document.getElementById('modal-asg-deadline-badge');
    badge.textContent = `Batas: ${asg.deadline}`;
    badge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-800';

    const attWrapper = document.getElementById('modal-asg-attachment-wrapper');
    const attLink = document.getElementById('modal-asg-attachment-link');
    const attName = document.getElementById('modal-asg-attachment-name');
    if (asg.attachment_name) {
      attWrapper.classList.remove('hidden');
      attLink.href = asg.attachment_url;
      attName.textContent = `Unduh Lampiran: ${asg.attachment_name}`;
    } else {
      attWrapper.classList.add('hidden');
    }

    const prevBox = document.getElementById('modal-asg-prev-submission');
    const prevTime = document.getElementById('modal-asg-prev-time');
    const prevFilename = document.getElementById('modal-asg-prev-filename');
    const prevFilesize = document.getElementById('modal-asg-prev-filesize');
    const prevDownload = document.getElementById('modal-asg-prev-download');
    const cancelBtn = document.getElementById('btn-cancel-submission');

    if (asg.sub_id) {
      prevBox.classList.remove('hidden');
      prevTime.textContent = asg.sub_submitted_at;
      prevFilename.textContent = asg.sub_file_name;
      prevFilesize.textContent = `(${(asg.sub_file_size / 1024).toFixed(1)} KB)`;
      prevDownload.href = `/${asg.sub_file_path}`;
      document.getElementById('asg-student-notes').value = asg.sub_notes || '';
      cancelBtn.classList.remove('hidden');
    } else {
      prevBox.classList.add('hidden');
      cancelBtn.classList.add('hidden');
      document.getElementById('asg-student-notes').value = '';
    }

    document.getElementById('asg-file-input').value = '';
    document.getElementById('asg-file-label').textContent = 'Klik untuk memilih file atau tarik ke sini';

    openModal('modal-upload-tugas');
  } catch (err) {
    showToast('Gagal memuat tugas: ' + err.message, 'error');
  }
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('asg-file-input');
  const label = document.getElementById('asg-file-label');

  if (!dropZone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      label.textContent = `File dipilih: ${files[0].name} (${(files[0].size / 1024).toFixed(1)} KB)`;
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      label.textContent = `File dipilih: ${fileInput.files[0].name} (${(fileInput.files[0].size / 1024).toFixed(1)} KB)`;
    }
  });
}

async function submitUploadTugas(e) {
  e.preventDefault();
  const asgId = document.getElementById('upload-asg-id').value;
  const fileInput = document.getElementById('asg-file-input');
  const notes = document.getElementById('asg-student-notes').value;

  if (fileInput.files.length === 0) {
    showToast('Silakan pilih berkas tugas terlebih dahulu.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-tugas');
  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin inline-block mr-1">↻</span> Mengunggah...`;

  try {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('notes', notes);

    const res = await apiFetch(`/api/assignments/${asgId}/submit`, {
      method: 'POST',
      body: formData
    });

    const json = await res.json();
    if (!json.success) {
      showToast(json.error || 'Gagal mengunggah tugas.', 'error');
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="upload" class="w-4 h-4 inline mr-1"></i> Unggah Tugas`;
      if (window.lucide) lucide.createIcons({ root: btn });
      return;
    }

    closeModal('modal-upload-tugas');
    showToast('Tugas Anda berhasil diunggah!', 'success');
    await loadAssignmentsPage();
    await loadDashboard();
  } catch (err) {
    showToast('Terjadi kesalahan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="upload" class="w-4 h-4 inline mr-1"></i> Unggah Tugas`;
    if (window.lucide) lucide.createIcons({ root: btn });
  }
}

async function cancelExistingSubmission() {
  const asgId = document.getElementById('upload-asg-id').value;
  if (!confirm('Apakah Anda yakin ingin membatalkan pengumpulan tugas ini?')) return;

  try {
    const res = await apiFetch(`/api/assignments/${asgId}/submission`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) {
      showToast(json.error || 'Gagal membatalkan pengumpulan.', 'error');
      return;
    }
    closeModal('modal-upload-tugas');
    showToast('Pengumpulan tugas dibatalkan.', 'info');
    await loadAssignmentsPage();
    await loadDashboard();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ==================== TAB 4: RENCANA STUDI (KRS ONLINE) ====================
async function loadKrsPage() {
  try {
    const res = await apiFetch('/api/krs');
    const json = await res.json();
    if (!json.success) return;

    const { maxSks, totalSksTaken, remainingSks, enrolled, catalog } = json.data;

    document.getElementById('krs-stat-taken').textContent = `${totalSksTaken} SKS`;
    document.getElementById('krs-stat-course-count').textContent = `${enrolled.length} Mata Kuliah`;
    document.getElementById('krs-stat-max').textContent = `${maxSks} SKS`;
    document.getElementById('krs-stat-remaining').textContent = `${remainingSks} SKS`;
    document.getElementById('krs-enrolled-summary').textContent = `${enrolled.length} Mata Kuliah Terdaftar (${totalSksTaken} SKS)`;

    // Render Enrolled Table
    const tbody = document.getElementById('krs-enrolled-tbody');
    if (enrolled.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-6 text-slate-400 italic">
            Belum ada mata kuliah yang diambil. Silakan pilih dari katalog di bawah.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = enrolled.map(c => `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-3 px-3 font-mono font-bold text-slate-800">${c.code}</td>
          <td class="py-3 px-3">
            <div class="font-bold text-slate-900">${c.name}</div>
            <div class="text-[10px] text-slate-400">${c.category}</div>
          </td>
          <td class="py-3 px-3 font-bold text-brand-700">${c.sks} SKS</td>
          <td class="py-3 px-3 text-slate-600">${c.lecturer}</td>
          <td class="py-3 px-3 text-slate-500 whitespace-nowrap">
            <div>${c.day}, ${c.time_start} - ${c.time_end}</div>
            <div class="text-[10px] text-slate-400">${c.room}</div>
          </td>
          <td class="py-3 px-3 text-center">
            <button onclick="dropCourseFromKrs('${c.id}', '${c.name}')" class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center space-x-1 mx-auto">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              <span>Batalkan / Drop</span>
            </button>
          </td>
        </tr>
      `).join('');
    }

    // Render Catalog Grid
    const catalogGrid = document.getElementById('krs-catalog-grid');
    catalogGrid.innerHTML = catalog.map(c => {
      const isEnrolled = c.isEnrolled;
      const willExceedSks = !isEnrolled && (totalSksTaken + c.sks > maxSks);

      return `
        <div class="p-5 rounded-2xl border ${isEnrolled ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:border-brand-300'} transition space-y-3 flex flex-col justify-between">
          <div class="space-y-2">
            <div class="flex items-start justify-between">
              <div class="flex items-center space-x-2">
                <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800">${c.code}</span>
                <span class="text-xs font-bold text-brand-700">${c.sks} SKS</span>
              </div>
              ${isEnrolled ? `
                <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  <i data-lucide="check" class="w-3 h-3"></i> Sudah Diambil
                </span>
              ` : `
                <span class="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">${c.category}</span>
              `}
            </div>

            <div>
              <h4 class="text-sm font-bold text-slate-900">${c.name}</h4>
              <p class="text-[11px] text-slate-500 mt-0.5">${c.description || 'Materi perkuliahan kurikulum standar prodi.'}</p>
            </div>

            <div class="text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100 space-y-0.5">
              <div><i data-lucide="user" class="w-3 h-3 inline mr-1 text-slate-400"></i> ${c.lecturer}</div>
              <div><i data-lucide="clock" class="w-3 h-3 inline mr-1 text-slate-400"></i> ${c.day}, ${c.time_start} - ${c.time_end} WIB</div>
              <div><i data-lucide="map-pin" class="w-3 h-3 inline mr-1 text-slate-400"></i> ${c.room}</div>
            </div>
          </div>

          <div class="pt-2">
            ${isEnrolled ? `
              <button onclick="dropCourseFromKrs('${c.id}', '${c.name}')" class="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
                <span>Batalkan Mata Kuliah Ini</span>
              </button>
            ` : willExceedSks ? `
              <button disabled class="w-full py-2 bg-slate-200 text-slate-400 rounded-xl text-xs font-bold cursor-not-allowed">
                Kuota SKS Tidak Cukup (Maks 24 SKS)
              </button>
            ` : `
              <button onclick="enrollCourseToKrs('${c.id}', '${c.name}', ${c.sks})" class="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20 transition flex items-center justify-center space-x-1.5">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                <span>Ambil Mata Kuliah Ini (+${c.sks} SKS)</span>
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    showToast('Gagal memuat data KRS: ' + err.message, 'error');
  }
}

// Enroll Course into KRS
async function enrollCourseToKrs(courseId, courseName, sks) {
  try {
    const res = await apiFetch('/api/krs/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId })
    });

    const json = await res.json();
    if (!json.success) {
      showToast(json.error || 'Gagal mengambil mata kuliah.', 'error');
      return;
    }

    showToast(`Mata kuliah "${courseName}" (+${sks} SKS) berhasil ditambahkan ke KRS!`, 'success');
    await loadKrsPage();
    await loadDashboard();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Drop Course from KRS
async function dropCourseFromKrs(courseId, courseName) {
  if (!confirm(`Apakah Anda yakin ingin membatalkan/menghapus mata kuliah "${courseName}" dari KRS Anda?`)) return;

  try {
    const res = await apiFetch('/api/krs/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId })
    });

    const json = await res.json();
    if (!json.success) {
      showToast(json.error || 'Gagal membatalkan mata kuliah.', 'error');
      return;
    }

    showToast(`Mata kuliah "${courseName}" berhasil dihapus dari KRS.`, 'info');
    await loadKrsPage();
    await loadDashboard();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ==================== TAB 5: JADWAL & KULIAH ====================
async function loadCoursesPage() {
  try {
    const res = await apiFetch('/api/courses');
    const json = await res.json();
    if (!json.success) return;

    const container = document.getElementById('full-courses-list');
    if (!container) return;

    if (json.data.length === 0) {
      container.innerHTML = `<p class="col-span-2 text-xs text-slate-400 italic">Belum ada mata kuliah yang diambil dalam KRS.</p>`;
      return;
    }

    container.innerHTML = json.data.map(c => `
      <div class="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 hover:border-brand-200 transition">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-700">${c.code}</span>
            <h3 class="text-base font-bold text-slate-900">${c.name}</h3>
            <p class="text-xs text-slate-500">${c.category} • ${c.sks} SKS</p>
          </div>
          <button onclick="viewCourseSessionsDetail('${c.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1">
            <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
            <span>Silabus & Presensi</span>
          </button>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <div>
            <span class="text-[10px] text-slate-400 block font-medium">Dosen Pengampu:</span>
            <span class="font-bold text-slate-800">${c.lecturer}</span>
            <span class="text-[10px] text-slate-400 font-mono block">NIP: ${c.lecturer_nip || '-'}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 block font-medium">Jadwal Kuliah:</span>
            <span class="font-bold text-slate-800">${c.day}, ${c.time_start} - ${c.time_end} WIB</span>
            <span class="text-[10px] text-slate-500 block">${c.room}</span>
          </div>
        </div>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons({ root: container });
  } catch (err) {
    console.error('Failed to load courses page:', err);
  }
}
