const app = document.getElementById('app');

const state = {
  token: localStorage.getItem('nri_token') || '',
  user: JSON.parse(localStorage.getItem('nri_user') || 'null'),
};

function setMessage(type, text) {
  const alertNode = document.getElementById('form-alert');
  if (!alertNode) return;
  alertNode.classList.remove('success', 'error');
  alertNode.classList.add(type, 'show');
  alertNode.textContent = text;
}

function clearMessage() {
  const alertNode = document.getElementById('form-alert');
  if (!alertNode) return;
  alertNode.classList.remove('show', 'success', 'error');
  alertNode.textContent = '';
}

function redirect(path) {
  window.location.pathname = path;
}

function isStudentRoute() {
  return window.location.pathname.startsWith('/student');
}

function isAdminRoute() {
  return window.location.pathname.startsWith('/admin');
}

async function fetchJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token && !headers.Authorization) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch (err) {
    payload = { message: 'Unexpected server response.' };
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

function renderStudentLogin() {
  app.innerHTML = `
    <div class="app-shell">
      <div class="auth-card">
        <div class="auth-hero">
          <h1>NRI Institute</h1>
          <p>Secure student and admin access to academic events, registrations, and institutional updates.</p>
        </div>
        <div class="auth-form-panel">
          <div class="tabs">
            <button class="tab-button active" type="button">Student Login</button>
            <button class="tab-button" type="button" onclick="redirect('/admin/login')">Admin Login</button>
          </div>

          <h2 class="form-title">Student Login</h2>
          <div id="form-alert" class="alert"></div>
          <form id="student-login-form">
            <div class="field">
              <label for="student-email">College Email</label>
              <input id="student-email" type="email" name="email" required />
            </div>
            <div class="field">
              <label for="student-password">Password</label>
              <input id="student-password" type="password" name="password" required />
            </div>
            <button class="primary-btn" type="submit">Login</button>
          </form>
          <a class="secondary-link" href="/student/register">New Student? Register Here</a>
          <div class="notice">Only authorized students may register and access the student portal.</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('student-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const email = document.getElementById('student-email').value.trim();
    const password = document.getElementById('student-password').value;

    if (!email || !password) {
      setMessage('error', 'Please enter valid student details.');
      return;
    }

    try {
      const result = await fetchJson('/api/student/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      state.token = result.token;
      state.user = result.user;
      localStorage.setItem('nri_token', result.token);
      localStorage.setItem('nri_user', JSON.stringify(result.user));
      redirect('/student/dashboard');
    } catch (error) {
      setMessage('error', error.message);
    }
  });
}

function renderAdminLogin() {
  app.innerHTML = `
    <div class="app-shell">
      <div class="auth-card">
        <div class="auth-hero">
          <h1>Administrator Access</h1>
          <p>Restricted dashboard for NRI Institute administration.</p>
        </div>
        <div class="auth-form-panel">
          <div class="tabs">
            <button class="tab-button" type="button" onclick="redirect('/student/login')">Student Login</button>
            <button class="tab-button active" type="button">Admin Login</button>
          </div>

          <h2 class="form-title">Admin Login</h2>
          <div id="form-alert" class="alert"></div>
          <form id="admin-login-form">
            <div class="field">
              <label for="admin-email">Admin Email</label>
              <input id="admin-email" type="email" name="email" required />
            </div>
            <div class="field">
              <label for="admin-password">Password</label>
              <input id="admin-password" type="password" name="password" required />
            </div>
            <button class="primary-btn" type="submit">Login</button>
          </form>
          <div class="notice">Admin accounts are seeded securely and are not publicly registerable.</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('admin-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;

    if (!email || !password) {
      setMessage('error', 'Admin email and password are required.');
      return;
    }

    try {
      const result = await fetchJson('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      state.token = result.token;
      state.user = result.user;
      localStorage.setItem('nri_token', result.token);
      localStorage.setItem('nri_user', JSON.stringify(result.user));
      redirect('/admin/dashboard');
    } catch (error) {
      setMessage('error', error.message);
    }
  });
}

function renderStudentRegister() {
  app.innerHTML = `
    <div class="app-shell">
      <div class="auth-card">
        <div class="auth-hero">
          <h1>Student Registration</h1>
          <p>Only students pre-approved by the institute administration can create an account.</p>
        </div>
        <div class="auth-form-panel">
          <h2 class="form-title">Register Student</h2>
          <div id="form-alert" class="alert"></div>
          <form id="student-register-form">
            <div class="form-grid">
              <div class="field full">
                <label for="fullName">Full Name</label>
                <input id="fullName" name="fullName" required />
              </div>
              <div class="field">
                <label for="collegeEmail">College Email ID</label>
                <input id="collegeEmail" type="email" name="collegeEmail" required />
              </div>
              <div class="field">
                <label for="studentId">Student ID / Roll Number</label>
                <input id="studentId" name="studentId" required />
              </div>
              <div class="field">
                <label for="department">Department</label>
                <input id="department" name="department" required />
              </div>
              <div class="field">
                <label for="yearOfStudy">Year of Study</label>
                <input id="yearOfStudy" name="yearOfStudy" required />
              </div>
              <div class="field">
                <label for="section">Section</label>
                <input id="section" name="section" required />
              </div>
              <div class="field">
                <label for="phoneNumber">Phone Number</label>
                <input id="phoneNumber" name="phoneNumber" required />
              </div>
              <div class="field">
                <label for="password">Password</label>
                <input id="password" type="password" name="password" required />
              </div>
              <div class="field">
                <label for="confirmPassword">Confirm Password</label>
                <input id="confirmPassword" type="password" name="confirmPassword" required />
              </div>
            </div>
            <button class="primary-btn" type="submit">Register</button>
          </form>
          <a class="secondary-link" href="/student/login">Already have an account? Login</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('student-register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const payload = {
      fullName: document.getElementById('fullName').value.trim(),
      collegeEmail: document.getElementById('collegeEmail').value.trim(),
      studentId: document.getElementById('studentId').value.trim(),
      department: document.getElementById('department').value.trim(),
      yearOfStudy: document.getElementById('yearOfStudy').value.trim(),
      section: document.getElementById('section').value.trim(),
      phoneNumber: document.getElementById('phoneNumber').value.trim(),
      password: document.getElementById('password').value,
      confirmPassword: document.getElementById('confirmPassword').value,
    };

    for (const key of Object.keys(payload)) {
      if (!payload[key]) {
        setMessage('error', 'Please enter valid student details.');
        return;
      }
    }

    try {
      const result = await fetchJson('/api/student/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMessage('success', result.message);
      document.getElementById('student-register-form').reset();
    } catch (error) {
      setMessage('error', error.message);
    }
  });
}

function renderStudentDashboard() {
  if (!state.user || state.user.role !== 'STUDENT') {
    redirect('/student/login');
    return;
  }

  app.innerHTML = `
    <div class="dashboard-shell">
      <div class="topbar">
        <h2>Student Dashboard</h2>
        <div class="topbar-actions">
          <span>${state.user.email}</span>
          <button class="small-btn" id="logout-btn">Logout</button>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <h3>My Profile</h3>
          <div id="profile-block">Loading profile...</div>
        </div>
        <div class="card">
          <h3>Upcoming Events</h3>
          <ul id="events-list" class="list"></ul>
        </div>
        <div class="card">
          <h3>Clubs</h3>
          <ul id="clubs-list" class="list"></ul>
        </div>
      </div>
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('nri_token');
    localStorage.removeItem('nri_user');
    state.token = '';
    state.user = null;
    redirect('/student/login');
  });

  fetchJson('/api/student/dashboard')
    .then((data) => {
      const profile = data.profile || {};
      document.getElementById('profile-block').innerHTML = `
        <p><strong>Name:</strong> ${profile.student_id || 'Not available'}</p>
        <p><strong>Email:</strong> ${state.user.email}</p>
        <p><strong>Department:</strong> ${profile.department || 'Not available'}</p>
        <p><strong>Year:</strong> ${profile.year || 'Not available'}</p>
        <p><strong>Section:</strong> ${profile.section || 'Not available'}</p>
      `;

      const events = data.events || [];
      document.getElementById('events-list').innerHTML = events.map(
        (event) => `<li>${event.type}: ${event.title}</li>`
      ).join('');

      const clubs = data.clubs || [];
      document.getElementById('clubs-list').innerHTML = clubs.map(
        (club) => `<li>${club.name}</li>`
      ).join('');
    })
    .catch((error) => {
      if (error.message.includes('Access Denied')) {
        redirect('/student/login');
      } else {
        app.innerHTML = `<div class="app-shell"><div class="auth-card"><div class="auth-form-panel"><h2>Unable to load dashboard</h2><p>${error.message}</p></div></div></div>`;
      }
    });
}

