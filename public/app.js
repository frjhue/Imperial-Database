// ============================================================
// IMPERIAL INQUISITION DATABASE - FRONTEND APPLICATION
// ============================================================
const API_BASE = window.location.origin;
let currentUser = null;
let authToken = null;
let currentModalCallback = null;

// ============================================================
// API HELPERS
// ============================================================
async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_BASE}/api${endpoint}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Request failed');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
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
        const response = await fetch(`${API_BASE}/api/auth/login`, {
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
        
        // Show main app
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'block';
        
        // Update user display
        document.getElementById('userDisplay').textContent = `${currentUser.rank} ${currentUser.callsign}`;
        document.getElementById('userDept').textContent = `Department: ${currentUser.department} • Clearance: Level ${currentUser.clearance_level}`;
        
        // Load data
        loadDashboard();
        loadSubjects();
        loadCases();
        loadReports();
        loadEvidence();
        loadEntities();
        loadPersonnel();
        loadLogs();
        loadCaseFilter();
        
    } catch (error) {
        errorEl.textContent = '⚠ Connection error. Check cogitator link.';
        errorEl.style.display = 'block';
    }
}

async function handleLogout() {
    try {
        await apiRequest('/auth/logout', 'POST');
    } catch (e) {
        // Ignore errors on logout
    }
    
    authToken = null;
    currentUser = null;
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
        
        // Refresh data when switching tabs
        switch(tabId) {
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
// SUBJECTS CRUD
// ============================================================
async function loadSubjects() {
    try {
        const subjects = await apiRequest('/subjects');
        const tbody = document.getElementById('subjectsTableBody');
        
        if (subjects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No subjects found in database</td></tr>';
            return;
        }
        
        tbody.innerHTML = subjects.map(s => `
            <tr>
                <td>${s.id}</td>
                <td><strong>${s.designation}</strong></td>
                <td><span class="status-badge ${s.classification}">${s.classification}</span></td>
                <td>${s.planet_of_origin || '-'}</td>
                <td><span class="status-badge ${s.loyalty_status}">${s.loyalty_status || 'unknown'}</span></td>
                <td>${s.notes ? s.notes.substring(0, 50) + (s.notes.length > 50 ? '...' : '') : '-'}</td>
                <td>${new Date(s.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn-edit" onclick="editSubject(${s.id})">✎</button>
                    <button class="btn-danger" onclick="deleteSubject(${s.id})">✕</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('subjectsTableBody').innerHTML = 
            '<tr><td colspan="8" class="loading-text">⚠ Error loading subjects</td></tr>';
    }
}

function openSubjectModal(data = null) {
    const isEdit = data !== null;
    const title = isEdit ? '✎ Edit Subject' : '➕ New Subject';
    
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = `
        <form id="subjectForm" onsubmit="saveSubject(event, ${isEdit ? data.id : 'null'})">
            <div class="form-group">
                <label>Designation *</label>
                <input type="text" id="subjDesignation" value="${isEdit ? data.designation : ''}" required>
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
                    <input type="text" id="subjPlanet" value="${isEdit ? data.planet_of_origin || '' : ''}">
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
            <div class="form-group">
                <label>Notes</label>
                <textarea id="subjNotes">${isEdit ? data.notes || '' : ''}</textarea>
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
        notes: document.getElementById('subjNotes').value.trim()
    };
    
    try {
        if (id) {
            await apiRequest(`/subjects/${id}`, 'PUT', data);
        } else {
            await apiRequest('/subjects', 'POST', data);
        }
        closeModal();
        loadSubjects();
        loadDashboard();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function editSubject(id) {
    try {
        const subjects = await apiRequest('/subjects');
        const subject = subjects.find(s => s.id === id);
        if (subject) openSubjectModal(subject);
    } catch (error) {
        alert('Failed to load subject data');
    }
}

async function deleteSubject(id) {
    if (!confirm('⚠ Purge this subject from the database? This action cannot be undone.')) return;
    
    try {
        await apiRequest(`/subjects/${id}`, 'DELETE');
        loadSubjects();
        loadDashboard();
    } catch (error) {
        alert(`Failed to delete: ${error.message}`);
    }
}

function filterSubjects() {
    const search = document.getElementById('subjectSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#subjectsTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

// ============================================================
// CASES CRUD
// ============================================================
async function loadCases() {
    try {
        const cases = await apiRequest('/casefiles');
        const tbody = document.getElementById('casesTableBody');
        
        if (cases.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading-text">No casefiles found</td></tr>';
            return;
        }
        
        tbody.innerHTML = cases.map(c => `
            <tr>
                <td>${c.id}</td>
                <td><strong>${c.designation}</strong></td>
                <td><span class="status-badge ${c.threat_level}">${c.threat_level}</span></td>
                <td><span class="status-badge ${c.status}">${c.status}</span></td>
                <td>${c.assigned_officer_name || 'Unassigned'}</td>
                <td>${c.subject_count || 0}</td>
                <td>${c.report_count || 0}</td>
                <td>${c.summary ? c.summary.substring(0, 40) + (c.summary.length > 40 ? '...' : '') : '-'}</td>
                <td>${new Date(c.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn-edit" onclick="editCase(${c.id})">✎</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('casesTableBody').innerHTML = 
            '<tr><td colspan="10" class="loading-text">⚠ Error loading cases</td></tr>';
    }
}

function openCaseModal(data = null) {
    const isEdit = data !== null;
    const title = isEdit ? '✎ Edit Case' : '📁 New Case';
    
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = `
        <form id="caseForm" onsubmit="saveCase(event, ${isEdit ? data.id : 'null'})">
            <div class="form-group">
                <label>Case Designation *</label>
                <input type="text" id="caseDesignation" value="${isEdit ? data.designation : ''}" required>
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
                <input type="number" id="caseOfficer" value="${isEdit ? data.assigned_officer || '' : ''}">
            </div>
            <div class="form-group">
                <label>Summary</label>
                <textarea id="caseSummary">${isEdit ? data.summary || '' : ''}</textarea>
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
        if (id) {
            await apiRequest(`/casefiles/${id}`, 'PUT', data);
        } else {
            await apiRequest('/casefiles', 'POST', data);
        }
        closeModal();
        loadCases();
        loadDashboard();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function editCase(id) {
    try {
        const cases = await apiRequest('/casefiles');
        const casefile = cases.find(c => c.id === id);
        if (casefile) openCaseModal(casefile);
    } catch (error) {
        alert('Failed to load case data');
    }
}

// ============================================================
// REPORTS CRUD
// ============================================================
async function loadReports() {
    try {
        const caseFilter = document.getElementById('reportCaseFilter').value;
        const url = caseFilter ? `/reports?case_id=${caseFilter}` : '/reports';
        const reports = await apiRequest(url);
        const tbody = document.getElementById('reportsTableBody');
        
        if (reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No reports filed</td></tr>';
            return;
        }
        
        tbody.innerHTML = reports.map(r => `
            <tr>
                <td>${r.id}</td>
                <td>${r.case_designation || r.case_id}</td>
                <td>${r.author_name || 'Unknown'}</td>
                <td>${r.content ? r.content.substring(0, 60) + (r.content.length > 60 ? '...' : '') : '-'}</td>
                <td><span class="status-badge ${r.classification}">${r.classification}</span></td>
                <td>Level ${r.access_level}</td>
                <td>${new Date(r.created_at).toLocaleDateString()}</td>
                <td><button class="btn-danger" onclick="deleteReport(${r.id})">✕</button></td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('reportsTableBody').innerHTML = 
            '<tr><td colspan="8" class="loading-text">⚠ Error loading reports</td></tr>';
    }
}

async function loadCaseFilter() {
    try {
        const cases = await apiRequest('/casefiles');
        const select = document.getElementById('reportCaseFilter');
        select.innerHTML = '<option value="">All Cases</option>' + 
            cases.map(c => `<option value="${c.id}">${c.designation}</option>`).join('');
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
                        ${['restricted','confidential','secret','top_secret'].map(c => 
                            `<option value="${c}">${c}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Access Level</label>
                    <select id="reportAccess">
                        ${[1,2,3,4,5].map(l => 
                            `<option value="${l}">Level ${l}</option>`
                        ).join('')}
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
        loadReports();
        loadDashboard();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteReport(id) {
    // Note: DELETE endpoint not implemented in server, but we can add it
    alert('Report deletion requires admin approval. Contact your Inquisitor.');
}

// ============================================================
// EVIDENCE CRUD
// ============================================================
async function loadEvidence() {
    try {
        const evidence = await apiRequest('/evidence');
        const tbody = document.getElementById('evidenceTableBody');
        
        if (evidence.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No evidence records</td></tr>';
            return;
        }
        
        tbody.innerHTML = evidence.map(e => `
            <tr>
                <td>${e.id}</td>
                <td>${e.case_designation || e.case_id}</td>
                <td>${e.file_name}</td>
                <td>${e.evidence_type || '-'}</td>
                <td>${e.uploaded_by_name || 'Unknown'}</td>
                <td>Level ${e.access_level}</td>
                <td>${new Date(e.created_at).toLocaleDateString()}</td>
                <td><button class="btn-danger" onclick="deleteEvidence(${e.id})">✕</button></td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('evidenceTableBody').innerHTML = 
            '<tr><td colspan="8" class="loading-text">⚠ Error loading evidence</td></tr>';
    }
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
                        ${['document','image','audio','video','artifact','data_slate','other'].map(t => 
                            `<option value="${t}">${t}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Access Level</label>
                    <select id="evidenceAccess">
                        ${[1,2,3,4,5].map(l => 
                            `<option value="${l}">Level ${l}</option>`
                        ).join('')}
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
        loadEvidence();
        loadDashboard();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteEvidence(id) {
    if (!confirm('Delete this evidence record?')) return;
    // DELETE endpoint would need to be added to server
    alert('Evidence deletion requires Inquisitor approval.');
}

// ============================================================
// ENTITIES CRUD
// ============================================================
async function loadEntities() {
    try {
        const entities = await apiRequest('/entities');
        const tbody = document.getElementById('entitiesTableBody');
        
        if (entities.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading-text">No entities registered</td></tr>';
            return;
        }
        
        tbody.innerHTML = entities.map(e => `
            <tr>
                <td>${e.id}</td>
                <td><strong>${e.entity_name}</strong></td>
                <td>${e.entity_type}</td>
                <td><span class="status-badge ${e.classification}">${e.classification}</span></td>
                <td>${e.subject_name || '-'}</td>
                <td>${e.case_name || '-'}</td>
                <td><span style="color: ${e.threat_rating >= 8 ? 'var(--terminal-red)' : e.threat_rating >= 5 ? 'var(--terminal-amber)' : 'var(--terminal-green)'}">${e.threat_rating}/10</span></td>
                <td>${e.description ? e.description.substring(0, 30) + (e.description.length > 30 ? '...' : '') : '-'}</td>
                <td>${new Date(e.created_at).toLocaleDateString()}</td>
                <td><button class="btn-danger" onclick="deleteEntity(${e.id})">✕</button></td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('entitiesTableBody').innerHTML = 
            '<tr><td colspan="10" class="loading-text">⚠ Error loading entities</td></tr>';
    }
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
                        ${['organization','faction','location','xenos_organism','chaos_entity','artifact','other'].map(t => 
                            `<option value="${t}">${t}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Classification</label>
                    <select id="entityClassification">
                        ${['imperial','heretic','xenos','chaos','unknown'].map(c => 
                            `<option value="${c}">${c}</option>`
                        ).join('')}
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
                        ${[1,2,3,4,5].map(l => 
                            `<option value="${l}">Level ${l}</option>`
                        ).join('')}
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
        loadEntities();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteEntity(id) {
    if (!confirm('Delete this entity from the database?')) return;
    // DELETE endpoint would need to be added
    alert('Entity deletion requires high-level clearance.');
}

// ============================================================
// PERSONNEL CRUD
// ============================================================
async function loadPersonnel() {
    try {
        const personnel = await apiRequest('/personnel');
        const tbody = document.getElementById('personnelTableBody');
        
        if (personnel.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No personnel records</td></tr>';
            return;
        }
        
        tbody.innerHTML = personnel.map(p => `
            <tr>
                <td>${p.id}</td>
                <td><strong>${p.callsign}</strong></td>
                <td>${p.rank}</td>
                <td>Level ${p.clearance_level}</td>
                <td>${p.department}</td>
                <td><span class="status-badge ${p.status}">${p.status}</span></td>
                <td>${new Date(p.created_at).toLocaleDateString()}</td>
                <td><button class="btn-danger" onclick="togglePersonnelStatus(${p.id})">⚡</button></td>
            </tr>
        `).join('');
    } catch (error) {
        if (error.message.includes('403')) {
            document.getElementById('personnelTableBody').innerHTML = 
                '<tr><td colspan="8" class="loading-text">⛔ Insufficient clearance to view personnel</td></tr>';
        } else {
            document.getElementById('personnelTableBody').innerHTML = 
                '<tr><td colspan="8" class="loading-text">⚠ Error loading personnel</td></tr>';
        }
    }
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
                        ${['Adeptus_Scribe','Acolyte','Interrogator','Inquisitor','Inquisitor_Lord'].map(r => 
                            `<option value="${r}">${r}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Clearance Level</label>
                    <select id="personnelClearance">
                        ${[1,2,3,4,5].map(l => 
                            `<option value="${l}">Level ${l}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Department</label>
                <select id="personnelDept">
                    ${['Administratum','Ordo_Hereticus','Ordo_Malleus','Ordo_Xenos','Astra_Militarum'].map(d => 
                        `<option value="${d}">${d}</option>`
                    ).join('')}
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
        loadPersonnel();
        loadDashboard();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function togglePersonnelStatus(id) {
    // Would need a PATCH endpoint
    alert('Personnel status management requires Ordo Hereticus oversight.');
}

// ============================================================
// LOGS
// ============================================================
async function loadLogs() {
    try {
        const logs = await apiRequest('/logs');
        const tbody = document.getElementById('logsTableBody');
        
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading-text">No audit logs available</td></tr>';
            return;
        }
        
        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>${l.id}</td>
                <td>${new Date(l.timestamp).toLocaleString()}</td>
                <td>${l.actor_name || 'System'}</td>
                <td>${l.action}</td>
                <td>${l.target_type || '-'}</td>
                <td>${l.target_id || '-'}</td>
            </tr>
        `).join('');
    } catch (error) {
        if (error.message.includes('403')) {
            document.getElementById('logsTableBody').innerHTML = 
                '<tr><td colspan="6" class="loading-text">⛔ Insufficient clearance to view logs</td></tr>';
        } else {
            document.getElementById('logsTableBody').innerHTML = 
                '<tr><td colspan="6" class="loading-text">⚠ Error loading logs</td></tr>';
        }
    }
}

// ============================================================
// MODAL HELPERS
// ============================================================
function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('modalBody').innerHTML = '';
}

// Close modal on overlay click
document.getElementById('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', function(e) {
    // Escape to close modal
    if (e.key === 'Escape') closeModal();
    
    // Ctrl+Enter to submit forms
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        const form = document.querySelector('#modalBody form');
        if (form) {
            const submitBtn = form.querySelector('[type="submit"]');
            if (submitBtn) submitBtn.click();
        }
    }
});

// ============================================================
// AUTO-LOGIN FOR DEVELOPMENT (remove in production)
// ============================================================
// Uncomment below for development convenience
// setTimeout(() => {
//     if (document.getElementById('loginScreen').style.display !== 'none') {
//         handleLogin();
//     }
// }, 500);