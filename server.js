cat > /root/imperial-backend/server.js << 'EOF'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'the_emperor_protects_forever_2024';

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.static('public'));

function logAction(action, user = 'System', details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${action} | User: ${user} | ${details}`);
}

const GOD_EMPEROR = {
    id: 999,
    callsign: 'God_Emperor',
    password: 'Ksusa',
    rank: 'God_Emperor',
    clearance_level: 999,
    department: 'Imperial_Palace'
};

const authenticate = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        logAction('AUTH_FAILED', 'Unknown', 'No token provided');
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (decoded.callsign === 'God_Emperor' || decoded.id === 999) {
            req.user = decoded;
            logAction('AUTH_SUCCESS', decoded.callsign, 'Token verified');
            return next();
        }
        
        req.user = decoded;
        logAction('AUTH_SUCCESS', decoded.callsign, 'Token verified');
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

app.post('/api/auth/logout', authenticate, (req, res) => {
    logAction('LOGOUT', req.user.callsign, 'User logged out');
    res.json({ message: 'Logged out successfully' });
});

app.get('/api/dashboard/stats', authenticate, (req, res) => {
    logAction('VIEW_DASHBOARD', req.user.callsign, 'Stats requested');
    res.json({
        total_subjects: 42,
        open_cases: 13,
        total_cases: 69,
        total_reports: 128,
        total_evidence: 256,
        active_personnel: 7
    });
});

app.get('/api/subjects', authenticate, (req, res) => {
    logAction('VIEW_SUBJECTS', req.user.callsign, 'List requested');
    res.json([
        { id: 1, designation: 'Kryptman', classification: 'Inquisitor', planet_of_origin: 'Armageddon', loyalty_status: 'excommunicated', notes: 'Former Inquisitor Lord. Created the Kryptman Doctrine.', created_at: new Date().toISOString() },
        { id: 2, designation: 'Ahriman', classification: 'Chaos_Sorcerer', planet_of_origin: 'Prospero', loyalty_status: 'heretic', notes: 'Exiled Thousand Sons Sorcerer. Alpha-level psyker.', created_at: new Date().toISOString() },
        { id: 3, designation: 'Eisenhorn', classification: 'Inquisitor', planet_of_origin: 'Helican_Subsector', loyalty_status: 'renegade', notes: 'Radical Inquisitor. Known for using daemonhosts.', created_at: new Date().toISOString() }
    ]);
});

app.post('/api/subjects', authenticate, (req, res) => {
    const { designation, classification, planet_of_origin, loyalty_status, notes } = req.body;
    logAction('CREATE_SUBJECT', req.user.callsign, `Designation: ${designation} | Classification: ${classification}`);
    res.status(201).json({ 
        id: Math.floor(Math.random() * 1000), 
        designation, 
        classification, 
        planet_of_origin, 
        loyalty_status, 
        notes, 
        created_at: new Date().toISOString() 
    });
});

app.put('/api/subjects/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const { designation, classification, planet_of_origin, loyalty_status, notes } = req.body;
    logAction('UPDATE_SUBJECT', req.user.callsign, `ID: ${id} | Designation: ${designation}`);
    res.json({ 
        id: parseInt(id), 
        designation, 
        classification, 
        planet_of_origin, 
        loyalty_status, 
        notes, 
        updated_at: new Date().toISOString() 
    });
});

app.delete('/api/subjects/:id', authenticate, (req, res) => {
    const { id } = req.params;
    logAction('DELETE_SUBJECT', req.user.callsign, `ID: ${id}`);
    res.json({ message: `Subject ${id} purged` });
});

app.get('/api/casefiles', authenticate, (req, res) => {
    logAction('VIEW_CASES', req.user.callsign, 'List requested');
    res.json([
        { id: 1, designation: 'Case_Omega_Kryptman', threat_level: 'existential', status: 'active', assigned_officer_name: 'God_Emperor', subject_count: 1, report_count: 3, summary: 'Tracking Inquisitor Kryptman in the Octarius Sector.', created_at: new Date().toISOString() },
        { id: 2, designation: 'Case_Ahriman_Seeking', threat_level: 'alpha', status: 'active', assigned_officer_name: 'God_Emperor', subject_count: 1, report_count: 2, summary: 'Investigation into Ahriman\'s search for the Black Library.', created_at: new Date().toISOString() }
    ]);
});

app.post('/api/casefiles', authenticate, (req, res) => {
    const { designation, threat_level, status, assigned_officer, summary } = req.body;
    logAction('CREATE_CASE', req.user.callsign, `Designation: ${designation} | Threat: ${threat_level}`);
    res.status(201).json({ 
        id: Math.floor(Math.random() * 1000), 
        designation, 
        threat_level, 
        status, 
        assigned_officer_name: 'God_Emperor',
        subject_count: 0,
        report_count: 0,
        summary, 
        created_at: new Date().toISOString() 
    });
});

app.put('/api/casefiles/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const { designation, threat_level, status, assigned_officer, summary } = req.body;
    logAction('UPDATE_CASE', req.user.callsign, `ID: ${id} | Designation: ${designation}`);
    res.json({ 
        id: parseInt(id), 
        designation, 
        threat_level, 
        status, 
        assigned_officer, 
        summary, 
        updated_at: new Date().toISOString() 
    });
});

app.get('/api/reports', authenticate, (req, res) => {
    const { case_id } = req.query;
    logAction('VIEW_REPORTS', req.user.callsign, `Case ID: ${case_id || 'All'}`);
    res.json([
        { id: 1, case_id: 1, case_designation: 'Case_Omega_Kryptman', author_name: 'God_Emperor', content: 'Kryptman spotted in Octarius Sector. Grey Knights dispatched.', classification: 'top_secret', access_level: 999, created_at: new Date().toISOString() }
    ]);
});

app.post('/api/reports', authenticate, (req, res) => {
    const { case_id, content, classification, access_level } = req.body;
    logAction('CREATE_REPORT', req.user.callsign, `Case ID: ${case_id} | Classification: ${classification}`);
    res.status(201).json({ 
        id: Math.floor(Math.random() * 1000), 
        case_id, 
        case_designation: 'Case_' + case_id,
        author_name: 'God_Emperor',
        content, 
        classification, 
        access_level, 
        created_at: new Date().toISOString() 
    });
});

app.delete('/api/reports/:id', authenticate, (req, res) => {
    const { id } = req.params;
    logAction('DELETE_REPORT', req.user.callsign, `ID: ${id}`);
    res.json({ message: `Report ${id} deleted` });
});

app.get('/api/evidence', authenticate, (req, res) => {
    logAction('VIEW_EVIDENCE', req.user.callsign, 'List requested');
    res.json([
        { id: 1, case_id: 1, case_designation: 'Case_Omega_Kryptman', file_name: 'kryptman_sighting.log', evidence_type: 'document', uploaded_by_name: 'God_Emperor', access_level: 999, created_at: new Date().toISOString() }
    ]);
});

app.post('/api/evidence', authenticate, (req, res) => {
    const { case_id, file_name, storage_path, evidence_type, access_level } = req.body;
    logAction('UPLOAD_EVIDENCE', req.user.callsign, `File: ${file_name} | Type: ${evidence_type}`);
    res.status(201).json({ 
        id: Math.floor(Math.random() * 1000), 
        case_id, 
        case_designation: 'Case_' + case_id,
        file_name, 
        evidence_type, 
        uploaded_by_name: 'God_Emperor',
        access_level, 
        created_at: new Date().toISOString() 
    });
});

app.delete('/api/evidence/:id', authenticate, (req, res) => {
    const { id } = req.params;
    logAction('DELETE_EVIDENCE', req.user.callsign, `ID: ${id}`);
    res.json({ message: `Evidence ${id} deleted` });
});

app.get('/api/entities', authenticate, (req, res) => {
    logAction('VIEW_ENTITIES', req.user.callsign, 'List requested');
    res.json([
        { id: 1, entity_name: 'Hive_Fleet_Leviathan', entity_type: 'xenos_organism', classification: 'extreme', subject_name: null, case_name: null, threat_rating: 10, description: 'Largest known Tyranid Hive Fleet. Approaching the Octarius Sector.', created_at: new Date().toISOString() }
    ]);
});

app.post('/api/entities', authenticate, (req, res) => {
    const { entity_name, entity_type, classification, description, linked_subject_id, linked_case_id, threat_rating, access_level } = req.body;
    logAction('CREATE_ENTITY', req.user.callsign, `Name: ${entity_name} | Type: ${entity_type}`);
    res.status(201).json({ 
        id: Math.floor(Math.random() * 1000), 
        entity_name, 
        entity_type, 
        classification, 
        description, 
        threat_rating, 
        created_at: new Date().toISOString() 
    });
});

app.delete('/api/entities/:id', authenticate, (req, res) => {
    const { id } = req.params;
    logAction('DELETE_ENTITY', req.user.callsign, `ID: ${id}`);
    res.json({ message: `Entity ${id} deleted` });
});

app.get('/api/personnel', authenticate, (req, res) => {
    logAction('VIEW_PERSONNEL', req.user.callsign, 'List requested');
    res.json([
        { id: 999, callsign: 'God_Emperor', rank: 'God_Emperor', clearance_level: 999, department: 'Imperial_Palace', status: 'active', created_at: new Date().toISOString() }
    ]);
});

app.post('/api/personnel', authenticate, (req, res) => {
    const { callsign, password, rank, clearance_level, department } = req.body;
    logAction('CREATE_PERSONNEL', req.user.callsign, `Callsign: ${callsign} | Rank: ${rank}`);
    res.status(201).json({ 
        id: Math.floor(Math.random() * 1000), 
        callsign, 
        rank, 
        clearance_level, 
        department, 
        status: 'active',
        created_at: new Date().toISOString() 
    });
});

app.get('/api/logs', authenticate, (req, res) => {
    logAction('VIEW_LOGS', req.user.callsign, 'Audit log requested');
    res.json([
        { id: 1, timestamp: new Date().toISOString(), actor_name: 'God_Emperor', action: 'LOGIN', target_type: 'authentication', target_id: null },
        { id: 2, timestamp: new Date().toISOString(), actor_name: 'God_Emperor', action: 'VIEW_DASHBOARD', target_type: 'dashboard', target_id: null }
    ]);
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
    God_Emperor
    ═══════════════════════════════════════════════
    `);
});
EOF