function renderAdminDashboard() {
  if (!state.user || state.user.role !== 'ADMIN') {
    redirect('/admin/login');
    return;
  }

  app.innerHTML = `
    <div class="dashboard-shell">
      <div class="topbar">
        <h2>Admin Dashboard</h2>
        <div class="topbar-actions">
          <span>${state.user.email}</span>
          <button class="small-btn" id="logout-btn">Logout</button>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <h3>Total Students</h3>
          <div id="student-count" class="metric">Loading...</div>
        </div>
        <div class="card">
          <h3>Pending Verification</h3>
          <div id="pending-count" class="metric">Loading...</div>
        </div>
        <div class="card">
          <h3>Announcements</h3>
          <ul id="announcement-list" class="list"></ul>
        </div>
      </div>
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('nri_token');
    localStorage.removeItem('nri_user');
    state.token = '';
    state.user = null;
    redirect('/admin/login');
  });

  fetchJson('/api/admin/dashboard')
    .then((data) => {
      document.getElementById('student-count').textContent = data.stats.totalStudents;
      document.getElementById('pending-count').textContent = data.stats.pendingVerification;
      const announcements = data.announcements || [];
      document.getElementById('announcement-list').innerHTML = announcements.map((item) => `<li>${item}</li>`).join('');
    })
    .catch((error) => {
      if (error.message.includes('Access Denied')) {
        redirect('/admin/login');
      } else {
        app.innerHTML = `<div class="app-shell"><div class="auth-card"><div class="auth-form-panel"><h2>Unable to load admin dashboard</h2><p>${error.message}</p></div></div></div>`;
      }
    });
}

function renderAccessDenied() {
  app.innerHTML = `
    <div class="app-shell">
      <div class="auth-card">
        <div class="auth-form-panel">
          <h2>Access Denied</h2>
          <p>You do not have permission to access this page.</p>
          <a href="/student/login" class="secondary-link">Back to login</a>
        </div>
      </div>
    </div>
  `;
}

function route() {
  const path = window.location.pathname;

  if (path === '/' || path === '') {
    if (state.user && state.user.role === 'ADMIN') {
      redirect('/admin/dashboard');
      return;
    }
    if (state.user && state.user.role === 'STUDENT') {
      redirect('/student/dashboard');
      return;
    }
    redirect('/student/login');
    return;
  }

  if (path === '/student/login') {
    renderStudentLogin();
    return;
  }

  if (path === '/admin/login') {
    renderAdminLogin();
    return;
  }

  if (path === '/student/register') {
    renderStudentRegister();
    return;
  }

  if (path === '/student/dashboard') {
    if (!state.token || !state.user || state.user.role !== 'STUDENT') {
      redirect('/student/login');
      return;
    }
    renderStudentDashboard();
    return;
  }

  if (path === '/admin/dashboard') {
    if (!state.token || !state.user || state.user.role !== 'ADMIN') {
      redirect('/admin/login');
      return;
    }
    renderAdminDashboard();
    return;
  }

  renderAccessDenied();
}

window.addEventListener('popstate', route);
route();

window.history.pushState = (function (originalPushState) {
  return function (...args) {
    originalPushState.apply(this, args);
    route();
  };
})(window.history.pushState);

window.history.replaceState = (function (originalReplaceState) {
  return function (...args) {
    originalReplaceState.apply(this, args);
    route();
  };
})(window.history.replaceState);
