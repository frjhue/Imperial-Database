let currentUser = null;
let authToken = null;

// ============================================================
// SECURITY HELPER
// ============================================================
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// API HELPER
// ============================================================
async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    };
    if (data) options.body = JSON.stringify(data);

    const response = await fetch(`/api${endpoint}`, options);
    const result = await response.json();

    if (!response.ok) {
        throw new Error((result && result.error) ? result.error : `Request failed (${response.status})`);
    }
    return result;
}

// ============================================================
// SESSION PERSISTENCE (survives page refresh)
// ============================================================
async function restoreSession() {
    const savedToken = localStorage.getItem('inq_token');
    if (!savedToken) return false;

    authToken = savedToken;
    try {
        const data = await apiRequest('/auth/verify');
        currentUser = data.user;
        showApp();
        return true;
    } catch (error) {
        localStorage.removeItem('inq_token');
        authToken = null;
        return false;
    }
}

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    document.getElementById('userDisplay').textContent = `${currentUser.rank} ${currentUser.callsign}`;
    document.getElementById('userDept').textContent = `Department: ${currentUser.department} • Clearance: Level ${currentUser.clearance_level}`;
    refreshAll();
}

function refreshAll() {
    loadDashboard();
    loadSubjects();
    loadCases();
    loadReports();
    loadEvidence();
    loadEntities();
    loadPersonnel();
    loadLogs();
    loadCaseFilter();
}

// ============================================================
// AUTHENTICATION
// ============================================================
async function handleLogin() {
    const callsign = document.getElementById('loginCallsign').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    errorEl.style.display = 'none';

    if (!callsign || !password) {
        errorEl.textContent = '⚠ Please enter both callsign and access code';
        errorEl.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callsign, password })
        });
        const data = await response.json();

        if (!response.ok) {
            errorEl.textContent = `⛔ ${data.error || 'Access Denied'}`;
            errorEl.style.display = 'block';
            return;
        }

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('inq_token', authToken);

        showApp();
    } catch (error) {
        errorEl.textContent = '⚠ Connection error. Check cogitator link.';
        errorEl.style.display = 'block';
    }
}

async function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('inq_token');
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginPassword').value = '';
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
    try {
        const stats = await apiRequest('/dashboard/stats');
        document.getElementById('statSubjects').textContent = stats.total_subjects || 0;
        document.getElementById('statCases').textContent = stats.open_cases || 0;
        document.getElementById('statReports').textContent = stats.total_reports || 0;
        document.getElementById('statEvidence').textContent = stats.total_evidence || 0;
        document.getElementById('statPersonnel').textContent = stats.active_personnel || 0;
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

// ============================================================
// TAB NAVIGATION
// ============================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        const tabId = this.dataset.tab;
        document.getElementById(`tab-${tabId}`).classList.add('active');

        switch (tabId) {
            case 'subjects': loadSubjects(); break;
            case 'cases': loadCases(); break;
            case 'reports': loadReports(); break;
            case 'evidence': loadEvidence(); break;
            case 'entities': loadEntities(); break;
            case 'personnel': loadPersonnel(); break;
            case 'logs': loadLogs(); break;
        }
    });
});

// ============================================================
// GENERIC DETAIL VIEW MODAL
// ============================================================
function showDetailModal(title, fields) {
    document.getElementById('modalTitle').textContent = title;
    const rows = fields.map(([label, value]) => `
        <div class="form-group">
            <label>${escapeHtml(label)}</label>
            <div style="padding:8px 12px; background:var(--terminal-bg); border:1px solid var(--terminal-border); white-space:pre-wrap; word-break:break-word;">${escapeHtml(value ?? '-')}</div>
        </div>
    `).join('');
    document.getElementById('modalBody').innerHTML = rows;
    document.getElementById('modalOverlay').style.display = 'flex';
}

