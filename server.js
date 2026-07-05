require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'the_emperor_protects_forever_2024';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));

function logAction(action, user = 'System', details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${action} | User: ${user} | ${details}`);
    logs.unshift({
        id: logIdCounter++,
        timestamp,
        actor_name: user,
        action,
        target_type: null,
        target_id: null
    });
}

// ============================================================
// IN-MEMORY DATA STORE (persists for the life of the process)
// ============================================================
let subjects = [
    { id: 1, designation: 'Kryptman', classification: 'inquisitor', planet_of_origin: 'Armageddon', loyalty_status: 'excommunicated', notes: 'Former Inquisitor Lord. Created the Kryptman Doctrine.', created_at: new Date().toISOString() },
    { id: 2, designation: 'Ahriman', classification: 'heretic', planet_of_origin: 'Prospero', loyalty_status: 'heretic', notes: 'Exiled Thousand Sons Sorcerer. Alpha-level psyker.', created_at: new Date().toISOString() },
    { id: 3, designation: 'Eisenhorn', classification: 'inquisitor', planet_of_origin: 'Helican_Subsector', loyalty_status: 'renegade', notes: 'Radical Inquisitor. Known for using daemonhosts.', created_at: new Date().toISOString() }
];
let subjectIdCounter = 4;

let casefiles = [
    { id: 1, designation: 'Case_Omega_Kryptman', threat_level: 'existential', status: 'open', assigned_officer: 999, assigned_officer_name: 'God_Emperor', subject_count: 1, report_count: 3, summary: 'Tracking Inquisitor Kryptman in the Octarius Sector.', created_at: new Date().toISOString() },
    { id: 2, designation: 'Case_Ahriman_Seeking', threat_level: 'alpha', status: 'open', assigned_officer: 999, assigned_officer_name: 'God_Emperor', subject_count: 1, report_count: 2, summary: "Investigation into Ahriman's search for the Black Library.", created_at: new Date().toISOString() }
];
let caseIdCounter = 3;

let reports = [
    { id: 1, case_id: 1, case_designation: 'Case_Omega_Kryptman', author_name: 'God_Emperor', content: 'Kryptman spotted in Octarius Sector. Grey Knights dispatched.', classification: 'top_secret', access_level: 999, created_at: new Date().toISOString() }
];
let reportIdCounter = 2;

let evidence = [
    { id: 1, case_id: 1, case_designation: 'Case_Omega_Kryptman', file_name: 'kryptman_sighting.log', evidence_type: 'document', uploaded_by_name: 'God_Emperor', access_level: 999, created_at: new Date().toISOString() }
];
let evidenceIdCounter = 2;

let entities = [
    { id: 1, entity_name: 'Hive_Fleet_Leviathan', entity_type: 'xenos_organism', classification: 'xenos', subject_name: null, case_name: null, threat_rating: 10, description: 'Largest known Tyranid Hive Fleet. Approaching the Octarius Sector.', created_at: new Date().toISOString() }
];
let entityIdCounter = 2;

let personnel = [
    { id: 999, callsign: 'God_Emperor', rank: 'God_Emperor', clearance_level: 999, department: 'Imperial_Palace', status: 'active', created_at: new Date().toISOString() }
];
let personnelIdCounter = 1000;

let logs = [];
let logIdCounter = 1;

// ============================================================
// AUTH
// ============================================================
const authenticate = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        logAction('AUTH_FAILED', 'Unknown', 'No token provided');
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        logAction('AUTH_FAILED', 'Unknown', 'Invalid token');
        return res.status(401).json({ error: 'Invalid token' });
    }
};

app.post('/api/auth/login', (req, res) => {
    const { callsign, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    logAction('LOGIN_ATTEMPT', callsign, `IP: ${ip}`);

    if (callsign === 'God_Emperor' && password === 'Ksusa') {
        const token = jwt.sign(
            { id: 999, callsign: 'God_Emperor', rank: 'God_Emperor', clearance: 999 },
            JWT_SECRET,
            { expiresIn: '9999h' }
        );

        logAction('LOGIN_SUCCESS', 'God_Emperor', `IP: ${ip} | Clearance: 999`);

        return res.json({
            token,
            user: {
                id: 999,
                callsign: 'God_Emperor',
                rank: 'God_Emperor',
                clearance_level: 999,
                department: 'Imperial_Palace'
            }
        });
    }

    logAction('LOGIN_FAILED', callsign, `IP: ${ip} | Invalid credentials`);
    return res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/auth/verify', authenticate, (req, res) => {
    res.json({
        user: {
            id: 999,
            callsign: 'God_Emperor',
            rank: 'God_Emperor',
            clearance_level: 999,
            department: 'Imperial_Palace'
        }
    });
});

app.post('/api/auth/logout', authenticate, (req, res) => {
    logAction('LOGOUT', req.user.callsign, 'User logged out');
    res.json({ message: 'Logged out successfully' });
});

// ============================================================
// DASHBOARD
// ============================================================
app.get('/api/dashboard/stats', authenticate, (req, res) => {
    logAction('VIEW_DASHBOARD', req.user.callsign, 'Stats requested');
    res.json({
        total_subjects: subjects.length,
        open_cases: casefiles.filter(c => c.status === 'open').length,
        total_cases: casefiles.length,
        total_reports: reports.length,
        total_evidence: evidence.length,
        active_personnel: personnel.filter(p => p.status === 'active').length
    });
});

// ============================================================
// SUBJECTS CRUD
// ============================================================
app.get('/api/subjects', authenticate, (req, res) => {
    logAction('VIEW_SUBJECTS', req.user.callsign, 'List requested');
    res.json(subjects);
});

app.get('/api/subjects/:id', authenticate, (req, res) => {
    const subject = subjects.find(s => s.id === parseInt(req.params.id));
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    logAction('VIEW_SUBJECT', req.user.callsign, `ID: ${req.params.id}`);
    res.json(subject);
});

app.post('/api/subjects', authenticate, (req, res) => {
    const { designation, classification, planet_of_origin, loyalty_status, notes } = req.body;
    const newSubject = {
        id: subjectIdCounter++,
        designation, classification, planet_of_origin, loyalty_status, notes,
        created_at: new Date().toISOString()
    };
    subjects.push(newSubject);
    logAction('CREATE_SUBJECT', req.user.callsign, `Designation: ${designation}`);
    res.status(201).json(newSubject);
});

app.put('/api/subjects/:id', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    const idx = subjects.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Subject not found' });

    const { designation, classification, planet_of_origin, loyalty_status, notes } = req.body;
    subjects[idx] = { ...subjects[idx], designation, classification, planet_of_origin, loyalty_status, notes, updated_at: new Date().toISOString() };
    logAction('UPDATE_SUBJECT', req.user.callsign, `ID: ${id}`);
    res.json(subjects[idx]);
});

app.delete('/api/subjects/:id', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    const idx = subjects.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Subject not found' });

    subjects.splice(idx, 1);
    logAction('DELETE_SUBJECT', req.user.callsign, `ID: ${id}`);
    res.json({ message: `Subject ${id} purged` });
});

// ============================================================
// CASEFILES CRUD
// ============================================================
app.get('/api/casefiles', authenticate, (req, res) => {
    logAction('VIEW_CASES', req.user.callsign, 'List requested');
    res.json(casefiles);
});

app.get('/api/casefiles/:id', authenticate, (req, res) => {
    const casefile = casefiles.find(c => c.id === parseInt(req.params.id));
    if (!casefile) return res.status(404).json({ error: 'Case not found' });
    logAction('VIEW_CASE', req.user.callsign, `ID: ${req.params.id}`);
    res.json(casefile);
});

app.post('/api/casefiles', authenticate, (req, res) => {
    const { designation, threat_level, status, assigned_officer, summary } = req.body;
    const newCase = {
        id: caseIdCounter++,
        designation, threat_level, status,
        assigned_officer: assigned_officer || 999,
        assigned_officer_name: 'God_Emperor',
        subject_count: 0,
        report_count: 0,
        summary,
        created_at: new Date().toISOString()
    };
    casefiles.push(newCase);
    logAction('CREATE_CASE', req.user.callsign, `Designation: ${designation}`);
    res.status(201).json(newCase);
});

app.put('/api/casefiles/:id', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    const idx = casefiles.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Case not found' });

    const { designation, threat_level, status, assigned_officer, summary } = req.body;
    casefiles[idx] = { ...casefiles[idx], designation, threat_level, status, assigned_officer, summary, updated_at: new Date().toISOString() };
    logAction('UPDATE_CASE', req.user.callsign, `ID: ${id}`);
    res.json(casefiles[idx]);
});

app.delete('/api/casefiles/:id', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    const idx = casefiles.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Case not found' });

    casefiles.splice(idx, 1);
    logAction('DELETE_CASE', req.user.callsign, `ID: ${id}`);
    res.json({ message: `Case ${id} closed and purged` });
});

// ============================================================
// REPORTS CRUD
// ============================================================
app.get('/api/reports', authenticate, (req, res) => {
    const { case_id } = req.query;
    logAction('VIEW_REPORTS', req.user.callsign, `Case ID: ${case_id || 'All'}`);
    const filtered = case_id ? reports.filter(r => r.case_id === parseInt(case_id)) : reports;
    res.json(filtered);
});

app.get('/api/reports/:id', authenticate, (req, res) => {
    const report = reports.find(r => r.id === parseInt(req.params.id));
    if (!report) return res.status(404).json({ error: 'Report not found' });
    logAction('VIEW_REPORT', req.user.callsign, `ID: ${req.params.id}`);
    res.json(report);
});

app.post('/api/reports', authenticate, (req, res) => {
    const { case_id, content, classification, access_level } = req.body;
    const parentCase = casefiles.find(c => c.id === parseInt(case_id));
    const newReport = {
        id: reportIdCounter++,
        case_id: parseInt(case_id),
        case_designation: parentCase ? parentCase.designation : `Case_${case_id}`,
        author_name: req.user.callsign,
        content, classification, access_level,
        created_at: new Date().toISOString()
    };
    reports.push(newReport);
    if (parentCase) parentCase.report_count = (parentCase.report_count || 0) + 1;
    logAction('CREATE_REPORT', req.user.callsign, `Case ID: ${case_id}`);
    res.status(201).json(newReport);
});

app.delete('/api/reports/:id', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    const idx = reports.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Report not found' });

    reports.splice(idx, 1);
    logAction('DELETE_REPORT', req.user.callsign, `ID: ${id}`);
    res.json({ message: `Report ${id} deleted` });
});

// ============================================================
// EVIDENCE CRUD
// ============================================================
app.get('/api/evidence', authenticate, (req, res) => {
    logAction('VIEW_EVIDENCE', req.user.callsign, 'List requested');
    res.json(evidence);
});

app.get('/api/evidence/:id', authenticate, (req, res) => {
    const item = evidence.find(e => e.id === parseInt(req.params.id));
    if (!item) return res.status(404).json({ error: 'Evidence not found' });
    logAction('VIEW_EVIDENCE_ITEM', req.user.callsign, `ID: ${req.params.id}`);
    res.json(item);
});

app.post('/api/evidence', authenticate, (req, res) => {
    const { case_id, file_name, storage_path, evidence_type, access_level } = req.body;
    const parentCase = casefiles.find(c => c.id === parseInt(case_id));
    const newEvidence = {
        id: evidenceIdCounter++,
        case_id: parseInt(case_id),
        case_designation: parentCase ? parentCase.designation : `Case_${case_id}`,
        file_name, storage_path, evidence_type,
        uploaded_by_name: req.user.callsign,
        access_level,
        created_at: new Date().toISOString()
    };
    evidence.push(newEvidence);
    logAction('UPLOAD_EVIDENCE', req.user.callsign, `File: ${file_name}`);
    res.status(201).json(newEvidence);
});

app.delete('/api/evidence/:id', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    const idx = evidence.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Evidence not found' });

    evidence.splice(idx, 1);
    logAction('DELETE_EVIDENCE', req.user.callsign, `ID: ${id}`);
    res.json({ message: `Evidence ${id} deleted` });
});

// ============================================================
// ENTITIES CRUD
// ============================================================
app.get('/api/entities', authenticate, (req, res) => {
    logAction('VIEW_ENTITIES', req.user.callsign, 'List requested');
    res.json(entities);
});

app.get('/api/entities/:id', authenticate, (req, res) => {
    const entity = entities.find(e => e.id === parseInt(req.params.id));
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    logAction('VIEW_ENTITY', req.user.callsign, `ID: ${req.params.id}`);
    res.json(entity);
});

app.post('/api/entities', authenticate, (req, res) => {
    const { entity_name, entity_type, classification, description, linked_subject_id, linked_case_id, threat_rating, access_level } = req.body;
    const linkedSubject = subjects.find(s => s.id === linked_subject_id);
    const linkedCase = casefiles.find(c => c.id === linked_case_id);
    const newEntity = {
        id: entityIdCounter++,
        entity_name, entity_type, classification, description,
        subject_name: linkedSubject ? linkedSubject.designation : null,
        case_name: linkedCase ? linkedCase.designation : null,
        threat_rating, access_level,
        created_at: new Date().toISOString()
    };
    entities.push(newEntity);
    logAction('CREATE_ENTITY', req.user.callsign, `Name: ${entity_name}`);
    res.status(201).json(newEntity);
});

app.delete('/api/entities/:id', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    const idx = entities.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Entity not found' });

    entities.splice(idx, 1);
    logAction('DELETE_ENTITY', req.user.callsign, `ID: ${id}`);
    res.json({ message: `Entity ${id} deleted` });
});

// ============================================================
// PERSONNEL CRUD
// ============================================================
app.get('/api/personnel', authenticate, (req, res) => {
    logAction('VIEW_PERSONNEL', req.user.callsign, 'List requested');
    res.json(personnel);
});

app.get('/api/personnel/:id', authenticate, (req, res) => {
    const person = personnel.find(p => p.id === parseInt(req.params.id));
    if (!person) return res.status(404).json({ error: 'Personnel not found' });
    res.json(person);
});

app.post('/api/personnel', authenticate, (req, res) => {
    const { callsign, rank, clearance_level, department } = req.body;
    const newPersonnel = {
        id: personnelIdCounter++,
        callsign, rank, clearance_level, department,
        status: 'active',
        created_at: new Date().toISOString()
    };
    personnel.push(newPersonnel);
    logAction('CREATE_PERSONNEL', req.user.callsign, `Callsign: ${callsign}`);
    res.status(201).json(newPersonnel);
});

app.put('/api/personnel/:id/toggle', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    const person = personnel.find(p => p.id === id);
    if (!person) return res.status(404).json({ error: 'Personnel not found' });

    person.status = person.status === 'active' ? 'inactive' : 'active';
    logAction('TOGGLE_PERSONNEL', req.user.callsign, `ID: ${id} | Status: ${person.status}`);
    res.json(person);
});

// ============================================================
// LOGS
// ============================================================
app.get('/api/logs', authenticate, (req, res) => {
    res.json(logs.slice(0, 200));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ═══════════════════════════════════════════════
    IMPERIAL INQUISITION DATABASE TERMINAL
    ═══════════════════════════════════════════════
    Server: http://localhost:${PORT}
    Super Admin: God_Emperor
    ═══════════════════════════════════════════════
    `);
});