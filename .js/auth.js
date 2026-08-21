import {
  auth,
  createUserWithEmailAndPassword,
  firebaseConfigurationError,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from './firebase-auth.js';
import { renderModulePage } from './modules.js';
import { isLocalDataRequest, localApiRequest } from './local-store.js';

// Allows the frontend to work from VS Code Live Server (port 5500) while the API runs on port 3000.
const apiBaseUrl = window.location.port === '5500' ? 'http://localhost:3000' : '';
const localRfqStorageKey = 'procurex.temporary.rfqs';

function getLocalRfqs() {
  try {
    const records = JSON.parse(localStorage.getItem(localRfqStorageKey) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function saveLocalRfq(fields) {
  const record = {
    id: `LOCAL-RFQ-${Date.now().toString().slice(-8)}`,
    material: String(fields.material || '').trim(),
    quantity: Number(fields.quantity),
    deadline: String(fields.deadline || ''),
    budget: Number(fields.budget),
    specifications: String(fields.specifications || '').trim(),
    additionalRequirements: String(fields.additionalRequirements || '').trim(),
    status: 'draft',
    matchedVendorIds: [],
    savedLocally: true,
    createdAt: new Date().toISOString()
  };
  const records = getLocalRfqs();
  records.unshift(record);
  localStorage.setItem(localRfqStorageKey, JSON.stringify(records));
  return record;
}

function renderRfqRows(tableBody, rfqs) {
  if (!rfqs.length) {
    tableBody.innerHTML = '<tr><td colspan="7">No RFQs have been saved yet.</td></tr>';
    return;
  }
  const badge = (status) => status === 'sent' || status === 'completed' ? 'approved' : status === 'closed' ? 'danger' : 'pending';
  tableBody.innerHTML = rfqs.map((rfq) => `<tr><td><b>${rfq.id}</b><small>${rfq.savedLocally ? 'Saved locally' : 'Saved request'}</small></td><td>${rfq.material}</td><td>${rfq.quantity} pcs</td><td>${rfq.deadline}</td><td>${rfq.matchedVendorIds?.length || 0} matched</td><td><span class="status-badge ${badge(rfq.status)}">${rfq.status.toUpperCase()}</span></td><td><button class="row-action" type="button">View</button></td></tr>`).join('');
}

const appShell = document.querySelector('[data-app-shell]');
const landingPage = document.querySelector('[data-landing-page]');
const authView = document.querySelector('[data-auth-view]');
const dashboardView = document.querySelector('[data-dashboard-view]');
const feedback = document.querySelector('[data-auth-feedback]');
const loginForm = document.querySelector('[data-login-form]');
const loginButton = loginForm.querySelector('button[type="submit"]');
const loginLabel = loginForm.querySelector('[data-login-label]');
const loginArrow = loginForm.querySelector('[data-login-arrow]');
const loginMessage = loginForm.querySelector('[data-login-message]');
const registerForm = document.querySelector('[data-register-form]');
const roleSelect = registerForm.querySelector('[data-role-select]');
const vendorFields = registerForm.querySelector('[data-vendor-fields]');
const authTabs = document.querySelectorAll('[data-auth-tab]');
const authTitle = document.querySelector('[data-auth-title]');
const authDescription = document.querySelector('[data-auth-description]');

function setAuthTab(tab) {
  const loginSelected = tab === 'login';
  loginForm.hidden = !loginSelected;
  registerForm.hidden = loginSelected;
  authTabs.forEach((button) => {
    const active = button.dataset.authTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  authTitle.textContent = loginSelected ? 'Welcome back.' : 'Create your workspace.';
  authDescription.textContent = loginSelected
    ? 'Sign in to manage your procurement operations.'
    : 'Register as a buyer or supplier to begin working together.';
}

authTabs.forEach((button) => button.addEventListener('click', () => setAuthTab(button.dataset.authTab)));

if (firebaseConfigurationError) {
  loginButton.disabled = true;
  registerForm.querySelector('button[type="submit"]').disabled = true;
  loginMessage.textContent = 'Firebase is not configured. Add your Firebase web app settings in frontend/js/firebase-config.js.';
  setFeedback('Authentication is unavailable until Firebase configuration is added.', true);
}

const dashboardMarkup = (profile) => `
  <aside class="dashboard-sidebar">
    <div class="dashboard-brand"><span class="brand-mark">P</span><strong>ProcureX</strong><button class="sidebar-toggle" type="button" aria-label="Toggle sidebar">☰</button></div>
    <div class="company-selector"><span>⌂</span><strong>Sri Vari Communication<br />Private Limited</strong><i>⌄</i></div>
    <nav aria-label="Main navigation">
      <p class="nav-label">WORKSPACE</p>
      <a class="nav-item is-active" href="/dashboard"><span>▦</span>Dashboard</a>
      <a class="nav-item" href="/rfq"><span>↗</span>RFQ Management</a>
      <a class="nav-item" href="/vendors"><span>◌</span>Vendors</a>
      <a class="nav-item" href="/vendor-verification"><span>✓</span>Vendor Verification</a>
      <a class="nav-item" href="/quotations"><span>≡</span>Quotations</a>
      <a class="nav-item" href="/vendor-comparison"><span>⌁</span>Vendor Comparison</a>
      <p class="nav-label">OPERATIONS</p>
      <a class="nav-item" href="/purchase-orders"><span>□</span>Purchase Orders</a>
      <a class="nav-item" href="/inventory"><span>◇</span>Inventory</a>
      <a class="nav-item" href="/finance"><span>₹</span>Finance</a>
      <a class="nav-item" href="/invoices"><span>▤</span>Invoices</a>
      <a class="nav-item" href="/approvals"><span>✓</span>Approvals</a>
      <a class="nav-item" href="/analytics"><span>╱</span>Analytics</a>
      <a class="nav-item" href="/reports"><span>▥</span>Reports</a>
    </nav>
    <div class="sidebar-bottom"><div class="sidebar-profile"><span class="avatar">${profile ? profile.name.charAt(0).toUpperCase() : 'A'}</span><span><strong>${profile ? profile.name : 'Administrator'}</strong><small>${profile ? profile.role : 'Super Admin'}</small></span><i></i><b>⌄</b></div><a class="nav-item" href="/settings"><span>⚙</span>Settings</a><button type="button" class="logout-button" data-sign-out><span>↪</span>${profile ? 'Log out' : 'Sign in'}</button></div>
  </aside>
  <section class="dashboard-main">
    <header class="dashboard-topbar"><button class="mobile-menu" type="button" aria-label="Toggle navigation">☰</button><label class="search-box"><span>⌕</span><input aria-label="Search anything" placeholder="Search anything..." /><kbd>Ctrl + K</kbd></label><div class="topbar-actions"><button class="icon-button theme-button" type="button" aria-label="Change theme">☼</button><button class="icon-button notification-button" type="button" aria-label="Notifications">♧<i>5</i></button><div class="profile-chip"><span class="avatar">${profile ? profile.name.charAt(0).toUpperCase() : 'A'}</span><span><strong>${profile ? profile.name : 'Administrator'}</strong><small>${profile ? profile.role : 'Super Admin'}</small></span><span class="chevron">⌄</span></div></div></header>
    <main class="dashboard-content">
      <div class="dashboard-heading"><div><p class="eyebrow">BUYER WORKSPACE</p><h1>Good morning, ${profile ? profile.name.split(' ')[0] : 'there'}.</h1><p>Here is what is happening across your procurement operations.</p></div><button class="create-button" type="button"><span>+</span>Create RFQ</button></div>
      <section class="metric-grid" aria-label="Procurement metrics"><article class="metric-card"><div class="metric-icon blue">↗</div><span class="metric-label">Active RFQs</span><strong>24</strong><small class="trend positive">↑ 12.5% <em>vs last month</em></small></article><article class="metric-card"><div class="metric-icon amber">≡</div><span class="metric-label">Pending Quotations</span><strong>18</strong><small class="trend positive">↑ 8.2% <em>vs last month</em></small></article><article class="metric-card"><div class="metric-icon violet">□</div><span class="metric-label">Purchase Orders</span><strong>12</strong><small class="trend neutral">→ 2 awaiting approval</small></article><article class="metric-card"><div class="metric-icon red">◇</div><span class="metric-label">Low Stock Items</span><strong>5</strong><small class="trend warning">Needs attention</small></article></section>
      <section class="dashboard-grid"><article class="recommendation-card"><div class="section-heading"><div><span class="ai-label">✦ AI RECOMMENDATION</span><h2>Vendor recommendation</h2></div><span class="confidence">94% confidence</span></div><div class="recommendation-body"><div><p class="recommendation-kicker">RECOMMENDED SUPPLIER</p><h3>ABC Semiconductors</h3><p class="muted">Silicon wafers · RFQ-2026-0042</p><div class="score-row"><span>Overall score</span><strong>93.0%</strong></div><div class="score-bar"><i style="width: 93%"></i></div></div><div class="score-list"><div><span>Price</span><b>90%</b><i><em style="width: 90%"></em></i></div><div><span>Delivery</span><b>98%</b><i><em style="width: 98%"></em></i></div><div><span>Reliability</span><b>95%</b><i><em style="width: 95%"></em></i></div><div><span>Quality</span><b>92%</b><i><em style="width: 92%"></em></i></div></div></div><div class="recommendation-foot"><span class="status-badge approved">✓ Within budget</span><span class="status-badge approved">✓ Meets delivery date</span></div><p class="ai-explanation">“ABC provides the strongest overall combination of delivery reliability and quality while remaining within the approved budget.”</p><button class="outline-button" type="button">View full comparison <span>→</span></button></article><article class="activity-card"><div class="section-heading"><div><span class="ai-label">ACTIVITY</span><h2>Recent procurement</h2></div><button class="text-button" type="button">View all →</button></div><div class="activity-row"><span class="activity-dot blue-dot"></span><div><strong>RFQ sent to vendors</strong><small>Silicon Wafer · 12 minutes ago</small></div><span class="status-badge pending">SENT</span></div><div class="activity-row"><span class="activity-dot green-dot"></span><div><strong>Quotation received</strong><small>Nova Components · 1 hour ago</small></div><span class="status-badge approved">NEW</span></div><div class="activity-row"><span class="activity-dot amber-dot"></span><div><strong>Approval required</strong><small>PO-2026-018 · 3 hours ago</small></div><span class="status-badge warning">PENDING</span></div><div class="activity-row"><span class="activity-dot violet-dot"></span><div><strong>Inventory updated</strong><small>Microcontrollers · Yesterday</small></div><span class="status-badge delivered">DONE</span></div></article></section>
      <section class="analytics-strip"><div class="section-heading"><div><span class="ai-label">OVERVIEW</span><h2>Procurement spend</h2></div><select aria-label="Spend period"><option>Last 6 months</option><option>Last 12 months</option></select></div><div class="spend-summary"><strong>₹24.5L</strong><span class="trend positive">↑ 18.4% <em>from previous period</em></span></div><div class="chart" aria-label="Procurement spend chart"><div style="height: 38%"><i>₹2.4L</i></div><div style="height: 54%"><i>₹3.4L</i></div><div style="height: 46%"><i>₹2.9L</i></div><div style="height: 68%"><i>₹4.1L</i></div><div style="height: 62%"><i>₹3.7L</i></div><div class="current" style="height: 88%"><i>₹5.2L</i></div></div><div class="chart-labels"><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span></div></section>
    </main>
  </section>
`;

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.dataset.state = isError ? 'error' : 'success';
}

function getLoginErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'The email or password is incorrect. Use the exact Firebase user email and reset the password if needed.',
    'auth/wrong-password': 'The password is incorrect. Reset the Firebase user password and try again.',
    'auth/user-not-found': 'No Firebase user exists with this email address.',
    'auth/user-disabled': 'This Firebase user is disabled. Enable the user in Authentication > Users.',
    'auth/operation-not-allowed': 'Email/Password sign-in is disabled. Enable it in Authentication > Sign-in method.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment before trying again.',
    'auth/api-key-not-valid': 'Firebase configuration is invalid. Check frontend/js/firebase-config.js.',
    'auth/invalid-api-key': 'Firebase configuration is invalid. Check frontend/js/firebase-config.js.'
  };

  return messages[error.code] || 'Sign-in failed. Check the Firebase user and try again.';
}

function renderDashboardOverviewLegacy(profile) {
  const name = profile?.name?.split(' ')[0] || 'there';
  return `<main class="dashboard-content erp-overview"><section class="overview-header"><div><p class="eyebrow">PROCUREMENT COMMAND CENTER</p><h1>Good morning, ${name}.</h1><p>Here is a live view of your sourcing and purchasing operations.</p></div><button class="create-button" type="button" data-overview-rfq><span>+</span>Create RFQ</button></section><div class="workspace-notice"><span><b>System status</b> &nbsp; All procurement workflows are operating normally.</span><button type="button">Refresh data</button></div><section class="overview-section"><div class="overview-section-heading"><div><p>AT A GLANCE</p><h2>Procurement overview</h2></div><span>Updated just now</span></div><div class="overview-metrics"><article><span class="overview-icon blue">↗</span><p>Active RFQs</p><strong>24</strong><small>12.5% more than last month</small></article><article><span class="overview-icon amber">◫</span><p>Pending quotations</p><strong>18</strong><small>6 require a decision today</small></article><article><span class="overview-icon violet">□</span><p>Purchase orders</p><strong>12</strong><small>2 awaiting approval</small></article><article><span class="overview-icon red">!</span><p>Inventory alerts</p><strong>5</strong><small>2 items need immediate action</small></article></div></section><section class="overview-panel quick-actions"><div class="overview-section-heading"><div><p>WORKSPACE</p><h2>Quick actions</h2></div></div><div><a href="/rfq" data-quick-route><span>+</span><strong>Create RFQ</strong><small>Start a new sourcing request</small></a><a href="/vendors" data-quick-route><span>◎</span><strong>Manage vendors</strong><small>Review supplier profiles</small></a><a href="/vendor-comparison" data-quick-route><span>⇄</span><strong>Compare vendors</strong><small>Choose the best offer</small></a><a href="/purchase-orders" data-quick-route><span>□</span><strong>Create purchase order</strong><small>Turn a quote into an order</small></a></div></section><section class="overview-lower"><article class="overview-panel pipeline-panel"><div class="overview-section-heading"><div><p>PIPELINE</p><h2>Procurement pipeline</h2></div><a href="/rfq" data-quick-route>View RFQs →</a></div><div class="pipeline"><div><span>Draft</span><strong>06</strong><i style="width:25%"></i></div><div><span>Open RFQs</span><strong>24</strong><i style="width:78%"></i></div><div><span>Quotes received</span><strong>18</strong><i style="width:62%"></i></div><div><span>Awaiting approval</span><strong>02</strong><i style="width:16%"></i></div></div></article><article class="overview-panel activity-panel"><div class="overview-section-heading"><div><p>ACTIVITY</p><h2>Recent updates</h2></div><a href="/analytics" data-quick-route>View all →</a></div><div class="overview-activity"><div><i class="green"></i><span><strong>Quotation received</strong><small>Nova Components · RFQ-0042</small></span><time>12m ago</time></div><div><i class="blue"></i><span><strong>RFQ sent to suppliers</strong><small>Silicon wafers · 8 vendors</small></span><time>1h ago</time></div><div><i class="amber"></i><span><strong>Approval required</strong><small>PO-2026-018 needs review</small></span><time>3h ago</time></div></div></article></section></main>`;
}

function renderDashboardOverview(profile) {
  const name = profile?.name === 'Preview user' || !profile?.name ? 'abinayaraju997' : profile.name;
  return `<main class="dashboard-content erp-overview procurex-overview">
    <section class="overview-header"><div><p class="eyebrow">DASHBOARD OVERVIEW</p><h1>Good morning,<br />${name}.</h1><p>Here's what's happening with your sourcing and procurement operations.</p></div><div class="overview-header-actions"><button class="create-button" type="button">View all tasks <span>→</span></button><button class="outline-button" type="button">↻ Refresh data</button></div></section>
    <div class="workspace-notice"><span><b>✓ &nbsp; System check</b><em>All procurement workflows are operating normally.</em></span></div>
    <section class="overview-section"><div class="overview-section-heading"><div><p>AT A GLANCE</p><h2>Procurement overview</h2></div></div><div class="overview-metrics"><article><span class="overview-icon blue">↗</span><p>Active RFQs</p><strong>24</strong><small><b>+12%</b> since last week</small><a href="/rfq" data-quick-route>View all →</a></article><article><span class="overview-icon amber">◷</span><p>Pending approvals</p><strong>18</strong><small>Pending your action</small><a href="/approvals" data-quick-route>View →</a></article><article><span class="overview-icon cyan">▣</span><p>Active contracts</p><strong>12</strong><small>Expiring this month</small></article><article><span class="overview-icon violet">◌</span><p>Expiring soon</p><strong>5</strong><small>Contracts</small><a href="/analytics" data-quick-route>View details →</a></article></div></section>
    <section class="overview-lower procurex-primary"><article class="overview-panel quick-actions"><div class="overview-section-heading"><div><p>QUICK ACTIONS</p><h2>Quick actions</h2></div></div><div><a href="/rfq" data-quick-route><span>+</span><strong>Create RFQ</strong><small>Create a new request for quote</small></a><a href="/vendors" data-quick-route><span>◉</span><strong>Manage vendors</strong><small>View and manage your vendors</small></a><a href="/vendor-comparison" data-quick-route><span>⇄</span><strong>Compare quotations</strong><small>Evaluate vendor proposals</small></a><a href="/purchase-orders" data-quick-route><span>▤</span><strong>Create purchase order</strong><small>Create a new purchase order</small></a></div></article><article class="overview-panel shortcuts-panel"><div class="overview-section-heading"><div><p>SHORTCUTS</p><h2>Quick shortcuts</h2></div></div><a href="/rfq" data-quick-route>⌁ <span>RFQ Pipeline</span>›</a><a href="/vendor-comparison" data-quick-route>⇄ <span>Quotation Comparison</span>›</a><a href="/vendors" data-quick-route>◌ <span>Vendor Performance</span>›</a><a href="/analytics" data-quick-route>◷ <span>Contract Expiry</span>›</a><a href="/purchase-orders" data-quick-route>▤ <span>Purchase Orders</span>›</a></article></section>
    <section class="overview-lower procurex-secondary"><article class="overview-panel activity-panel"><div class="overview-section-heading"><div><p>RECENT ACTIVITY</p><h2>Latest procurement updates</h2></div><button class="outline-button" type="button">View all</button></div><div class="overview-activity"><div><i class="blue"></i><span><strong>RFQ-2025-24 created</strong><small>New sourcing request opened</small></span><time>2 mins ago</time></div><div><i class="amber"></i><span><strong>Quotation received from Tech Solutions</strong><small>RFQ-2025-24</small></span><time>15 mins ago</time></div><div><i class="green"></i><span><strong>PO-2025-18 approved</strong><small>Purchase order approved</small></span><time>1 hour ago</time></div><div><i class="violet"></i><span><strong>Invoice INV-2025-45 uploaded</strong><small>Awaiting finance review</small></span><time>2 hours ago</time></div><div><i class="green"></i><span><strong>Vendor ABC Traders verified</strong><small>Vendor verification completed</small></span><time>3 hours ago</time></div></div></article><article class="overview-panel tasks-panel"><div class="overview-section-heading"><div><p>PENDING TASKS</p><h2>Tasks awaiting your action</h2></div><button class="text-button" type="button">View all →</button></div><div class="task-row"><i>✓</i><span><strong>Approve quotation from Tech Solutions</strong><small>Quotation review</small></span><b>High</b>›</div><div class="task-row"><i>✓</i><span><strong>Review vendor verification documents</strong><small>Vendor compliance</small></span><b class="medium">Pending</b>›</div><div class="task-row"><i>✓</i><span><strong>Confirm delivery schedule for PO-2025-18</strong><small>Purchase order</small></span>›</div></article></section>
    <section class="overview-panel vendor-performance"><div class="overview-section-heading"><div><p>VENDOR PERFORMANCE</p><h2>Top performing vendors</h2></div><button class="outline-button" type="button">View report</button></div><div class="vendor-ranking"><div><span class="vendor-avatar">T</span><strong>Tech Solutions Pvt Ltd</strong><i><em style="width:98%"></em></i><b>98%</b></div><div><span class="vendor-avatar cyan">A</span><strong>ABC Traders</strong><i><em style="width:94%"></em></i><b>94%</b></div><div><span class="vendor-avatar violet">N</span><strong>Nova Components</strong><i><em style="width:91%"></em></i><b>91%</b></div></div></section>
  </main>`;
}

function renderRfqWorkspace(profile) {
  const canCreate = ['buyer', 'admin', 'manager'].includes(profile?.role);
  const form = canCreate ? `<section class="rfq-create-panel"><div><p>NEW PROCUREMENT REQUEST</p><h2>Create RFQ</h2><span>Capture the requirement, validate inventory, then match approved suppliers.</span></div><form data-rfq-form class="rfq-form"><label>Material / item *<input name="material" placeholder="e.g. Silicon Wafer 300mm" required /></label><label>Quantity *<input name="quantity" type="number" min="1" placeholder="1000" required /></label><label>Required delivery date *<input name="deadline" type="date" required /></label><label>Budget (INR) *<input name="budget" type="number" min="1" placeholder="1000000" required /></label><label class="wide">Technical specifications *<textarea name="specifications" placeholder="Grade, dimensions, performance and quality requirements" required></textarea></label><label class="wide">Additional requirements<textarea name="additionalRequirements" placeholder="Packaging, warranty, payment terms or other notes"></textarea></label><div class="rfq-submit wide"><span>Saved as a draft until you decide to continue procurement.</span><button class="create-button" type="submit">Save RFQ <b>→</b></button></div><p class="form-message wide" data-rfq-message></p></form></section>` : '';
  return `<main class="module-content rfq-workspace"><header class="rfq-header"><div><p class="eyebrow">SOURCING / RFQ MANAGEMENT</p><h1>Request for quotations</h1><p>Plan demand, invite qualified vendors, and manage every sourcing request.</p></div><button class="create-button" type="button" data-open-rfq>+ Create RFQ</button></header><section class="rfq-summary"><article><span>Open RFQs</span><strong>24</strong><small>8 vendor responses due this week</small></article><article><span>Awaiting quotations</span><strong>18</strong><small>12.5% more than last month</small></article><article><span>Closing soon</span><strong>06</strong><small>Three require action today</small></article><article><span>Completed</span><strong>42</strong><small>This procurement quarter</small></article></section>${form}<section class="rfq-list"><div class="rfq-list-top"><div><p>ACTIVE REQUESTS</p><h2>RFQ register</h2></div><div><input placeholder="Search RFQ or material" aria-label="Search RFQs" /><button type="button">All status ▾</button></div></div><div class="rfq-table"><table><thead><tr><th>RFQ</th><th>Material</th><th>Quantity</th><th>Deadline</th><th>Suppliers</th><th>Status</th><th></th></tr></thead><tbody><tr><td><b>RFQ-2026-0042</b><small>Created today</small></td><td>Silicon Wafer 300mm</td><td>1,000 pcs</td><td>Sep 01, 2026</td><td>8 matched</td><td><span class="status-badge approved">OPEN</span></td><td><button>View →</button></td></tr><tr><td><b>RFQ-2026-0041</b><small>Created yesterday</small></td><td>Microcontrollers</td><td>4,500 pcs</td><td>Aug 28, 2026</td><td>12 matched</td><td><span class="status-badge pending">AWAITING QUOTES</span></td><td><button>View →</button></td></tr><tr><td><b>RFQ-2026-0039</b><small>Created Aug 16</small></td><td>Pressure Sensors</td><td>850 pcs</td><td>Aug 25, 2026</td><td>6 matched</td><td><span class="status-badge delivered">COMPLETED</span></td><td><button>View →</button></td></tr></tbody></table></div></section></main>`;
}

function renderVendorWorkspace() {
  return `<main class="module-content vendor-workspace"><header class="rfq-header"><div><p class="eyebrow">SOURCING / VENDOR MANAGEMENT</p><h1>Vendor directory</h1><p>Maintain qualified suppliers and keep sourcing performance visible.</p></div><button class="create-button" type="button">+ Add vendor</button></header><section class="rfq-summary"><article><span>Approved vendors</span><strong>128</strong><small>6 added this month</small></article><article><span>Top performers</span><strong>34</strong><small>Score above 90%</small></article><article><span>Under review</span><strong>07</strong><small>Profiles awaiting verification</small></article><article><span>Average reliability</span><strong>92%</strong><small>3.4% better this year</small></article></section><section class="vendor-insight"><div><span>AI supplier insight</span><h2>Supplier base is healthy</h2><p>Most active suppliers meet delivery commitments. Three suppliers should be reviewed before the next sourcing cycle.</p></div><a href="/vendor-comparison" data-quick-route>Compare supplier performance →</a></section><section class="rfq-list vendor-directory"><div class="rfq-list-top"><div><p>SUPPLIER DIRECTORY</p><h2>Qualified vendors</h2></div><div><input placeholder="Search vendor or category" aria-label="Search vendors" /><button type="button">All categories ▾</button></div></div><div class="rfq-table"><table><thead><tr><th>Vendor</th><th>Category</th><th>Primary contact</th><th>Performance</th><th>Orders</th><th>Status</th><th></th></tr></thead><tbody><tr><td><b>ABC Semiconductors</b><small>Approved supplier since 2024</small></td><td>Semiconductors</td><td>Anika Rao</td><td><span class="score-chip">96%</span></td><td>84</td><td><span class="status-badge approved">APPROVED</span></td><td><button>View profile →</button></td></tr><tr><td><b>Nova Components</b><small>Preferred supplier</small></td><td>Electronics</td><td>Rahul Mehta</td><td><span class="score-chip">91%</span></td><td>62</td><td><span class="status-badge approved">APPROVED</span></td><td><button>View profile →</button></td></tr><tr><td><b>Precision Circuits</b><small>Verification complete</small></td><td>Integrated circuits</td><td>Maya Singh</td><td><span class="score-chip review">86%</span></td><td>38</td><td><span class="status-badge pending">REVIEW</span></td><td><button>View profile →</button></td></tr><tr><td><b>Vertex Industrial</b><small>Preferred supplier</small></td><td>Sensors</td><td>Arjun Shah</td><td><span class="score-chip">94%</span></td><td>51</td><td><span class="status-badge approved">APPROVED</span></td><td><button>View profile →</button></td></tr></tbody></table></div></section></main>`;
}

function renderSpecialWorkspace(route) {
  const pages = {
    'vendor-verification': {
      eyebrow: 'SUPPLIER COMPLIANCE', title: 'Vendor verification', description: 'Review supplier documents and make confident approval decisions.', action: 'Review queue',
      metrics: [['Awaiting review', '08', 'Supplier profiles'], ['Verified this month', '24', 'All documents complete'], ['Expiring documents', '03', 'Action required']],
      rows: [['Tech Solutions Pvt Ltd', 'GST, PAN, bank proof', 'Submitted today', 'Ready for review'], ['Nova Components', 'ISO certificate', 'Expires in 18 days', 'Needs update'], ['Apex Materials', 'Address verification', 'Submitted yesterday', 'Ready for review']],
      sideTitle: 'Verification checklist', sideItems: ['Business registration', 'Tax and bank details', 'Quality certificates', 'Approval history']
    },
    invoices: {
      eyebrow: 'FINANCE / INVOICES', title: 'Invoice workspace', description: 'Track invoices, payment commitments, and exceptions in one place.', action: 'Upload invoice',
      metrics: [['Open invoices', '16', '₹8.2L outstanding'], ['Due this week', '04', '₹2.1L scheduled'], ['Paid this month', '28', '₹6.4L cleared']],
      rows: [['INV-2025-45', 'Tech Solutions Pvt Ltd', '₹1,48,000', 'Due Aug 28', 'Awaiting payment'], ['INV-2025-44', 'ABC Traders', '₹92,500', 'Due Aug 30', 'Approved'], ['INV-2025-43', 'Nova Components', '₹2,15,000', 'Paid Aug 19', 'Paid']],
      sideTitle: 'Finance summary', sideItems: ['Payment calendar', 'Invoice matching', 'Outstanding balances', 'Tax documents']
    },
    reports: {
      eyebrow: 'OPERATIONS / REPORTS', title: 'Procurement reports', description: 'Create focused reports for spend, suppliers, sourcing, and operations.', action: 'Create report',
      metrics: [['Saved reports', '12', 'Available to your team'], ['Scheduled', '04', 'Next run tomorrow'], ['Exports this month', '36', 'CSV and PDF files']],
      rows: [['Monthly procurement spend', 'Finance', 'Updated today', 'Export report'], ['Supplier performance scorecard', 'Sourcing', 'Updated today', 'Export report'], ['RFQ conversion summary', 'Operations', 'Updated yesterday', 'Export report']],
      sideTitle: 'Popular report types', sideItems: ['Spend by category', 'Vendor performance', 'RFQ response time', 'Purchase-order cycle time']
    },
    settings: {
      eyebrow: 'WORKSPACE SETTINGS', title: 'Configure your workspace', description: 'Manage the preferences and controls used across ProcureX.', action: 'Save changes',
      metrics: [['Workspace users', '08', '2 administrators'], ['Approval flows', '03', 'Currently active'], ['Notifications', '12', 'Rules configured']],
      rows: [['Company profile', 'Sri Vari Communication Private Limited', 'Workspace identity', 'Configure'], ['Approval workflow', 'Purchase order approvals', '3 active rules', 'Manage'], ['Notifications', 'Procurement alerts', '12 enabled alerts', 'Manage']],
      sideTitle: 'Security controls', sideItems: ['User access and roles', 'Session management', 'Audit activity', 'Data retention']
    }
  };
  const page = pages[route];
  if (!page) return '';
  if (route === 'vendor-verification') {
    return `<main class="module-content light-workspace"><header class="module-heading"><div><p class="eyebrow">${page.eyebrow}</p><h1>${page.title}</h1><p>${page.description}</p></div><button class="create-button" type="button">Review queue</button></header><section class="workspace-stat-grid">${page.metrics.map(([label, value, detail]) => `<article><span class="workspace-stat-icon">✓</span><p>${label}</p><strong>${value}</strong><small>${detail}</small></article>`).join('')}</section><section class="workspace-detail-grid"><article class="workspace-table-panel"><div class="workspace-panel-heading"><div><p>ACTIVE WORK</p><h2>Review queue</h2></div></div><div class="workspace-rows">${page.rows.map(([name, documents, submission, status]) => `<div><span class="row-symbol">✓</span><span><strong>${name}</strong><small>${documents}</small></span><small>${submission}</small><button class="row-action" type="button" data-verification-view data-vendor-name="${name}" data-documents="${documents}" data-submission="${submission}" data-verification-status="${status}">View</button></div>`).join('')}</div></article><aside class="workspace-side-panel"><p>AT A GLANCE</p><h2>${page.sideTitle}</h2>${page.sideItems.map((item, index) => `<div><span>${index + 1}</span>${item}<b>›</b></div>`).join('')}</aside></section><dialog class="verification-dialog" data-verification-dialog><div class="verification-dialog-header"><div><p class="eyebrow">VENDOR VERIFICATION</p><h2 data-verification-name></h2></div><button class="dialog-close" type="button" data-close-verification aria-label="Close">×</button></div><dl><div><dt>Documents submitted</dt><dd data-verification-documents></dd></div><div><dt>Submission status</dt><dd data-verification-submission></dd></div><div><dt>Review status</dt><dd><span class="status-badge info" data-verification-status></span></dd></div></dl><p class="verification-note">Review the submitted documents before approving this supplier.</p><form method="dialog"><button class="outline-button" type="submit">Close</button></form></dialog></main>`;
  }
  const icon = { 'vendor-verification': '✓', invoices: '₹', reports: '▤', settings: '⚙' }[route];
  return `<main class="module-content light-workspace"><header class="module-heading"><div><p class="eyebrow">${page.eyebrow}</p><h1>${page.title}</h1><p>${page.description}</p></div><button class="create-button" type="button"><span>${icon}</span>${page.action}</button></header><section class="workspace-stat-grid">${page.metrics.map(([label, value, detail], index) => `<article><span class="workspace-stat-icon icon-${index}">${index === 0 ? icon : index === 1 ? '◷' : '↗'}</span><p>${label}</p><strong>${value}</strong><small>${detail}</small></article>`).join('')}</section><section class="workspace-detail-grid"><article class="workspace-table-panel"><div class="workspace-panel-heading"><div><p>ACTIVE WORK</p><h2>${route === 'reports' ? 'Available reports' : route === 'settings' ? 'Workspace controls' : route === 'invoices' ? 'Recent invoices' : 'Review queue'}</h2></div><button class="outline-button" type="button">View all</button></div><div class="workspace-rows">${page.rows.map(([first, second, third, status]) => `<div><span class="row-symbol">${icon}</span><span><strong>${first}</strong><small>${second}</small></span><small>${third}</small><button class="row-action" type="button">${status} →</button></div>`).join('')}</div></article><aside class="workspace-side-panel"><p>AT A GLANCE</p><h2>${page.sideTitle}</h2>${page.sideItems.map((item, index) => `<div><span>${index + 1}</span>${item}<b>›</b></div>`).join('')}</aside></section></main>`;
}

function bindDashboardNavigation(profile) {
  const homeContent = renderDashboardOverview(profile);
  const dashboardMain = dashboardView.querySelector('.dashboard-main');
  const routeMap = {
    dashboard: null,
    rfq: 'rfq',
    vendors: 'vendors',
    quotations: 'quotations',
    'vendor-comparison': 'vendor-comparison',
    'purchase-orders': 'purchase-orders',
    inventory: 'inventory',
    finance: 'finance',
    approvals: 'approvals',
    analytics: 'analytics',
    'vendor-verification': 'vendor-verification',
    invoices: 'invoices',
    reports: 'reports',
    settings: 'settings'
  };

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const openLogin = () => {
    landingPage.hidden = true;
    appShell.hidden = false;
    appShell.dataset.view = 'auth';
    dashboardView.hidden = true;
    dashboardView.innerHTML = '';
    authView.hidden = false;
    window.history.pushState({}, '', '/login');
  };

  const signOutButton = dashboardView.querySelector('[data-sign-out]');
  signOutButton?.addEventListener('click', async () => {
    if (auth?.currentUser) {
      await signOut(auth);
      return;
    }
    openLogin();
  });

  const themeButton = dashboardView.querySelector('.theme-button');
  themeButton?.addEventListener('click', () => {
    const isDimmed = document.body.dataset.dashboardTheme === 'dim';
    document.body.dataset.dashboardTheme = isDimmed ? 'light' : 'dim';
    themeButton.textContent = isDimmed ? '☼' : '☾';
    themeButton.setAttribute('aria-label', isDimmed ? 'Enable dim theme' : 'Enable light theme');
  });

  dashboardView.querySelectorAll('.profile-chip, .sidebar-profile').forEach((profileControl) => {
    profileControl.setAttribute('role', 'button');
    profileControl.setAttribute('tabindex', '0');
    const openSettings = () => navigateTo('/settings');
    profileControl.addEventListener('click', openSettings);
    profileControl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') openSettings();
    });
  });

  const searchInput = dashboardView.querySelector('.search-box input');
  const searchBox = dashboardView.querySelector('.search-box');
  if (searchInput && searchBox) {
    const searchItems = [
      ['Dashboard', '/dashboard'], ['RFQ Management', '/rfq'], ['Vendors', '/vendors'],
      ['Vendor Verification', '/vendor-verification'], ['Quotations', '/quotations'],
      ['Vendor Comparison', '/vendor-comparison'], ['Purchase Orders', '/purchase-orders'],
      ['Inventory', '/inventory'], ['Finance', '/finance'], ['Invoices', '/invoices'],
      ['Approvals', '/approvals'], ['Analytics', '/analytics'], ['Reports', '/reports'], ['Settings', '/settings']
    ];
    const results = document.createElement('div');
    results.className = 'search-results';
    searchBox.append(results);
    const showResults = () => {
      const query = searchInput.value.trim().toLowerCase();
      const matches = query ? searchItems.filter(([label]) => label.toLowerCase().includes(query)).slice(0, 5) : [];
      results.replaceChildren(...matches.map(([label, path]) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.textContent = label;
        item.addEventListener('click', () => { searchInput.value = ''; results.replaceChildren(); navigateTo(path); });
        return item;
      }));
      results.hidden = matches.length === 0;
    };
    searchInput.addEventListener('input', showResults);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const firstResult = results.querySelector('button');
        if (firstResult) firstResult.click();
      }
      if (event.key === 'Escape') results.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.focus();
      }
    });
  }

  dashboardView.querySelectorAll('button').forEach((button) => {
    if (!button.textContent.includes('Refresh data')) return;
    button.addEventListener('click', async () => {
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Refreshing...';
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('The API is unavailable.');
        button.textContent = 'Updated just now';
      } catch {
        button.textContent = 'API unavailable';
      }
      window.setTimeout(() => { button.disabled = false; button.textContent = originalLabel; }, 1600);
    });
  });

  // Give every standard View/Review action a useful detail panel. More
  // specialised actions (comparison, verification, payments, approvals) keep
  // their dedicated handlers below.
  dashboardMain.addEventListener('click', (event) => {
    const action = event.target.closest('.row-action');
    if (!action || action.matches('[data-comparison-view], [data-verification-view], [data-record-payment], [data-vendor-status]')) return;
    const row = action.closest('tr, .workspace-rows > div');
    if (!row) return;
    let dialog = dashboardView.querySelector('[data-record-detail-dialog]');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'verification-dialog';
      dialog.dataset.recordDetailDialog = '';
      dialog.innerHTML = '<div class="verification-dialog-header"><div><p class="eyebrow">RECORD DETAILS</p><h2 data-record-detail-title></h2></div><button class="dialog-close" type="button" aria-label="Close">×</button></div><div class="record-detail-content" data-record-detail-content></div><form method="dialog"><button class="outline-button" type="submit">Close</button></form>';
      dashboardView.append(dialog);
      dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    }
    const fields = [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()).filter(Boolean);
    const workspaceFields = [...row.querySelectorAll('strong, small')].map((cell) => cell.textContent.trim()).filter(Boolean);
    const values = fields.length ? fields : workspaceFields;
    dialog.querySelector('[data-record-detail-title]').textContent = values[0] || 'Record details';
    dialog.querySelector('[data-record-detail-content]').innerHTML = values.slice(1).map((value, index) => `<p><span>Detail ${index + 1}</span><strong>${value}</strong></p>`).join('') || '<p><strong>No additional details are available.</strong></p>';
    dialog.showModal();
  });

  dashboardMain.addEventListener('click', (event) => {
    const button = event.target.closest('.module-heading .create-button');
    if (!button || button.textContent.includes('Export')) return;
    const form = dashboardMain.querySelector('.module-content form');
    if (!form) return;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.querySelector('input, select, textarea')?.focus();
  });

  const renderRoute = () => {
    const route = window.location.pathname.split('/')[1] || window.location.hash.replace('#', '') || 'dashboard';
    const moduleKey = routeMap[route] ?? null;
    const specialWorkspace = ['vendor-verification', 'invoices', 'reports', 'settings'].includes(moduleKey);
    dashboardMain.querySelector('.dashboard-content, .module-content').outerHTML = moduleKey
      ? (specialWorkspace ? renderSpecialWorkspace(moduleKey) : moduleKey === 'rfq' ? renderRfqWorkspace(profile) : renderModulePage(moduleKey, profile))
      : homeContent;
    if (!moduleKey && dashboardMain.querySelector('.dashboard-heading')) {
      const heading = dashboardMain.querySelector('.dashboard-heading');
      heading.insertAdjacentHTML('afterend', '<div class="workspace-notice">Dashboard data is up to date.<button type="button">Refresh data</button></div>');
      const metrics = dashboardMain.querySelector('.metric-grid');
      metrics.insertAdjacentHTML('afterend', '<section class="quick-actions"><h2>Quick actions</h2><div><a href="/rfq" data-quick-route><span>+</span>Create RFQ</a><a href="/vendors" data-quick-route><span>◎</span>Manage vendors</a><button type="button" data-sign-out><span>↪</span>Securely log out</button></div></section>');
      dashboardMain.querySelectorAll('[data-quick-route]').forEach((item) => item.addEventListener('click', (event) => {
        event.preventDefault();
        navigateTo(item.getAttribute('href'));
      }));
      dashboardMain.querySelector('[data-sign-out]')?.addEventListener('click', async () => {
        if (auth?.currentUser) await signOut(auth);
        else openLogin();
      });
    }
    dashboardMain.querySelectorAll('[data-quick-route]').forEach((item) => item.addEventListener('click', (event) => {
      event.preventDefault();
      navigateTo(item.getAttribute('href'));
    }));
    dashboardMain.querySelector('[data-overview-rfq]')?.addEventListener('click', () => {
      navigateTo('/rfq');
    });
    dashboardView.querySelectorAll('.nav-item[href]').forEach((item) => {
      item.classList.toggle('is-active', item.getAttribute('href') === `/${route}` || (route === 'dashboard' && item.getAttribute('href') === '/dashboard'));
    });
    if (!moduleKey) {
      loadDashboardSummary();
    }
    if (moduleKey === 'vendors') {
      loadVendors();
    }
    if (moduleKey === 'vendor-verification') {
      bindVendorVerificationView();
    }
    if (moduleKey === 'vendors' && profile.role === 'vendor') {
      loadVendorProfile();
    }
    if (moduleKey === 'rfq' && ['buyer', 'admin', 'manager'].includes(profile.role)) {
      bindRfqForm();
    }
    if (moduleKey === 'rfq') {
      loadRfqs();
    }
    if (moduleKey === 'rfq' && profile.role === 'vendor') {
      loadVendorRfqs();
    }
    if (moduleKey === 'quotations' && ['buyer', 'vendor', 'admin', 'manager'].includes(profile.role)) {
      bindQuotationForm();
    }
    if (moduleKey === 'quotations') {
      loadQuotations();
    }
    if (moduleKey === 'vendor-comparison' && ['buyer', 'admin', 'manager'].includes(profile.role)) {
      bindComparisonForm();
    }
    if (moduleKey === 'finance' && ['buyer', 'admin', 'manager'].includes(profile.role)) {
      bindFinanceForm();
      loadFinanceRecords();
    }
    if (moduleKey === 'approvals' && ['admin', 'manager'].includes(profile.role)) {
      bindApprovalForm();
      loadPendingApprovals();
    }
    if (moduleKey === 'analytics') {
      bindAnalyticsExport();
    }
    if (moduleKey === 'purchase-orders' && ['buyer', 'admin', 'manager'].includes(profile.role)) {
      bindPurchaseOrderForm();
    }
    if (moduleKey === 'inventory' && ['buyer', 'admin', 'manager'].includes(profile.role)) {
      bindMaterialForm();
    }
    if (moduleKey === 'inventory') {
      loadInventoryMaterials();
    }
    if (moduleKey === 'vendors' && ['buyer', 'admin', 'manager'].includes(profile.role)) {
      bindDirectoryVendorForm();
    }
    if (moduleKey === 'purchase-orders') {
      loadPurchaseOrders();
    }
  };

  const bindVendorVerificationView = () => {
    const dialog = dashboardView.querySelector('[data-verification-dialog]');
    if (!dialog) return;
    dashboardView.querySelectorAll('[data-verification-view]').forEach((button) => {
      button.addEventListener('click', () => {
        dialog.querySelector('[data-verification-name]').textContent = button.dataset.vendorName;
        dialog.querySelector('[data-verification-documents]').textContent = button.dataset.documents;
        dialog.querySelector('[data-verification-submission]').textContent = button.dataset.submission;
        dialog.querySelector('[data-verification-status]').textContent = button.dataset.verificationStatus;
        dialog.showModal();
      });
    });
    dialog.querySelector('[data-close-verification]').addEventListener('click', () => dialog.close());
  };

  const bindComparisonForm = () => {
    const form = dashboardView.querySelector('[data-comparison-form]');
    if (!form) return;
    const showComparisonDetail = (score) => {
      let dialog = dashboardView.querySelector('[data-comparison-detail-dialog]');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'verification-dialog';
        dialog.dataset.comparisonDetailDialog = '';
        dialog.innerHTML = '<div class="verification-dialog-header"><div><p class="eyebrow">VENDOR COMPARISON</p><h2 data-comparison-vendor></h2></div><button class="dialog-close" type="button" aria-label="Close">×</button></div><dl><div><dt>Overall ranking</dt><dd data-comparison-ranking></dd></div><div><dt>Price score</dt><dd data-comparison-price></dd></div><div><dt>Delivery score</dt><dd data-comparison-delivery></dd></div><div><dt>Reliability score</dt><dd data-comparison-reliability></dd></div><div><dt>Quality score</dt><dd data-comparison-quality></dd></div><div><dt>Final score</dt><dd data-comparison-final></dd></div></dl><form method="dialog"><button class="outline-button" type="submit">Close</button></form>';
        dashboardView.append(dialog);
        dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
      }
      dialog.querySelector('[data-comparison-vendor]').textContent = score.vendorName;
      dialog.querySelector('[data-comparison-ranking]').textContent = `Rank ${score.ranking}`;
      dialog.querySelector('[data-comparison-price]').textContent = `${score.priceScore}%`;
      dialog.querySelector('[data-comparison-delivery]').textContent = `${score.deliveryScore}%`;
      dialog.querySelector('[data-comparison-reliability]').textContent = `${score.reliabilityScore}%`;
      dialog.querySelector('[data-comparison-quality]').textContent = `${score.qualityScore}%`;
      dialog.querySelector('[data-comparison-final]').textContent = `${score.finalScore}%`;
      dialog.showModal();
    };
    const comparisonInput = form.elements.rfqId;
    const openComparisonButton = dashboardView.querySelector('.module-heading .create-button');
    openComparisonButton?.addEventListener('click', () => {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      comparisonInput.focus();
    });
    apiRequest('/api/quotations').then(({ quotations }) => {
      const rfqIds = [...new Set(quotations.map((quote) => quote.rfqId).filter(Boolean))];
      if (!rfqIds.length) return;
      const list = document.createElement('datalist');
      list.id = 'quotation-rfq-options';
      list.innerHTML = rfqIds.map((rfqId) => `<option value="${rfqId}"></option>`).join('');
      form.append(list);
      comparisonInput.setAttribute('list', list.id);
      comparisonInput.placeholder = 'Choose an RFQ with quotations';
    }).catch(() => {});
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = form.querySelector('[data-comparison-message]');
      try {
        const rfqId = comparisonInput.value.trim();
        if (!rfqId) throw new Error('Choose or enter an RFQ ID first.');
        const { scores } = await apiRequest(`/api/scoring/rfq/${encodeURIComponent(rfqId)}`);
        const tableBody = dashboardView.querySelector('.module-content tbody');
        if (!scores.length) throw new Error('No quotations are available for this RFQ.');
        tableBody.innerHTML = scores.map((score, index) => `<tr><td>${score.vendorName}</td><td>${score.priceScore}%</td><td>${score.deliveryScore}%</td><td>${score.reliabilityScore}%</td><td>${score.qualityScore}%</td><td>${score.finalScore}%</td><td class="status-cell ${score.ranking === 1 ? 'approved' : 'info'}"><span class="status-badge ${score.ranking === 1 ? 'approved' : 'info'}">${score.ranking === 1 ? 'Recommended' : `Rank ${score.ranking}`}</span></td><td><button class="row-action" type="button" data-comparison-view="${index}">View</button></td></tr>`).join('');
        tableBody.querySelectorAll('[data-comparison-view]').forEach((button) => {
          button.addEventListener('click', () => showComparisonDetail(scores[Number(button.dataset.comparisonView)]));
        });
        message.textContent = `${scores.length} vendor quotation${scores.length === 1 ? '' : 's'} compared.`;
      } catch (error) {
        message.textContent = error.message || 'Vendor comparison could not be calculated.';
      }
    });
  };

  const loadQuotations = async () => {
    try {
      const { quotations } = await apiRequest('/api/quotations');
      const tableBody = dashboardView.querySelector('.module-content tbody');
      if (!tableBody) return;
      if (!quotations.length) {
        tableBody.innerHTML = '<tr><td colspan="8">No quotations have been stored yet.</td></tr>';
        return;
      }
      const currency = (value, code) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: code || 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
      tableBody.innerHTML = quotations.map((quote) => `<tr><td>${quote.id}</td><td>${quote.vendorId}</td><td>${quote.rfqId}</td><td>${currency(quote.price, quote.currency)}</td><td>${quote.deliveryDays} days</td><td><span class="status-badge info">${quote.extractionStatus}</span></td><td class="status-cell ${quote.status === 'selected' ? 'approved' : 'info'}"><span class="status-badge ${quote.status === 'selected' ? 'approved' : 'info'}">${quote.status}</span></td><td><button class="row-action" type="button">View</button></td></tr>`).join('');
    } catch (error) {
      setFeedback(error.message || 'Quotations could not be loaded.', true);
    }
  };

  const loadRfqs = async () => {
    try {
      const { rfqs } = await apiRequest('/api/rfqs');
      const tableBody = dashboardView.querySelector('.rfq-table tbody');
      if (!tableBody) return;
      renderRfqRows(tableBody, rfqs);
    } catch (error) {
      const tableBody = dashboardView.querySelector('.rfq-table tbody');
      if (tableBody) renderRfqRows(tableBody, getLocalRfqs());
      setFeedback('Firebase is unavailable. Showing RFQs saved temporarily in this browser.', true);
    }
  };

  const bindQuotationForm = () => {
    const form = dashboardView.querySelector('[data-quotation-form]');
    if (!form) return;
    const uploadQuoteButton = dashboardView.querySelector('.module-heading .create-button');
    uploadQuoteButton?.addEventListener('click', () => {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.elements.rfqId.focus();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const message = form.querySelector('[data-quotation-message]');
      try {
        const pdfFile = data.get('quotationPdf');
        if (pdfFile?.size) {
          if (pdfFile.type !== 'application/pdf' || pdfFile.size > 10 * 1024 * 1024) {
            throw new Error('PDF must be under 10 MB.');
          }
          const pdfBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(pdfFile);
          });
          const extraction = await apiRequest('/api/ai/extract-quotation', {
            method: 'POST',
            body: JSON.stringify({ pdfBase64, mimeType: 'application/pdf' })
          });
          const extracted = extraction.extractedData;
          if (extracted.price !== null) form.price.value = extracted.price;
          if (extracted.quantity !== null) form.quantity.value = extracted.quantity;
          if (extracted.deliveryDate !== null) form.deliveryDate.value = extracted.deliveryDate;
          if (extracted.validity !== null) form.validity.value = extracted.validity;
          if (extracted.specs !== null) form.specifications.value = extracted.specs;
          message.textContent = extraction.extractionStatus === 'manual_review'
            ? 'Gemini extraction is incomplete. Review and complete the highlighted fields before submitting.'
            : extraction.extractionStatus === 'failed_extraction'
              ? 'Gemini extraction returned invalid data. Enter the quotation fields manually.'
              : 'Gemini extracted the quotation. Review the fields before submitting.';
        }
        await apiRequest('/api/quotations', {
          method: 'POST',
          body: JSON.stringify({
            rfqId: data.get('rfqId'),
            price: data.get('price'),
            quantity: data.get('quantity'),
            deliveryDate: data.get('deliveryDate'),
            deliveryDays: data.get('deliveryDays'),
            validity: data.get('validity'),
            quality: data.get('quality'),
            specifications: data.get('specifications')
          })
        });
        form.reset();
        message.textContent = 'Quotation submitted successfully.';
        await loadQuotations();
      } catch {
        message.textContent = 'Quotation could not be submitted. Confirm the RFQ is matched to your vendor profile.';
      }
    });
  };

  const loadPendingApprovals = async () => {
    try {
      const { purchaseOrders } = await apiRequest('/api/purchase-orders/pending-approvals');
      const tableBody = dashboardView.querySelector('.module-content tbody');
      if (!tableBody) return;
      tableBody.innerHTML = purchaseOrders.length ? purchaseOrders.map((order) => `<tr><td>${order.poNumber || order.id}</td><td>${order.buyerId}</td><td>Procurement</td><td>${new Intl.NumberFormat('en-IN', { style: 'currency', currency: order.currency || 'INR', maximumFractionDigits: 0 }).format(order.totalAmount || 0)}</td><td>Awaiting decision</td><td>Current user</td><td class="status-cell warning"><span class="status-badge warning">PENDING</span></td><td><button class="row-action" type="button">Review</button></td></tr>`).join('') : '<tr><td colspan="8">No purchase orders require approval.</td></tr>';
    } catch (error) {
      setFeedback(error.message || 'Approval queue could not be loaded.', true);
    }
  };

  const loadDashboardSummary = async () => {
    const values = (summary, recentActivity = [], topVendors = []) => {
      const metrics = [summary.activeRfqs, summary.quotations, summary.purchaseOrders, summary.lowStockItems];
      dashboardView.querySelectorAll('.overview-metrics article strong').forEach((element, index) => {
        if (metrics[index] !== undefined) element.textContent = metrics[index];
      });
      const activity = dashboardView.querySelector('.overview-activity');
      if (activity) activity.innerHTML = recentActivity.length
        ? recentActivity.map((item) => `<div><i class="blue"></i><span><strong>${item.title}</strong><small>${item.detail}</small></span><time>${item.status}</time></div>`).join('')
        : '<p class="muted">No procurement activity has been stored yet.</p>';
      const ranking = dashboardView.querySelector('.vendor-ranking');
      if (ranking) ranking.innerHTML = topVendors.length
        ? topVendors.map((vendor) => `<div><span class="vendor-avatar">${vendor.name.charAt(0)}</span><strong>${vendor.name}</strong><i><em style="width:${Math.min(vendor.score, 100)}%"></em></i><b>${vendor.score}%</b></div>`).join('')
        : '<p class="muted">No approved vendors have been stored yet.</p>';
    };
    try {
      const { summary, recentActivity, topVendors } = await apiRequest('/api/dashboard/summary');
      values(summary, recentActivity, topVendors);
    } catch (error) {
      values({ activeRfqs: 0, quotations: 0, purchaseOrders: 0, lowStockItems: 0 });
      setFeedback(error.message || 'Dashboard data could not be loaded.', true);
    }
  };

  const loadFinanceRecords = async () => {
    try {
      const { records, summary } = await apiRequest('/api/finance/summary');
      const metricValues = dashboardView.querySelectorAll('.module-metrics .metric-card strong');
      if (metricValues.length >= 3) {
        const currency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(value);
        metricValues[0].textContent = currency(summary.totalInvoiced);
        metricValues[1].textContent = currency(summary.outstanding);
        metricValues[2].textContent = currency(summary.paid);
      }
      const tableBody = dashboardView.querySelector('.module-content tbody');
      if (!tableBody) return;
      if (!records.length) {
        tableBody.innerHTML = '<tr><td colspan="8">No finance records have been stored yet.</td></tr>';
        return;
      }
      const currency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
      tableBody.innerHTML = records.map((record) => `<tr><td>${record.invoiceNumber}</td><td>${record.purchaseOrderId}</td><td>${record.vendorId}</td><td>${currency(record.totalAmount)}</td><td>${record.paymentDueDate}</td><td><span class="status-badge info">${record.invoiceStatus}</span></td><td class="status-cell ${record.outstandingAmount > 0 ? 'warning' : 'approved'}"><span class="status-badge ${record.outstandingAmount > 0 ? 'warning' : 'approved'}">${record.outstandingAmount > 0 ? `Due ${currency(record.outstandingAmount)}` : 'Paid'}</span></td><td>${record.outstandingAmount > 0 ? `<button class="row-action" type="button" data-record-payment="${record.id || record.invoiceNumber}" data-remaining-balance="${record.outstandingAmount}">Record payment</button>` : '<span class="muted">Settled</span>'}</td></tr>`).join('');
      tableBody.querySelectorAll('[data-record-payment]').forEach((button) => {
        button.addEventListener('click', () => {
          const paymentForm = dashboardView.querySelector('[data-payment-form]');
          if (!paymentForm) return;
          paymentForm.elements.financeRecordId.value = button.dataset.recordPayment;
          paymentForm.elements.amount.value = button.dataset.remainingBalance;
          paymentForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
          paymentForm.elements.amount.focus();
        });
      });
    } catch (error) {
      setFeedback(error.message || 'Finance records could not be loaded.', true);
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      const { purchaseOrders } = await apiRequest('/api/purchase-orders');
      const tableBody = dashboardView.querySelector('.module-content tbody');
      if (!tableBody) return;
      if (!purchaseOrders.length) {
        tableBody.innerHTML = '<tr><td colspan="8">No purchase orders have been stored yet.</td></tr>';
        return;
      }
      const statusClass = (status) => status === 'approved' || status === 'received' ? 'approved' : status === 'rejected' || status === 'cancelled' ? 'danger' : 'warning';
      tableBody.innerHTML = purchaseOrders.map((order) => `<tr><td>${order.poNumber || order.id}</td><td>${order.vendorId}</td><td>${order.rfqId}</td><td>${new Intl.NumberFormat('en-IN', { style: 'currency', currency: order.currency || 'INR', maximumFractionDigits: 0 }).format(Number(order.totalAmount || 0))}</td><td>${order.expectedDeliveryDate || '—'}</td><td><span class="status-badge ${statusClass(order.status)}">${order.status.replaceAll('_', ' ')}</span></td><td class="status-cell ${statusClass(order.status)}"><span class="status-badge ${statusClass(order.status)}">${order.status.replaceAll('_', ' ')}</span></td><td><button class="row-action" type="button">View</button></td></tr>`).join('');
    } catch (error) {
      setFeedback(error.message || 'Purchase orders could not be loaded.', true);
    }
  };

  const loadInventoryMaterials = async () => {
    try {
      const { materials } = await apiRequest('/api/inventory/materials');
      const tableBody = dashboardView.querySelector('.module-content tbody');
      if (!tableBody) return;
      if (!materials.length) {
        tableBody.innerHTML = '<tr><td colspan="8">No inventory materials have been stored yet.</td></tr>';
        return;
      }
      tableBody.innerHTML = materials.map((material) => {
        const stock = Number(material.currentStock || 0), reorder = Number(material.reorderLevel || 0);
        const status = stock === 0 ? 'Critical' : stock <= reorder ? 'Low stock' : 'In stock';
        const badge = status === 'In stock' ? 'approved' : status === 'Critical' ? 'danger' : 'warning';
        return `<tr><td>${material.name}</td><td>${material.category}</td><td>${stock} pcs</td><td>${reorder} pcs</td><td>0 pcs</td><td>${reorder ? `${Math.round((stock / reorder) * 100)}%` : '—'}</td><td class="status-cell ${badge}"><span class="status-badge ${badge}">${status}</span></td><td><button class="row-action" type="button">View</button></td></tr>`;
      }).join('');
    } catch (error) {
      setFeedback(error.message || 'Inventory materials could not be loaded.', true);
    }
  };

  const bindDirectoryVendorForm = () => {
    const form = dashboardView.querySelector('[data-directory-vendor-form]');
    if (!form) return;
    const addVendorButton = dashboardView.querySelector('.module-heading .create-button');
    addVendorButton?.addEventListener('click', () => {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.elements.companyName.focus();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const message = form.querySelector('[data-directory-vendor-message]');
      try {
        const { vendor } = await apiRequest('/api/vendors/directory', { method: 'POST', body: JSON.stringify({ ...Object.fromEntries(data), materials: data.get('materials').split(',').map((material) => material.trim()).filter(Boolean) }) });
        form.reset();
        message.textContent = `${vendor.companyName} added for review.`;
        await loadVendors();
      } catch (error) {
        message.textContent = error.message || 'Vendor could not be added.';
      }
    });
  };

  const bindMaterialForm = () => {
    const form = dashboardView.querySelector('[data-material-form]');
    if (!form) return;
    form.insertAdjacentHTML('afterend', '<section class="module-panel goods-receipt-panel"><div class="module-toolbar"><div><span class="ai-label">GOODS RECEIPT</span><h2>Receive a purchase order</h2></div><span class="status-badge info">Updates stock immediately</span></div><form data-goods-receipt-form class="profile-form"><div><label>Purchase order *<input name="purchaseOrderId" placeholder="e.g. PO-2026-018" required /></label><label>Quantity received *<input name="receivedQuantity" type="number" min="1" required /></label></div><button class="primary-button" type="submit">Receive goods <span>→</span></button><p class="form-message" data-goods-receipt-message></p></form></section>');
    const receiptForm = dashboardView.querySelector('[data-goods-receipt-form]');
    receiptForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = receiptForm.querySelector('[data-goods-receipt-message]');
      try {
        const { material } = await apiRequest('/api/inventory/receive', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(receiptForm))) });
        receiptForm.reset();
        message.textContent = `Goods received. ${material.name} stock is now ${material.currentStock}.`;
      } catch (error) {
        message.textContent = error.message || 'Goods could not be received.';
      }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = form.querySelector('[data-material-message]');
      try {
        const { material } = await apiRequest('/api/inventory/materials', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.reset();
        message.textContent = `${material.name} added to inventory.`;
        await loadInventoryMaterials();
      } catch (error) {
        message.textContent = error.message || 'Material could not be added.';
      }
    });
  };

  const bindPurchaseOrderForm = () => {
    const form = dashboardView.querySelector('[data-purchase-order-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const message = form.querySelector('[data-purchase-order-message]');
      try {
        const { purchaseOrder } = await apiRequest('/api/purchase-orders', { method: 'POST', body: JSON.stringify(Object.fromEntries(data)) });
        form.reset();
        message.textContent = `Purchase order ${purchaseOrder.poNumber} created and sent for approval.`;
        await loadPurchaseOrders();
      } catch (error) {
        message.textContent = error.message || 'Purchase order could not be created.';
      }
    });
  };

  const bindAnalyticsExport = () => {
    const exportButton = dashboardView.querySelector('.module-heading .create-button');
    const table = dashboardView.querySelector('.module-panel table');
    if (!exportButton || !table) return;
    exportButton.addEventListener('click', () => {
      const rows = [...table.querySelectorAll('tr')].map((row) => [...row.querySelectorAll('th, td')]
        .slice(0, -1)
        .map((cell) => `"${cell.textContent.trim().replaceAll('"', '""')}"`).join(','));
      const report = ['Procurement analytics report', `Generated,${new Date().toLocaleDateString('en-IN')}`, '', ...rows].join('\n');
      const url = URL.createObjectURL(new Blob([report], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `procurement-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const bindApprovalForm = () => {
    const form = dashboardView.querySelector('[data-approval-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const message = form.querySelector('[data-approval-message]');
      try {
        await apiRequest(`/api/purchase-orders/${encodeURIComponent(data.get('purchaseOrderId'))}/status`, { method: 'PATCH', body: JSON.stringify({ status: data.get('status'), comments: data.get('comments') }) });
        message.textContent = `Purchase order ${data.get('status')}.`;
        form.reset();
        await loadPendingApprovals();
      } catch (error) {
        message.textContent = error.message || 'Approval decision could not be saved.';
      }
    });
  };

  const bindFinanceForm = () => {
    const form = dashboardView.querySelector('[data-finance-form]');
    if (!form) return;
    form.insertAdjacentHTML('afterend', '<section class="module-panel payment-form-panel"><div class="module-toolbar"><div><span class="ai-label">PAYMENT RECORDING</span><h2>Record an invoice payment</h2></div><span class="status-badge info">Updates the balance</span></div><form data-payment-form class="profile-form"><div><label>Invoice number *<input name="financeRecordId" placeholder="e.g. INV-2026-0089" required /></label><label>Payment amount (INR) *<input name="amount" type="number" min="0.01" step="0.01" required /></label></div><button class="primary-button" type="submit">Record payment <span>→</span></button><p class="form-message" data-payment-message></p></form></section>');
    const paymentForm = dashboardView.querySelector('[data-payment-form]');
    paymentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(paymentForm);
      const message = paymentForm.querySelector('[data-payment-message]');
      try {
        const payment = await apiRequest(`/api/finance/${encodeURIComponent(data.get('financeRecordId'))}/payment`, { method: 'PATCH', body: JSON.stringify({ amount: data.get('amount') }) });
        paymentForm.reset();
        message.textContent = `Payment recorded. Remaining balance: ${formatCurrency(payment.outstandingAmount)}.`;
        await loadFinanceRecords();
      } catch (error) {
        message.textContent = error.message || 'Payment could not be recorded.';
      }
    });
    const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
    const updateBalance = () => {
      const amount = Number(form.querySelector('[data-balance-amount]').value) || 0;
      const tax = Number(form.querySelector('[data-balance-tax]').value) || 0;
      const paid = Number(form.querySelector('[data-balance-paid]').value) || 0;
      const total = amount + tax;
      const submitButton = form.querySelector('button[type="submit"]');
      form.querySelector('[data-balance-total]').textContent = formatCurrency(total);
      form.querySelector('[data-balance-outstanding]').textContent = formatCurrency(Math.max(total - paid, 0));
      if (paid > total) {
        form.querySelector('[data-finance-message]').textContent = 'Amount paid cannot be greater than the total invoice amount.';
        submitButton.disabled = true;
      } else {
        form.querySelector('[data-finance-message]').textContent = '';
        submitButton.disabled = false;
      }
    };
    form.querySelectorAll('[data-balance-amount], [data-balance-tax], [data-balance-paid]').forEach((field) => field.addEventListener('input', updateBalance));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const message = form.querySelector('[data-finance-message]');
      try {
        const total = Number(data.get('amount')) + Number(data.get('tax') || 0);
        if (Number(data.get('paidAmount') || 0) > total) throw new Error('Amount paid cannot be greater than the total invoice amount.');
        const { financeRecord } = await apiRequest('/api/finance', { method: 'POST', body: JSON.stringify(Object.fromEntries(data)) });
        form.reset();
        updateBalance();
        message.textContent = `Balance record created. Remaining amount: ${formatCurrency(financeRecord.outstandingAmount)}.`;
        await loadFinanceRecords();
      } catch (error) {
        message.textContent = error.message || 'Balance record could not be created.';
      }
    });
    updateBalance();
  };

  const loadVendorRfqs = async () => {
    try {
      const { rfqs } = await apiRequest('/api/rfqs');
      const tableBody = dashboardView.querySelector('.module-content tbody');
      if (!tableBody) return;
      tableBody.innerHTML = rfqs.length
        ? rfqs.map((rfq) => `<tr><td>${rfq.id}</td><td>${rfq.material}</td><td>${rfq.quantity}</td><td>${rfq.specifications}</td><td>${rfq.deadline}</td><td>${rfq.additionalRequirements || 'None'}</td><td><span class="status-badge info">${rfq.status}</span></td><td><button class="row-action" type="button">View requirements</button></td></tr>`).join('')
        : '<tr><td colspan="8">No matched RFQs are available for your vendor profile.</td></tr>';
    } catch {
      setFeedback('Available RFQs could not be loaded.', true);
    }
  };

  const bindRfqForm = () => {
    const form = dashboardView.querySelector('[data-rfq-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const message = form.querySelector('[data-rfq-message]');
      try {
        const { rfq, inventoryCheck } = await apiRequest('/api/rfqs', {
          method: 'POST',
          body: JSON.stringify({
            material: data.get('material'),
            quantity: data.get('quantity'),
            deadline: data.get('deadline'),
            budget: data.get('budget'),
            specifications: data.get('specifications'),
            additionalRequirements: data.get('additionalRequirements'),
            status: 'draft'
          })
        });
        form.reset();
        message.textContent = inventoryCheck.warning || `RFQ saved as a draft. Inventory shortage: ${inventoryCheck.shortage} units.`;
        await loadRfqs();
        if (!inventoryCheck.procurementRequired) {
          const decisionBox = document.createElement('div');
          decisionBox.className = 'inventory-decision';
          decisionBox.innerHTML = '<button type="button" class="primary-button" data-procurement-decision="continue">Continue Procurement</button><button type="button" class="secondary-button" data-procurement-decision="cancel">Cancel RFQ</button>';
          message.after(decisionBox);
          decisionBox.querySelectorAll('[data-procurement-decision]').forEach((button) => {
            button.addEventListener('click', async () => {
              const decision = button.dataset.procurementDecision;
              await apiRequest(`/api/rfqs/${rfq.id}/procurement-decision`, {
                method: 'PATCH',
                body: JSON.stringify({ decision })
              });
              if (decision === 'continue') {
                const matchResult = await apiRequest(`/api/rfqs/${rfq.id}/match-vendors`, { method: 'POST' });
                decisionBox.innerHTML = matchResult.matchedVendors.length
                  ? `<strong>Matched vendors:</strong> ${matchResult.matchedVendors.map((vendor) => vendor.companyName).join(', ')}`
                  : 'RFQ sent, but no approved matching vendors were found.';
              } else {
                decisionBox.textContent = 'RFQ cancelled.';
              }
            });
          });
        }
      } catch (error) {
        const localRfq = saveLocalRfq(Object.fromEntries(data));
        form.reset();
        message.textContent = `Firebase is unavailable. ${localRfq.id} was saved temporarily in this browser.`;
        const tableBody = dashboardView.querySelector('.rfq-table tbody');
        if (tableBody) renderRfqRows(tableBody, getLocalRfqs());
      }
    });
  };

  const loadVendorProfile = async () => {
    const form = dashboardView.querySelector('[data-vendor-profile-form]');
    if (!form) return;

    try {
      const { vendor } = await apiRequest('/api/vendors/mine');
      if (!vendor) {
        form.querySelector('[data-profile-message]').textContent = 'No vendor profile has been created for this account yet.';
        return;
      }
      form.companyName.value = vendor.companyName || '';
      form.contact.value = vendor.contact || '';
      form.category.value = vendor.category || '';
      form.materials.value = (vendor.materials || []).join(', ');
      form.companyInformation.value = vendor.companyInformation || '';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        try {
          await apiRequest('/api/vendors/mine', {
            method: 'PATCH',
            body: JSON.stringify({
              companyName: data.get('companyName'),
              contact: data.get('contact'),
              category: data.get('category'),
              materials: data.get('materials').split(',').map((material) => material.trim()),
              companyInformation: data.get('companyInformation')
            })
          });
          form.querySelector('[data-profile-message]').textContent = 'Profile saved successfully.';
        } catch {
          form.querySelector('[data-profile-message]').textContent = 'Profile could not be saved.';
        }
      });
    } catch {
      form.querySelector('[data-profile-message]').textContent = 'Vendor profile could not be loaded.';
    }
  };

  const loadVendors = async () => {
    try {
      const { vendors } = await apiRequest('/api/vendors');
      const tableBody = dashboardView.querySelector('.module-content tbody');
      if (!tableBody) return;
      const metrics = dashboardView.querySelectorAll('.module-metrics .metric-card strong');
      const approved = vendors.filter((vendor) => ['approved', 'active'].includes(vendor.status)).length;
      const pending = vendors.filter((vendor) => vendor.status === 'pending').length;
      if (metrics[0]) metrics[0].textContent = approved;
      if (metrics[2]) metrics[2].textContent = pending;
      if (!vendors.length) {
        tableBody.innerHTML = '<tr><td colspan="8">No vendors have been stored yet.</td></tr>';
        return;
      }
      tableBody.innerHTML = vendors.map((vendor) => {
        const rating = Number(vendor.qualityScore || 0) ? `${Number(vendor.qualityScore).toFixed(1)} / 5` : 'Not rated';
        const performance = Number(vendor.reliabilityScore || 0) ? `${vendor.reliabilityScore}%` : 'No history';
        const status = String(vendor.status || 'pending');
        const badge = ['approved', 'active'].includes(status) ? 'approved' : status === 'rejected' ? 'danger' : 'warning';
        return `<tr><td>${vendor.companyName}</td><td>${vendor.category}</td><td>${vendor.contact}</td><td>${rating}</td><td>${vendor.historicalOrders || 0}</td><td>${performance}</td><td class="status-cell ${badge}"><span class="status-badge ${badge}">${status}</span></td><td><button class="row-action" type="button">View</button></td></tr>`;
      }).join('');
    } catch (error) {
      setFeedback(error.message || 'Vendors could not be loaded.', true);
    }
  };

  const loadPendingVendors = async () => {
    try {
      const { vendors } = await apiRequest('/api/vendors/pending');
      const tableBody = dashboardView.querySelector('.module-content tbody');
      if (!tableBody) return;
      tableBody.innerHTML = vendors.length
        ? vendors.map((vendor) => `<tr><td>${vendor.companyName}</td><td>${vendor.category}</td><td>${vendor.contact}</td><td>New</td><td>0</td><td>Pending review</td><td class="status-cell warning"><span class="status-badge warning">PENDING</span></td><td><button class="row-action approve-action" data-vendor-id="${vendor.id}" data-vendor-status="approved" type="button">Approve</button><button class="row-action reject-action" data-vendor-id="${vendor.id}" data-vendor-status="rejected" type="button">Reject</button></td></tr>`).join('')
        : '<tr><td colspan="8">No pending vendors require review.</td></tr>';
      tableBody.querySelectorAll('[data-vendor-status]').forEach((button) => {
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await apiRequest(`/api/vendors/${button.dataset.vendorId}/status`, {
              method: 'PATCH',
              body: JSON.stringify({ status: button.dataset.vendorStatus })
            });
            await loadPendingVendors();
          } catch {
            button.disabled = false;
            setFeedback('Unable to update vendor status.', true);
          }
        });
      });
    } catch {
      setFeedback('Pending vendors could not be loaded. Check backend Firebase configuration.', true);
    }
  };

  dashboardView.querySelectorAll('.nav-item[href]').forEach((item) => {
    item.addEventListener('click', (event) => {
      const href = item.getAttribute('href');
      if (!href || href === '#settings') return;
      event.preventDefault();
      window.history.pushState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
      dashboardView.classList.remove('menu-open');
    });
  });
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('popstate', renderRoute);
  renderRoute();
}

async function getToken() {
  if (!auth.currentUser) {
    throw new Error('You are not signed in.');
  }

  return auth.currentUser.getIdToken();
}

async function apiRequest(path, options = {}) {
  // Operational workspace data is deliberately browser-local. This keeps the
  // records shown in each tab after refreshes and lets the UI work offline.
  if (isLocalDataRequest(path)) {
    return localApiRequest(path, options);
  }

  try {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers
      }
    });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(body.error || 'Request failed.');
      error.status = response.status;
      throw error;
    }
    return body;
  } catch (error) {
    if (!error.status || error.status >= 500) return localApiRequest(path, options);
    throw error;
  }
}

async function renderSession(user) {
  let profile;

  try {
    ({ user: profile } = await apiRequest('/api/auth/session'));
  } catch {
    profile = {
      id: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'Buyer',
      email: user.email || '',
      role: 'buyer',
      status: 'active'
    };
    setFeedback('Signed in. Backend profile sync is pending.', false);
  }

  if (window.location.pathname === '/' || window.location.pathname === '/login') {
    window.history.replaceState({}, '', '/dashboard');
  }
  appShell.dataset.view = 'dashboard';
  authView.hidden = true;
  dashboardView.hidden = false;
  dashboardView.innerHTML = dashboardMarkup(profile);
  dashboardView.querySelector('[data-sign-out]').addEventListener('click', async () => {
    await signOut(auth);
  });
  dashboardView.querySelector('.mobile-menu').addEventListener('click', () => {
    dashboardView.classList.toggle('menu-open');
  });
  bindDashboardNavigation(profile);
  appShell.dataset.role = profile.role;
}

loginForm.querySelector('[data-password-toggle]').addEventListener('click', (event) => {
  const passwordInput = loginForm.querySelector('[name="password"]');
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  event.currentTarget.textContent = isPassword ? 'Hide' : 'Show';
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (firebaseConfigurationError) return;
  const form = new FormData(event.currentTarget);
  loginButton.disabled = true;
  loginLabel.textContent = 'Signing in';
  loginArrow.textContent = '...';
  loginMessage.textContent = '';

  try {
    await signInWithEmailAndPassword(auth, form.get('email'), form.get('password'));
    setFeedback('Signed in successfully.');
  } catch (error) {
    loginMessage.textContent = getLoginErrorMessage(error);
    setFeedback(getLoginErrorMessage(error), true);
  } finally {
    loginButton.disabled = false;
    loginLabel.textContent = 'Sign in';
    loginArrow.textContent = '->';
  }
});

roleSelect.addEventListener('change', () => {
  const isVendor = roleSelect.value === 'vendor';
  vendorFields.hidden = !isVendor;
  vendorFields.querySelectorAll('input, textarea').forEach((field) => {
    field.required = isVendor;
  });
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (firebaseConfigurationError) return;
  const form = new FormData(event.currentTarget);

  try {
    await createUserWithEmailAndPassword(auth, form.get('email'), form.get('password'));
    await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: form.get('name'), role: form.get('role') })
    });
    if (form.get('role') === 'vendor') {
      await apiRequest('/api/vendors', {
        method: 'POST',
        body: JSON.stringify({
          companyName: form.get('companyName'),
          contact: form.get('contact'),
          category: form.get('category'),
          materials: form.get('materials').split(',').map((material) => material.trim()),
          companyInformation: form.get('companyInformation')
        })
      });
    }
    setFeedback('Account created successfully.');
  } catch (error) {
    const configurationError = error.code === 'auth/api-key-not-valid' || error.code === 'auth/invalid-api-key';
    setFeedback(configurationError ? 'Firebase configuration is invalid. Check frontend/js/firebase-config.js.' : 'Account creation failed. Please verify the form and try again.', true);
  }
});

if (auth) onAuthStateChanged(auth, async (user) => {
  if (!user) {
    const route = window.location.pathname;
    const previewRoute = route === '/' || route === '/dashboard' || route.endsWith('/index.html');
    if (previewRoute) {
      landingPage.hidden = true;
      appShell.hidden = false;
      appShell.dataset.view = 'dashboard';
      authView.hidden = true;
      dashboardView.hidden = false;
      dashboardView.innerHTML = dashboardMarkup(null);
      dashboardView.querySelector('[data-sign-out]').textContent = 'Sign in';
      bindDashboardNavigation({ name: 'Preview user', role: 'buyer' });
      return;
    }
    landingPage.hidden = true;
    appShell.hidden = false;
    if (route !== '/login') window.history.replaceState({}, '', '/login');
    appShell.dataset.view = 'auth';
    authView.hidden = false;
    dashboardView.hidden = true;
    dashboardView.innerHTML = '';
    appShell.dataset.role = '';
    return;
  }

  try {
    landingPage.hidden = true;
    appShell.hidden = false;
    await renderSession(user);
  } catch (error) {
    setFeedback(error.message, true);
  }
});

if (!auth && (window.location.pathname === '/' || window.location.pathname === '/dashboard' || window.location.pathname.endsWith('/index.html'))) {
  landingPage.hidden = true;
  appShell.hidden = false;
  appShell.dataset.view = 'dashboard';
  authView.hidden = true;
  dashboardView.hidden = false;
  dashboardView.innerHTML = dashboardMarkup(null);
  dashboardView.querySelector('[data-sign-out]').textContent = 'Sign in';
  bindDashboardNavigation({ name: 'Preview user', role: 'buyer' });
}
