// ============================================================
// KU Finance Tracker — Frontend JavaScript Bridge
// ============================================================
// Act as a pure communications bridge between the user interface
// and the C++ REST API. NO calculations, aggregations, sorting,
// or state preservation occurs here. The backend is the single
// source of truth for all business and financial logic.
// ============================================================

// --- Configuration & Global Constants ---
const API_BASE = ''; // Base URL is relative to serve root (served by C++ on port 8080)

// Visual mapping for expense categories (icons, labels, and chart styling)
const CAT_META = {
  food: { icon: '🍜', label: 'Food', color: '#4f8ef7' },
  transport: { icon: '🚌', label: 'Transport', color: '#f59e0b' },
  clothes: { icon: '👕', label: 'Clothes', color: '#7c3aed' },
  study: { icon: '📚', label: 'Study', color: '#22c55e' },
  other: { icon: '💡', label: 'Other', color: '#6b7280' },
};

// --- Application State ---
let authToken = sessionStorage.getItem('ft_token') || '';
let signupEmail = '';
let signupPassword = '';
let onboardProfile = {
  isStudent: true,
  inHostel: true,
  maritalStatus: 'single',
  hasKids: false,
  hasLoan: false,
  loanAmount: 0,
};

// Chart.js instances (need to be destroyed before recreating to avoid visual bugs)
let categoryChart = null;
let budgetChart = null;

// ============================================================
// 1. HTTP Communication Helpers
// ============================================================

/**
 * Standard API request wrapper that appends token authentication headers
 * and returns JSON outputs directly.
 */
async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = 'Bearer ' + authToken;
  }
  
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(API_BASE + path, options);
  if (!response.ok && response.status !== 400 && response.status !== 401 && response.status !== 409) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  return await response.json();
}

// ============================================================
// 2. User Interface Navigation & Helper Functions
// ============================================================

/**
 * Show a specific screen and hide all others.
 */
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
  }
}

/**
 * Display errors inside input boxes for instant validation feedback.
 */
function showError(elementId, msg) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideErrors() {
  document.querySelectorAll('.error-msg').forEach(el => el.classList.add('hidden'));
}

/**
 * Format raw numbers into currency (NPR) with comma grouping.
 */
function formatNPR(amount) {
  return 'NPR ' + Math.round(amount).toLocaleString();
}

/**
 * Display toast status messages in the bottom-right corner.
 */
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = isError ? '#ef4444' : '#22c55e';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================================
// 3. User Authentication (Sign In & Register)
// ============================================================

/**
 * Handle user sign in by sending credentials to backend and loading dashboard on success.
 */
async function handleSignIn() {
  hideErrors();
  const email = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  
  if (!email || !password) {
    showError('signin-error', 'Please fill in both email and password.');
    return;
  }
  
  const btn = document.getElementById('btn-signin');
  btn.classList.add('loading');
  
  try {
    const res = await api('POST', '/api/auth/login', { email, password });
    if (!res.success) {
      showError('signin-error', res.error || 'Authentication failed. Please check your inputs.');
      return;
    }
    
    // Save authentication state
    authToken = res.token;
    sessionStorage.setItem('ft_token', authToken);
    
    // Render the workspace
    renderDashboard(res.user, res.dashboard);
    showScreen('screen-dash');
    showToast(`Welcome back, ${res.user.displayName}!`);
  } catch (err) {
    console.error(err);
    showError('signin-error', 'Server connection failed. Make sure the C++ backend is running.');
  } finally {
    btn.classList.remove('loading');
  }
}

/**
 * Move from sign-up step 1 (credentials) to step 2 (financial profiles).
 */
function handleSignUpNext() {
  hideErrors();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;
  
  if (!email || !password || !confirm) {
    showError('signup-error', 'All fields are required.');
    return;
  }
  if (!email.includes('@') || !email.includes('.')) {
    showError('signup-error', 'Please enter a valid email address.');
    return;
  }
  if (password.length < 6) {
    showError('signup-error', 'Password must be at least 6 characters.');
    return;
  }
  if (password !== confirm) {
    showError('signup-error', 'Passwords do not match.');
    return;
  }
  
  // Store details temporarily for the final registration submit
  signupEmail = email;
  signupPassword = password;
  
  // Begin onboarding workflow
  resetOnboarding();
  showScreen('screen-onboard');
}