// ============================================================
// SEARCH HELPER (generic row filter)
// ============================================================
function filterTable(inputId, tbodyId) {
    const search = document.getElementById(inputId).value.toLowerCase();
    const rows = document.querySelectorAll(`#${tbodyId} tr`);
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

// ============================================================
// SUBJECTS CRUD
// ============================================================
let subjectsCache = [];

async function loadSubjects() {
    try {
        const subjects = await apiRequest('/subjects');
        subjectsCache = subjects;
        const tbody = document.getElementById('subjectsTableBody');

        if (!subjects || subjects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading-text">No subjects found</td></tr>';
            return;
        }

        tbody.innerHTML = subjects.map(s => `
            <tr class="clickable-row" onclick="viewSubject(${Number(s.id)})">
                <td>${escapeHtml(s.id ?? '-')}</td>
                <td><strong>${escapeHtml(s.designation || 'Unknown')}</strong></td>
                <td><span class="status-badge ${escapeHtml(s.classification || 'unknown')}">${escapeHtml(s.classification || 'unknown')}</span></td>
                <td>${escapeHtml(s.planet_of_origin || '-')}</td>
                <td><span class="status-badge ${escapeHtml(s.loyalty_status || 'unknown')}">${escapeHtml(s.loyalty_status || 'unknown')}</span></td>
                <td>${escapeHtml(s.roblox_profile || '-')}</td>
                <td>${escapeHtml(s.discord_userid || '-')}</td>
                <td>${s.notes ? escapeHtml(s.notes.substring(0, 50) + (s.notes.length > 50 ? '...' : '')) : '-'}</td>
                <td>${s.created_at ? escapeHtml(new Date(s.created_at).toLocaleDateString()) : '-'}</td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-edit" onclick="editSubject(${Number(s.id)})">✎</button>
                    <button class="btn-danger" onclick="deleteSubject(${Number(s.id)})">✕</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('subjectsTableBody').innerHTML =
            '<tr><td colspan="10" class="loading-text">⚠ No subjects available</td></tr>';
    }
}

function viewSubject(id) {
    const s = subjectsCache.find(x => x.id === id);
    if (!s) return;
    showDetailModal(`📋 Subject Dossier: ${s.designation}`, [
        ['ID', s.id],
        ['Designation', s.designation],
        ['Classification', s.classification],
        ['Planet of Origin', s.planet_of_origin],
        ['Loyalty Status', s.loyalty_status],
        ['Roblox Profile', s.roblox_profile],
        ['Discord User ID', s.discord_userid],
        ['Notes', s.notes],
        ['Created', s.created_at ? new Date(s.created_at).toLocaleString() : '-']
    ]);
}

function openSubjectModal(data = null) {
    const isEdit = data !== null;
    document.getElementById('modalTitle').textContent = isEdit ? '✎ Edit Subject' : '➕ New Subject';
    document.getElementById('modalBody').innerHTML = `
        <form id="subjectForm" onsubmit="saveSubject(event, ${isEdit ? Number(data.id) : 'null'})">
            <div class="form-group">
                <label>Designation *</label>
                <input type="text" id="subjDesignation" value="${isEdit ? escapeHtml(data.designation) : ''}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Classification</label>
                    <select id="subjClassification">
                        ${['civilian','military','noble','psyker','mutant','xenos','heretic','inquisitor','unknown'].map(c =>
                            `<option value="${c}" ${isEdit && data.classification === c ? 'selected' : ''}>${c}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Planet of Origin</label>
                    <input type="text" id="subjPlanet" value="${isEdit ? escapeHtml(data.planet_of_origin || '') : ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Loyalty Status</label>
                <select id="subjLoyalty">
                    ${['loyal','heretic','xenos','renegade','unknown'].map(l =>
                        `<option value="${l}" ${isEdit && data.loyalty_status === l ? 'selected' : ''}>${l}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Roblox Profile</label>
                    <input type="text" id="subjRoblox" placeholder="https://www.roblox.com/users/..." value="${isEdit ? escapeHtml(data.roblox_profile || '') : ''}">
                </div>
                <div class="form-group">
                    <label>Discord User ID</label>
                    <input type="text" id="subjDiscord" placeholder="e.g. 123456789012345678" value="${isEdit ? escapeHtml(data.discord_userid || '') : ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea id="subjNotes">${isEdit ? escapeHtml(data.notes || '') : ''}</textarea>
            </div>
            <button type="submit" class="btn-submit">${isEdit ? 'UPDATE RECORD' : 'CREATE RECORD'}</button>
        </form>
    `;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveSubject(event, id) {
    event.preventDefault();
    const data = {
        designation: document.getElementById('subjDesignation').value.trim(),
        classification: document.getElementById('subjClassification').value,
        planet_of_origin: document.getElementById('subjPlanet').value.trim(),
        loyalty_status: document.getElementById('subjLoyalty').value,
        roblox_profile: document.getElementById('subjRoblox').value.trim(),
        discord_userid: document.getElementById('subjDiscord').value.trim(),
        notes: document.getElementById('subjNotes').value.trim()
    };
    try {
        if (id) await apiRequest(`/subjects/${id}`, 'PUT', data);
        else await apiRequest('/subjects', 'POST', data);
        closeModal();
        await loadSubjects();
        await loadDashboard();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

function editSubject(id) {
    const subject = subjectsCache.find(s => s.id === id);
    if (subject) openSubjectModal(subject);
}

async function deleteSubject(id) {
    if (!confirm('⚠ Purge this subject from the database?')) return;
    try {
        await apiRequest(`/subjects/${id}`, 'DELETE');
        await loadSubjects();
        await loadDashboard();
    } catch (error) {
        alert(`Failed to delete: ${error.message}`);
    }
}

// ============================================================
// CASES CRUD
// ============================================================
let casesCache = [];

async function loadCases() {
    try {
        const cases = await apiRequest('/casefiles');
        casesCache = cases;
        const tbody = document.getElementById('casesTableBody');

        if (!cases || cases.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading-text">No cases found</td></tr>';
            return;
        }

        tbody.innerHTML = cases.map(c => `
            <tr class="clickable-row" onclick="viewCase(${Number(c.id)})">
                <td>${escapeHtml(c.id ?? '-')}</td>
                <td><strong>${escapeHtml(c.designation || 'Unknown')}</strong></td>
                <td><span class="status-badge ${escapeHtml(c.threat_level || 'low')}">${escapeHtml(c.threat_level || 'low')}</span></td>
                <td><span class="status-badge ${escapeHtml(c.status || 'open')}">${escapeHtml(c.status || 'open')}</span></td>
                <td>${escapeHtml(c.assigned_officer_name || 'Unassigned')}</td>
                <td>${escapeHtml(c.subject_count || 0)}</td>
                <td>${escapeHtml(c.report_count || 0)}</td>
                <td>${c.summary ? escapeHtml(c.summary.substring(0, 40) + (c.summary.length > 40 ? '...' : '')) : '-'}</td>
                <td>${c.created_at ? escapeHtml(new Date(c.created_at).toLocaleDateString()) : '-'}</td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-edit" onclick="editCase(${Number(c.id)})">✎</button>
                    <button class="btn-danger" onclick="deleteCase(${Number(c.id)})">✕</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('casesTableBody').innerHTML =
            '<tr><td colspan="10" class="loading-text">⚠ No cases available</td></tr>';
    }
}

function viewCase(id) {
    const c = casesCache.find(x => x.id === id);
    if (!c) return;
    showDetailModal(`📁 Case File: ${c.designation}`, [
        ['ID', c.id],
        ['Designation', c.designation],
        ['Threat Level', c.threat_level],
        ['Status', c.status],
        ['Assigned Officer', c.assigned_officer_name],
        ['Linked Subjects', c.subject_count],
        ['Linked Reports', c.report_count],
        ['Summary', c.summary],
        ['Created', c.created_at ? new Date(c.created_at).toLocaleString() : '-']
    ]);
}

function openCaseModal(data = null) {
    const isEdit = data !== null;
    document.getElementById('modalTitle').textContent = isEdit ? '✎ Edit Case' : '📁 New Case';
    document.getElementById('modalBody').innerHTML = `
        <form id="caseForm" onsubmit="saveCase(event, ${isEdit ? Number(data.id) : 'null'})">
            <div class="form-group">
                <label>Case Designation *</label>
                <input type="text" id="caseDesignation" value="${isEdit ? escapeHtml(data.designation) : ''}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Threat Level</label>
                    <select id="caseThreat">
                        ${['low','medium','high','alpha','existential'].map(t =>
                            `<option value="${t}" ${isEdit && data.threat_level === t ? 'selected' : ''}>${t}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="caseStatus">
                        ${['open','closed','cold'].map(s =>
                            `<option value="${s}" ${isEdit && data.status === s ? 'selected' : ''}>${s}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Assigned Officer ID</label>
                <input type="number" id="caseOfficer" value="${isEdit ? escapeHtml(data.assigned_officer || '') : ''}">
            </div>
            <div class="form-group">
                <label>Summary</label>
                <textarea id="caseSummary">${isEdit ? escapeHtml(data.summary || '') : ''}</textarea>
            </div>
            <button type="submit" class="btn-submit">${isEdit ? 'UPDATE CASE' : 'CREATE CASE'}</button>
        </form>
    `;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveCase(event, id) {
    event.preventDefault();
    const data = {
        designation: document.getElementById('caseDesignation').value.trim(),
        threat_level: document.getElementById('caseThreat').value,
        status: document.getElementById('caseStatus').value,
        assigned_officer: parseInt(document.getElementById('caseOfficer').value) || null,
        summary: document.getElementById('caseSummary').value.trim()
    };
    try {
        if (id) await apiRequest(`/casefiles/${id}`, 'PUT', data);
        else await apiRequest('/casefiles', 'POST', data);
        closeModal();
        await loadCases();
        await loadDashboard();
        await loadCaseFilter();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

function editCase(id) {
    const casefile = casesCache.find(c => c.id === id);
    if (casefile) openCaseModal(casefile);
}

async function deleteCase(id) {
    if (!confirm('⚠ Close and purge this case file?')) return;
    try {
        await apiRequest(`/casefiles/${id}`, 'DELETE');
        await loadCases();
        await loadDashboard();
        await loadCaseFilter();
    } catch (error) {
        alert(`Failed to delete: ${error.message}`);
    }
}

// ============================================================
// REPORTS CRUD
// ============================================================
let reportsCache = [];

async function loadReports() {
    try {
        const caseFilter = document.getElementById('reportCaseFilter').value;
        const url = caseFilter ? `/reports?case_id=${caseFilter}` : '/reports';
        const reports = await apiRequest(url);
        reportsCache = reports;
        const tbody = document.getElementById('reportsTableBody');

        if (!reports || reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No reports found</td></tr>';
            return;
        }

        tbody.innerHTML = reports.map(r => `
            <tr class="clickable-row" onclick="viewReport(${Number(r.id)})">
                <td>${escapeHtml(r.id ?? '-')}</td>
                <td>${escapeHtml(r.case_designation || r.case_id || '-')}</td>
                <td>${escapeHtml(r.author_name || 'Unknown')}</td>
                <td>${r.content ? escapeHtml(r.content.substring(0, 60) + (r.content.length > 60 ? '...' : '')) : '-'}</td>
                <td><span class="status-badge ${escapeHtml(r.classification || 'restricted')}">${escapeHtml(r.classification || 'restricted')}</span></td>
                <td>Level ${escapeHtml(r.access_level || 1)}</td>
                <td>${r.created_at ? escapeHtml(new Date(r.created_at).toLocaleDateString()) : '-'}</td>
                <td onclick="event.stopPropagation()"><button class="btn-danger" onclick="deleteReport(${Number(r.id)})">✕</button></td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('reportsTableBody').innerHTML =
            '<tr><td colspan="8" class="loading-text">⚠ No reports available</td></tr>';
    }
}

function viewReport(id) {
    const r = reportsCache.find(x => x.id === id);
    if (!r) return;
    showDetailModal(`📄 Report #${r.id}`, [
        ['Case', r.case_designation],
        ['Author', r.author_name],
        ['Classification', r.classification],
        ['Access Level', r.access_level],
        ['Content', r.content],
        ['Filed', r.created_at ? new Date(r.created_at).toLocaleString() : '-']
    ]);
}

async function loadCaseFilter() {
    try {
        const cases = await apiRequest('/casefiles');
        const select = document.getElementById('reportCaseFilter');
        const current = select.value;
        select.innerHTML = '<option value="">All Cases</option>' +
            cases.map(c => `<option value="${Number(c.id)}">${escapeHtml(c.designation)}</option>`).join('');
        select.value = current;
    } catch (error) {
        console.error('Failed to load case filter:', error);
    }
}

function openReportModal() {
    document.getElementById('modalTitle').textContent = '📄 File New Report';
    document.getElementById('modalBody').innerHTML = `
        <form id="reportForm" onsubmit="saveReport(event)">
            <div class="form-group">
                <label>Case ID *</label>
                <input type="number" id="reportCaseId" required>
            </div>
            <div class="form-group">
                <label>Content *</label>
                <textarea id="reportContent" required></textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Classification</label>
                    <select id="reportClassification">
                        ${['restricted','confidential','secret','top_secret'].map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Access Level</label>
                    <select id="reportAccess">
                        ${[1,2,3,4,5].map(l => `<option value="${l}">Level ${l}</option>`).join('')}
                    </select>
                </div>
            </div>
            <button type="submit" class="btn-submit">FILE REPORT</button>
        </form>
    `;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveReport(event) {
    event.preventDefault();
    const data = {
        case_id: parseInt(document.getElementById('reportCaseId').value),
        content: document.getElementById('reportContent').value.trim(),
        classification: document.getElementById('reportClassification').value,
        access_level: parseInt(document.getElementById('reportAccess').value)
    };
    try {
        await apiRequest('/reports', 'POST', data);
        closeModal();
        await loadReports();
        await loadDashboard();
        await loadCases();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteReport(id) {
    if (!confirm('⚠ Delete this report?')) return;
    try {
        await apiRequest(`/reports/${id}`, 'DELETE');
        await loadReports();
        await loadDashboard();
    } catch (error) {
        alert(`Failed to delete: ${error.message}`);
    }
}

// ============================================================
// EVIDENCE CRUD
// ============================================================
let evidenceCache = [];

async function loadEvidence() {
    try {
        const evidenceList = await apiRequest('/evidence');
        evidenceCache = evidenceList;
        const tbody = document.getElementById('evidenceTableBody');

        if (!evidenceList || evidenceList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No evidence found</td></tr>';
            return;
        }

        tbody.innerHTML = evidenceList.map(e => `
            <tr class="clickable-row" onclick="viewEvidence(${Number(e.id)})">
                <td>${escapeHtml(e.id ?? '-')}</td>
                <td>${escapeHtml(e.case_designation || e.case_id || '-')}</td>
                <td>${escapeHtml(e.file_name || '-')}</td>
                <td>${escapeHtml(e.evidence_type || '-')}</td>
                <td>${escapeHtml(e.uploaded_by_name || 'Unknown')}</td>
                <td>Level ${escapeHtml(e.access_level || 2)}</td>
                <td>${e.created_at ? escapeHtml(new Date(e.created_at).toLocaleDateString()) : '-'}</td>
                <td onclick="event.stopPropagation()"><button class="btn-danger" onclick="deleteEvidence(${Number(e.id)})">✕</button></td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('evidenceTableBody').innerHTML =
            '<tr><td colspan="8" class="loading-text">⚠ No evidence available</td></tr>';
    }
}

function viewEvidence(id) {
    const e = evidenceCache.find(x => x.id === id);
    if (!e) return;
    showDetailModal(`💾 Evidence: ${e.file_name}`, [
        ['Case', e.case_designation],
        ['File Name', e.file_name],
        ['Storage Path', e.storage_path],
        ['Type', e.evidence_type],
        ['Uploaded By', e.uploaded_by_name],
        ['Access Level', e.access_level],
        ['Created', e.created_at ? new Date(e.created_at).toLocaleString() : '-']
    ]);
}

function openEvidenceModal() {
    document.getElementById('modalTitle').textContent = '💾 Upload Evidence';
    document.getElementById('modalBody').innerHTML = `
        <form id="evidenceForm" onsubmit="saveEvidence(event)">
            <div class="form-group">
                <label>Case ID *</label>
                <input type="number" id="evidenceCaseId" required>
            </div>
            <div class="form-group">
                <label>File Name *</label>
                <input type="text" id="evidenceFileName" required>
            </div>
            <div class="form-group">
                <label>Storage Path</label>
                <input type="text" id="evidencePath" placeholder="/data/evidence/...">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Evidence Type</label>
                    <select id="evidenceType">
                        ${['document','image','audio','video','artifact','data_slate','other'].map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Access Level</label>
                    <select id="evidenceAccess">
                        ${[1,2,3,4,5].map(l => `<option value="${l}">Level ${l}</option>`).join('')}
                    </select>
                </div>
            </div>
            <button type="submit" class="btn-submit">UPLOAD EVIDENCE</button>
        </form>
    `;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveEvidence(event) {
    event.preventDefault();
    const data = {
        case_id: parseInt(document.getElementById('evidenceCaseId').value),
        file_name: document.getElementById('evidenceFileName').value.trim(),
        storage_path: document.getElementById('evidencePath').value.trim(),
        evidence_type: document.getElementById('evidenceType').value,
        access_level: parseInt(document.getElementById('evidenceAccess').value)
    };
    try {
        await apiRequest('/evidence', 'POST', data);
        closeModal();
        await loadEvidence();
        await loadDashboard();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteEvidence(id) {
    if (!confirm('⚠ Delete this evidence item?')) return;
    try {
        await apiRequest(`/evidence/${id}`, 'DELETE');
        await loadEvidence();
        await loadDashboard();
    } catch (error) {
        alert(`Failed to delete: ${error.message}`);
    }
}

// ============================================================
// ENTITIES CRUD
// ============================================================
let entitiesCache = [];

async function loadEntities() {
    try {
        const entitiesList = await apiRequest('/entities');
        entitiesCache = entitiesList;
        const tbody = document.getElementById('entitiesTableBody');

        if (!entitiesList || entitiesList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading-text">No entities found</td></tr>';
            return;
        }

        tbody.innerHTML = entitiesList.map(e => `
            <tr class="clickable-row" onclick="viewEntity(${Number(e.id)})">
                <td>${escapeHtml(e.id ?? '-')}</td>
                <td><strong>${escapeHtml(e.entity_name || 'Unknown')}</strong></td>
                <td>${escapeHtml(e.entity_type || '-')}</td>
                <td><span class="status-badge ${escapeHtml(e.classification || 'unknown')}">${escapeHtml(e.classification || 'unknown')}</span></td>
                <td>${escapeHtml(e.subject_name || '-')}</td>
                <td>${escapeHtml(e.case_name || '-')}</td>
                <td><span style="color: ${e.threat_rating >= 8 ? 'var(--terminal-red)' : e.threat_rating >= 5 ? 'var(--terminal-amber)' : 'var(--terminal-green)'}">${escapeHtml(e.threat_rating || 0)}/10</span></td>
                <td>${e.description ? escapeHtml(e.description.substring(0, 30) + (e.description.length > 30 ? '...' : '')) : '-'}</td>
                <td>${e.created_at ? escapeHtml(new Date(e.created_at).toLocaleDateString()) : '-'}</td>
                <td onclick="event.stopPropagation()"><button class="btn-danger" onclick="deleteEntity(${Number(e.id)})">✕</button></td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('entitiesTableBody').innerHTML =
            '<tr><td colspan="10" class="loading-text">⚠ No entities available</td></tr>';
    }
}

function viewEntity(id) {
    const e = entitiesCache.find(x => x.id === id);
    if (!e) return;
    showDetailModal(`👾 Entity: ${e.entity_name}`, [
        ['Name', e.entity_name],
        ['Type', e.entity_type],
        ['Classification', e.classification],
        ['Linked Subject', e.subject_name],
        ['Linked Case', e.case_name],
        ['Threat Rating', `${e.threat_rating}/10`],
        ['Description', e.description],
        ['Created', e.created_at ? new Date(e.created_at).toLocaleString() : '-']
    ]);
}

function openEntityModal() {
    document.getElementById('modalTitle').textContent = '👾 Register New Entity';
    document.getElementById('modalBody').innerHTML = `
        <form id="entityForm" onsubmit="saveEntity(event)">
            <div class="form-group">
                <label>Entity Name *</label>
                <input type="text" id="entityName" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Entity Type *</label>
                    <select id="entityType">
                        ${['organization','faction','location','xenos_organism','chaos_entity','artifact','other'].map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Classification</label>
                    <select id="entityClassification">
                        ${['imperial','heretic','xenos','chaos','unknown'].map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="entityDescription"></textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Linked Subject ID</label>
                    <input type="number" id="entitySubjectId">
                </div>
                <div class="form-group">
                    <label>Linked Case ID</label>
                    <input type="number" id="entityCaseId">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Threat Rating (0-10)</label>
                    <input type="number" id="entityThreat" value="0" min="0" max="10">
                </div>
                <div class="form-group">
                    <label>Access Level</label>
                    <select id="entityAccess">
                        ${[1,2,3,4,5].map(l => `<option value="${l}">Level ${l}</option>`).join('')}
                    </select>
                </div>
            </div>
            <button type="submit" class="btn-submit">REGISTER ENTITY</button>
        </form>
    `;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveEntity(event) {
    event.preventDefault();
    const data = {
        entity_name: document.getElementById('entityName').value.trim(),
        entity_type: document.getElementById('entityType').value,
        classification: document.getElementById('entityClassification').value,
        description: document.getElementById('entityDescription').value.trim(),
        linked_subject_id: parseInt(document.getElementById('entitySubjectId').value) || null,
        linked_case_id: parseInt(document.getElementById('entityCaseId').value) || null,
        threat_rating: parseInt(document.getElementById('entityThreat').value) || 0,
        access_level: parseInt(document.getElementById('entityAccess').value)
    };
    try {
        await apiRequest('/entities', 'POST', data);
        closeModal();
        await loadEntities();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteEntity(id) {
    if (!confirm('⚠ Delete this entity record?')) return;
    try {
        await apiRequest(`/entities/${id}`, 'DELETE');
        await loadEntities();
    } catch (error) {
        alert(`Failed to delete: ${error.message}`);
    }
}

// ============================================================
// PERSONNEL CRUD
// ============================================================
let personnelCache = [];

async function loadPersonnel() {
    try {
        const personnelList = await apiRequest('/personnel');
        personnelCache = personnelList;
        const tbody = document.getElementById('personnelTableBody');

        if (!personnelList || personnelList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No personnel found</td></tr>';
            return;
        }

        tbody.innerHTML = personnelList.map(p => `
            <tr class="clickable-row" onclick="viewPersonnel(${Number(p.id)})">
                <td>${escapeHtml(p.id ?? '-')}</td>
                <td><strong>${escapeHtml(p.callsign || 'Unknown')}</strong></td>
                <td>${escapeHtml(p.rank || '-')}</td>
                <td>Level ${escapeHtml(p.clearance_level || 1)}</td>
                <td>${escapeHtml(p.department || '-')}</td>
                <td><span class="status-badge ${escapeHtml(p.status || 'active')}">${escapeHtml(p.status || 'active')}</span></td>
                <td>${p.created_at ? escapeHtml(new Date(p.created_at).toLocaleDateString()) : '-'}</td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-edit" onclick="togglePersonnelStatus(${Number(p.id)})">⚡</button>
                    <button class="btn-danger" onclick="deletePersonnel(${Number(p.id)})">✕</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('personnelTableBody').innerHTML =
            '<tr><td colspan="8" class="loading-text">⛔ Insufficient clearance</td></tr>';
    }
}

function viewPersonnel(id) {
    const p = personnelCache.find(x => x.id === id);
    if (!p) return;
    showDetailModal(`👤 Personnel: ${p.callsign}`, [
        ['Callsign', p.callsign],
        ['Rank', p.rank],
        ['Clearance Level', p.clearance_level],
        ['Department', p.department],
        ['Status', p.status],
        ['Created', p.created_at ? new Date(p.created_at).toLocaleString() : '-']
    ]);
}

function openPersonnelModal() {
    document.getElementById('modalTitle').textContent = '👤 Create New Personnel';
    document.getElementById('modalBody').innerHTML = `
        <form id="personnelForm" onsubmit="savePersonnel(event)">
            <div class="form-group">
                <label>Callsign *</label>
                <input type="text" id="personnelCallsign" required>
            </div>
            <div class="form-group">
                <label>Password *</label>
                <input type="password" id="personnelPassword" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Rank</label>
                    <select id="personnelRank">
                        ${['Adeptus_Scribe','Acolyte','Interrogator','Inquisitor','Inquisitor_Lord'].map(r => `<option value="${r}">${r}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Clearance Level</label>
                    <select id="personnelClearance">
                        ${[1,2,3,4,5].map(l => `<option value="${l}">Level ${l}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Department</label>
                <select id="personnelDept">
                    ${['Administratum','Ordo_Hereticus','Ordo_Malleus','Ordo_Xenos','Astra_Militarum'].map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
            </div>
            <button type="submit" class="btn-submit">CREATE PERSONNEL</button>
        </form>
    `;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function savePersonnel(event) {
    event.preventDefault();
    const data = {
        callsign: document.getElementById('personnelCallsign').value.trim(),
        password: document.getElementById('personnelPassword').value,
        rank: document.getElementById('personnelRank').value,
        clearance_level: parseInt(document.getElementById('personnelClearance').value),
        department: document.getElementById('personnelDept').value
    };
    try {
        await apiRequest('/personnel', 'POST', data);
        closeModal();
        await loadPersonnel();
        await loadDashboard();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function togglePersonnelStatus(id) {
    if (!confirm('Toggle active/inactive status for this operative?')) return;
    try {
        await apiRequest(`/personnel/${id}/toggle`, 'PUT');
        await loadPersonnel();
        await loadDashboard();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deletePersonnel(id) {
    if (!confirm('⚠ Permanently purge this operative from the roster?')) return;
    try {
        await apiRequest(`/personnel/${id}`, 'DELETE');
        await loadPersonnel();
        await loadDashboard();
    } catch (error) {
        alert(`Failed to delete: ${error.message}`);
    }
}

// ============================================================
// LOGS
// ============================================================
async function loadLogs() {
    try {
        const logs = await apiRequest('/logs');
        const tbody = document.getElementById('logsTableBody');

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading-text">No logs available</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>${escapeHtml(l.id ?? '-')}</td>
                <td>${l.timestamp ? escapeHtml(new Date(l.timestamp).toLocaleString()) : '-'}</td>
                <td>${escapeHtml(l.actor_name || 'System')}</td>
                <td>${escapeHtml(l.action || '-')}</td>
                <td>${escapeHtml(l.target_type || '-')}</td>
                <td>${escapeHtml(l.target_id || '-')}</td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('logsTableBody').innerHTML =
            '<tr><td colspan="6" class="loading-text">⛔ Insufficient clearance</td></tr>';
    }
}

// ============================================================
// MODAL HELPERS
// ============================================================
function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('modalBody').innerHTML = '';
}

document.getElementById('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
});

// ============================================================
// INITIAL LOAD — try to restore session on page load/refresh
// ============================================================
restoreSession();