/**
 * Final step of registration: submit credentials along with onboarding details to backend.
 */
async function handleCompleteRegistration() {
  const budgetVal = document.getElementById('budget-in').value;
  const budget = parseInt(budgetVal, 10);
  
  if (!budgetVal || isNaN(budget) || budget <= 0) {
    showToast('Please set a valid monthly budget amount.', true);
    return;
  }
  
  let loanAmount = 0;
  if (onboardProfile.hasLoan) {
    const loanVal = document.getElementById('loan-amount-in').value;
    loanAmount = parseInt(loanVal, 10);
    if (!loanVal || isNaN(loanAmount) || loanAmount < 0) {
      showToast('Please specify a valid loan amount.', true);
      return;
    }
  }
  
  const btn = document.getElementById('btn-start-tracking');
  btn.classList.add('loading');
  
  try {
    const payload = {
      email: signupEmail,
      password: signupPassword,
      isStudent: onboardProfile.isStudent,
      inHostel: onboardProfile.isStudent ? onboardProfile.inHostel : false,
      maritalStatus: onboardProfile.isStudent ? '' : onboardProfile.maritalStatus,
      hasKids: (!onboardProfile.isStudent && onboardProfile.maritalStatus === 'married') ? onboardProfile.hasKids : false,
      hasLoan: onboardProfile.hasLoan,
      loanAmount: onboardProfile.hasLoan ? loanAmount : 0,
      budget: budget
    };
    
    const res = await api('POST', '/api/auth/register', payload);
    if (!res.success) {
      showToast(res.error || 'Registration failed.', true);
      showScreen('screen-signup');
      return;
    }
    
    // Save auth token
    authToken = res.token;
    sessionStorage.setItem('ft_token', authToken);
    
    // Render and direct to dashboard
    renderDashboard(res.user, res.dashboard);
    showScreen('screen-dash');
    showToast('Welcome to KU Finance Tracker! 🚀');
  } catch (err) {
    console.error(err);
    showToast('Failed to connect to the backend server.', true);
  } finally {
    btn.classList.remove('loading');
  }
}

/**
 * Perform sign out and clear session tokens.
 */
function handleLogout() {
  authToken = '';
  sessionStorage.removeItem('ft_token');
  document.getElementById('signin-email').value = '';
  document.getElementById('signin-password').value = '';
  showScreen('screen-signin');
  showToast('Logged out successfully.');
}

// ============================================================
// 4. Onboarding Workflow Manager (UI selection logic only)
// ============================================================

function resetOnboarding() {
  onboardProfile = {
    isStudent: true,
    inHostel: true,
    maritalStatus: 'single',
    hasKids: false,
    hasLoan: false,
    loanAmount: 0,
  };
  selectStudent(true);
  selectHostel(true);
  selectMarital('single');
  selectKids(false);
  selectLoan(false);
  document.getElementById('loan-amount-in').value = '';
  document.getElementById('budget-in').value = '';
  showObPanel('student-q');
}

function showObPanel(panelId) {
  document.querySelectorAll('.ob-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('ob-' + panelId).classList.remove('hidden');
  updateStepBar(panelId);
}

function getStepFlow() {
  if (onboardProfile.isStudent) {
    return ['student-q', 'hostel', 'budget'];
  }
  if (onboardProfile.maritalStatus === 'married') {
    return ['student-q', 'marital', 'kids', 'loan', 'budget'];
  }
  return ['student-q', 'marital', 'loan', 'budget'];
}

function updateStepBar(currentPanel) {
  const flow = getStepFlow();
  const idx = flow.indexOf(currentPanel);
  const bar = document.getElementById('step-bar');
  if (bar) {
    bar.innerHTML = flow.map((_, i) =>
      `<div class="step-dot${i <= idx ? ' done' : ''}"></div>`
    ).join('');
  }
}

function selectStudent(yes) {
  onboardProfile.isStudent = yes;
  document.getElementById('c-yes-student').classList.toggle('selected', yes);
  document.getElementById('c-no-student').classList.toggle('selected', !yes);
}

function selectHostel(yes) {
  onboardProfile.inHostel = yes;
  document.getElementById('c-hostel-yes').classList.toggle('selected', yes);
  document.getElementById('c-hostel-no').classList.toggle('selected', !yes);
}

function selectMarital(status) {
  onboardProfile.maritalStatus = status;
  document.getElementById('c-single').classList.toggle('selected', status === 'single');
  document.getElementById('c-married').classList.toggle('selected', status === 'married');
}

function selectKids(yes) {
  onboardProfile.hasKids = yes;
  document.getElementById('c-kids-yes').classList.toggle('selected', yes);
  document.getElementById('c-kids-no').classList.toggle('selected', !yes);
}

function selectLoan(yes) {
  onboardProfile.hasLoan = yes;
  document.getElementById('c-loan-yes').classList.toggle('selected', yes);
  document.getElementById('c-loan-no').classList.toggle('selected', !yes);
  document.getElementById('loan-amount-field').classList.toggle('hidden', !yes);
}

function handleObBack(target) {
  if (target === 'student-q') showObPanel('student-q');
  else if (target === 'marital') showObPanel('marital');
  else if (target === 'loan-back') {
    if (onboardProfile.maritalStatus === 'married') showObPanel('kids');
    else showObPanel('marital');
  } else if (target === 'budget-back') {
    if (onboardProfile.isStudent) showObPanel('hostel');
    else showObPanel('loan');
  }
}

// ============================================================
// 5. Dashboard Data Management & Actions
// ============================================================

/**
 * Fetch fresh data from the server and trigger UI render updates.
 */
async function refreshDashboard() {
  if (!authToken) return;
  try {
    const res = await api('GET', '/api/dashboard');
    if (!res.success) {
      handleLogout();
      return;
    }
    renderDashboard(res.user, res.dashboard);
  } catch (err) {
    console.error(err);
    showToast('Failed to update dashboard from backend.', true);
  }
}

/**
 * Add a new expense transaction.
 */
async function handleAddExpense() {
  const name = document.getElementById('exp-name').value.trim();
  const amtInput = document.getElementById('exp-amt').value;
  const amount = parseInt(amtInput, 10);
  const category = document.getElementById('exp-cat').value;
  
  if (!name) {
    showToast('Please enter an item name.', true);
    return;
  }
  if (!amtInput || isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid price.', true);
    return;
  }
  
  try {
    const res = await api('POST', '/api/expenses', { name, category, amount });
    if (!res.success) {
      showToast(res.error || 'Failed to add expense.', true);
      return;
    }
    
    // Reset forms
    document.getElementById('exp-name').value = '';
    document.getElementById('exp-amt').value = '';
    
    // Redraw using full backend recalculations
    renderDashboard(res.user || { displayName: document.getElementById('user-name').textContent }, res.dashboard);
    showToast('Expense added! ✓');
  } catch (err) {
    console.error(err);
    showToast('Failed to add transaction to server.', true);
  }
}

/**
 * Request transaction deletion from the C++ server.
 */
async function handleDeleteExpense(txId) {
  try {
    const res = await api('DELETE', `/api/expenses/${txId}`);
    if (!res.success) {
      showToast(res.error || 'Failed to delete transaction.', true);
      return;
    }
    
    // Re-render UI with new state returned by server
    renderDashboard({ displayName: document.getElementById('user-name').textContent }, res.dashboard);
    showToast('Transaction deleted.');
  } catch (err) {
    console.error(err);
    showToast('Error communicating transaction deletion.', true);
  }
}

// ============================================================
// 6. UI Rendering Engine (Pure DOM updates based on server JSON)
// ============================================================

/**
 * Orchestrates rendering of all UI blocks.
 */
function renderDashboard(user, dashboard) {
  if (user && user.displayName) {
    document.getElementById('user-name').textContent = user.displayName;
    document.getElementById('user-avatar').textContent = user.displayName.charAt(0).toUpperCase();
  }
  
  // Date banner
  const now = new Date();
  document.getElementById('month-label').textContent = 
    now.toLocaleString('default', { month: 'long' }).toUpperCase() + ' ' + now.getFullYear();
  
  // Summary Metrics
  document.getElementById('disp-budget').textContent = formatNPR(dashboard.budget);
  document.getElementById('disp-spent').textContent = formatNPR(dashboard.spent);
  document.getElementById('disp-left').textContent = formatNPR(dashboard.remaining);
  document.getElementById('spent-note').textContent = `${dashboard.budgetUsedPct}% of budget spent`;
  document.getElementById('remaining-note').textContent = `${dashboard.daysLeftInMonth} days remaining this month`;
  
  // Outstanding Debt Card
  const loanCard = document.getElementById('loan-card');
  if (dashboard.hasLoan && dashboard.loanAmount > 0) {
    loanCard.classList.remove('hidden');
    document.getElementById('disp-loan').textContent = formatNPR(dashboard.loanAmount);
  } else {
    loanCard.classList.add('hidden');
  }
  
  // Render Warning Banner
  renderBudgetWarning(dashboard.budgetWarning, dashboard.isOverBudget, dashboard.budgetUsedPct);
  
  // Render text-based Insights
  renderInsights(dashboard);
  
  // Highlight summaries
  document.getElementById('top-category').textContent = dashboard.topCategory ? `${CAT_META[dashboard.topCategory].icon} ${CAT_META[dashboard.topCategory].label}` : '—';
  document.getElementById('top-category-amt').textContent = dashboard.topCategoryAmount ? formatNPR(dashboard.topCategoryAmount) : 'No transactions';
  
  document.getElementById('top-item').textContent = dashboard.topItemName ? dashboard.topItemName : '—';
  document.getElementById('top-item-detail').textContent = dashboard.topItemCount ? `${dashboard.topItemCount} times (last: ${formatNPR(dashboard.topItemLastPrice)})` : 'No purchases yet';
  
  // Lists & Grids
  renderTopItemsList(dashboard.topItems);
  renderCategoryGrid(dashboard.categories, dashboard.topItems, dashboard.spent);
  renderRecentTransactionsList(dashboard.recentTransactions);
  
  // Graphical Charts
  renderVisualCharts(dashboard);
}

/**
 * Handle dynamic warning classes and text for the budget overspend banner.
 */
function renderBudgetWarning(message, isOver, usedPct) {
  const el = document.getElementById('budget-warning');
  if (!el) return;
  
  if (!message) {
    el.classList.add('hidden');
    return;
  }
  
  el.classList.remove('hidden', 'warning-green', 'warning-yellow', 'warning-red');
  
  if (isOver) {
    el.classList.add('warning-red');
  } else if (usedPct >= 80) {
    el.classList.add('warning-yellow');
  } else {
    el.classList.add('warning-green');
  }
  el.textContent = message;
}

/**
 * Renders user insights.
 */
function renderInsights(dashboard) {
  const el = document.getElementById('insight-text');
  if (!el) return;
  
  if (dashboard.spent === 0) {
    el.textContent = 'Welcome! Add your expenses to see custom insights.';
    return;
  }
  
  let insightText = '';
  if (dashboard.isOverBudget) {
    insightText = `You have exceeded your monthly budget by ${formatNPR(dashboard.spent - dashboard.budget)}. Consider reducing spending on discretionary categories.`;
  } else if (dashboard.budgetUsedPct >= 80) {
    insightText = `Be careful! You've used ${dashboard.budgetUsedPct}% of your budget. Focus on essentials only for the remaining days of the month.`;
  } else {
    const dailyRemaining = Math.round(dashboard.remaining / (dashboard.daysLeftInMonth || 1));
    insightText = `Good job! You are currently on track. You can spend up to ${formatNPR(dailyRemaining)} per day for the rest of the month.`;
  }
  el.textContent = insightText;
}

/**
 * Render the Top Purchased items list with ranks.
 */
function renderTopItemsList(items) {
  const container = document.getElementById('top-items-list');
  if (!container) return;
  
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state">No purchases recorded yet.</div>';
    return;
  }
  
  container.innerHTML = items.map((item, i) => {
    const meta = CAT_META[item.category] || { icon: '💰', label: item.category, color: '#999' };
    const avg = Math.round(item.totalAmount / item.count);
    const rankClass = i < 3 ? ` rank-${i + 1}` : '';
    return `
      <div class="top-item${rankClass}">
        <div class="top-item-left">
          <div class="top-rank">${i + 1}</div>
          <div>
            <div class="top-item-name">${meta.icon} ${item.name}</div>
            <div class="top-item-meta">${meta.label} · ${item.count} purchase${item.count > 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="top-item-right">
          <div class="top-item-price">${formatNPR(item.lastUnitPrice)}<span>/ea</span></div>
          <div class="top-item-total">${formatNPR(item.totalAmount)} total · avg ${formatNPR(avg)}</div>
        </div>
      </div>`;
  }).join('');
}

/**
 * Render individual category progress cards and sub-items lists.
 */
function renderCategoryGrid(categories, topItems, totalSpent) {
  const container = document.getElementById('cat-grid');
  if (!container) return;
  
  container.innerHTML = Object.entries(CAT_META).map(([key, meta]) => {
    const catData = categories.find(c => c.category === key);
    const total = catData ? catData.total : 0;
    const pct = totalSpent > 0 ? Math.min(100, Math.round((total / totalSpent) * 100)) : 0;
    
    // Filter items belonging to this category
    const catItems = (topItems || []).filter(item => item.category === key);
    const subItemsHTML = catItems.map(item => `
      <div class="sub-item">
        <span class="sub-name">${item.name}</span>
        <div class="sub-right">
          <span class="sub-count">×${item.count}</span>
          <span class="sub-unit">${formatNPR(item.lastUnitPrice)}/ea</span>
          <span class="sub-amt">${formatNPR(item.totalAmount)}</span>
        </div>
      </div>`).join('');
      
    return `
      <div class="cat-card">
        <div class="cat-header">
          <div class="cat-name"><span class="cat-icon">${meta.icon}</span>${meta.label}</div>
          <div class="cat-total">${formatNPR(total)}</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%; background:linear-gradient(90deg, ${meta.color}, var(--accent2))"></div>
        </div>
        ${subItemsHTML || '<div class="sub-item"><span class="sub-name" style="color:var(--muted)">No transactions</span></div>'}
      </div>`;
  }).join('');
}

/**
 * Render recent transaction feed with action triggers for deletion.
 */
function renderRecentTransactionsList(txs) {
  const container = document.getElementById('recent-list');
  if (!container) return;
  
  if (!txs || txs.length === 0) {
    container.innerHTML = '<div class="empty-state">No transaction logs available.</div>';
    return;
  }
  
  container.innerHTML = txs.map(tx => {
    const meta = CAT_META[tx.category] || { icon: '💰', label: tx.category, color: '#999' };
    const time = new Date(tx.timestamp).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return `
      <div class="recent-item">
        <div class="r-left">
          <div class="r-dot" style="background:${meta.color}"></div>
          <div>
            <div class="r-info">${tx.name}</div>
            <div class="r-sub">${meta.icon} ${meta.label} · ${time}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="r-amt">-${formatNPR(tx.amount)}</div>
          <button class="delete-btn" onclick="handleDeleteExpense(${tx.id})">Delete</button>
        </div>
      </div>`;
  }).join('');
}

/**
 * Render visual graphics using ChartJS.
 */
function renderVisualCharts(dashboard) {
  const activeCategories = (dashboard.categories || []).filter(c => c.total > 0);
  const spent = dashboard.spent;
  
  // 1. DOUGHNUT CHART (Category Breakdown)
  const catCtx = document.getElementById('categoryChart').getContext('2d');
  if (categoryChart) categoryChart.destroy();
  
  if (activeCategories.length === 0) {
    document.getElementById('category-caption').textContent = 'No spending recorded yet.';
    categoryChart = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: ['No data'],
        datasets: [{ data: [1], backgroundColor: ['#2a3045'] }]
      },
      options: { plugins: { legend: { display: false } } }
    });
  } else {
    const labels = activeCategories.map(c => CAT_META[c.category].label);
    const data = activeCategories.map(c => c.total);
    const colors = activeCategories.map(c => CAT_META[c.category].color);
    
    document.getElementById('category-caption').textContent = 
      `Total distribution of ${formatNPR(spent)} across major sectors.`;
      
    categoryChart = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#e8eaf0', padding: 12, font: { family: 'Sora', size: 10 } }
          }
        },
        cutout: '70%'
      }
    });
  }
  
  // 2. BAR CHART (Budget vs Spent comparison)
  const budCtx = document.getElementById('budgetChart').getContext('2d');
  if (budgetChart) budgetChart.destroy();
  
  const remaining = Math.max(0, dashboard.budget - spent);
  const overBudget = spent > dashboard.budget && dashboard.budget > 0;
  
  document.getElementById('budget-caption').textContent = dashboard.budget > 0
    ? (overBudget 
       ? `Alert: Over budget by ${formatNPR(spent - dashboard.budget)}!`
       : `${formatNPR(remaining)} remaining out of your ${formatNPR(dashboard.budget)} allowance.`)
    : 'Set a budget to view limits.';
    
  budgetChart = new Chart(budCtx, {
    type: 'bar',
    data: {
      labels: ['Spent', dashboard.budget > 0 ? 'Remaining' : 'Budget not set'],
      datasets: [{
        data: dashboard.budget > 0 ? [spent, remaining] : [spent, 0],
        backgroundColor: [overBudget ? '#ef4444' : '#4f8ef7', '#22c55e'],
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b7280', font: { family: 'Sora' } }, grid: { display: false } },
        y: {
          ticks: {
            color: '#6b7280',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: v => 'NPR ' + v.toLocaleString(),
          },
          grid: { color: '#2a3045' },
          beginAtZero: true
        }
      }
    }
  });
}

// ============================================================
// 7. Event Handlers & Initialization
// ============================================================

function setupEventListeners() {
  // Sign In / Screen switching triggers
  document.getElementById('btn-signin').addEventListener('click', handleSignIn);
  document.getElementById('btn-goto-signup').addEventListener('click', () => showScreen('screen-signup'));
  document.getElementById('btn-goto-signin').addEventListener('click', () => showScreen('screen-signin'));
  
  // Onboarding workflow buttons
  document.getElementById('btn-signup-next').addEventListener('click', handleSignUpNext);
  document.getElementById('c-yes-student').addEventListener('click', () => selectStudent(true));
  document.getElementById('c-no-student').addEventListener('click', () => selectStudent(false));
  document.getElementById('c-hostel-yes').addEventListener('click', () => selectHostel(true));
  document.getElementById('c-hostel-no').addEventListener('click', () => selectHostel(false));
  document.getElementById('c-single').addEventListener('click', () => selectMarital('single'));
  document.getElementById('c-married').addEventListener('click', () => selectMarital('married'));
  document.getElementById('c-kids-yes').addEventListener('click', () => selectKids(true));
  document.getElementById('c-kids-no').addEventListener('click', () => selectKids(false));
  document.getElementById('c-loan-yes').addEventListener('click', () => selectLoan(true));
  document.getElementById('c-loan-no').addEventListener('click', () => selectLoan(false));
  
  // Onboarding navigational step buttons
  document.getElementById('ob-next-student-q').addEventListener('click', () => {
    showObPanel(onboardProfile.isStudent ? 'hostel' : 'marital');
  });
  document.getElementById('ob-next-hostel').addEventListener('click', () => showObPanel('budget'));
  document.getElementById('ob-next-marital').addEventListener('click', () => {
    showObPanel(onboardProfile.maritalStatus === 'married' ? 'kids' : 'loan');
  });
  document.getElementById('ob-next-kids').addEventListener('click', () => showObPanel('loan'));
  document.getElementById('ob-next-loan').addEventListener('click', () => showObPanel('budget'));
  
  document.querySelectorAll('.ob-back').forEach(btn => {
    btn.addEventListener('click', () => handleObBack(btn.dataset.back));
  });
  
  // Onboarding finish and action buttons
  document.getElementById('btn-start-tracking').addEventListener('click', handleCompleteRegistration);
  document.getElementById('btn-add-expense').addEventListener('click', handleAddExpense);
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  
  // Enter key press triggers inside add expense input fields
  document.getElementById('exp-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddExpense();
  });
  document.getElementById('exp-amt').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddExpense();
  });
}

// Initial Bootstrapping
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  
  // If the user already has a valid token, attempt to restore dashboard view immediately
  if (authToken) {
    try {
      const res = await api('GET', '/api/dashboard');
      if (res.success) {
        renderDashboard(res.user, res.dashboard);
        showScreen('screen-dash');
        showToast('Session restored successfully.');
      } else {
        handleLogout();
      }
    } catch (err) {
      console.warn('Auto login failed. Directing to credentials prompt.');
      authToken = '';
      sessionStorage.removeItem('ft_token');
      showScreen('screen-signin');
    }
  } else {
    showScreen('screen-signin');
  }
});
