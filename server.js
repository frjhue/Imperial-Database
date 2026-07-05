require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'the_emperor_protects_forever_2024';

// ============================================================
// DATABASE SETUP
// ============================================================
const db = new sqlite3.Database('./inquisition.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // Create tables if they don't exist
    db.serialize(() => {
        // Personnel table
        db.run(`
            CREATE TABLE IF NOT EXISTS personnel (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                callsign TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                rank TEXT,
                clearance_level INTEGER DEFAULT 1,
                department TEXT,
                status TEXT DEFAULT 'active',
                created_at DATETIME
            )
        `);

        // Subjects table
        db.run(`
            CREATE TABLE IF NOT EXISTS subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                designation TEXT,
                classification TEXT,
                planet_of_origin TEXT,
                loyalty_status TEXT,
                notes TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
        `);

        // Casefiles table
        db.run(`
            CREATE TABLE IF NOT EXISTS casefiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                designation TEXT,
                threat_level TEXT,
                status TEXT,
                assigned_officer INTEGER,
                assigned_officer_name TEXT,
                subject_count INTEGER DEFAULT 0,
                report_count INTEGER DEFAULT 0,
                summary TEXT,
                content TEXT,
                access_level INTEGER DEFAULT 1,
                created_at DATETIME,
                updated_at DATETIME,
                FOREIGN KEY (assigned_officer) REFERENCES personnel(id)
            )
        `);

        // Reports table
        db.run(`
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER,
                case_designation TEXT,
                author_name TEXT,
                content TEXT,
                classification TEXT,
                access_level INTEGER DEFAULT 1,
                created_at DATETIME,
                FOREIGN KEY (case_id) REFERENCES casefiles(id)
            )
        `);

        // Evidence table
        db.run(`
            CREATE TABLE IF NOT EXISTS evidence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER,
                case_designation TEXT,
                file_name TEXT,
                storage_path TEXT,
                evidence_type TEXT,
                uploaded_by_name TEXT,
                access_level INTEGER DEFAULT 1,
                created_at DATETIME,
                FOREIGN KEY (case_id) REFERENCES casefiles(id)
            )
        `);

        // Entities table
        db.run(`
            CREATE TABLE IF NOT EXISTS entities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_name TEXT,
                entity_type TEXT,
                classification TEXT,
                description TEXT,
                subject_name TEXT,
                case_name TEXT,
                threat_rating INTEGER,
                access_level INTEGER DEFAULT 1,
                created_at DATETIME
            )
        `);

        // Logs table
        db.run(`
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME,
                actor_name TEXT,
                action TEXT,
                target_type TEXT,
                target_id INTEGER
            )
        `);

        // Insert default God_Emperor account if not exists
        db.run(`
            INSERT OR IGNORE INTO personnel 
            (id, callsign, password, rank, clearance_level, department, status, created_at) 
            VALUES (1, 'God_Emperor', 'Ksusa', 'God_Emperor', 999, 'Imperial_Palace', 'active', datetime('now'))
        `);
    });
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// ============================================================
// LOGGING
// ============================================================
function logAction(action, user = 'System', details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${action} | User: ${user} | ${details}`);
    
    db.run(
        'INSERT INTO logs (timestamp, actor_name, action, target_type, target_id) VALUES (?, ?, ?, ?, ?)',
        [timestamp, user, action, null, null],
        (err) => {
            if (err) console.error('Error logging action:', err);
        }
    );
}

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

function requireClearance(minLevel) {
    return (req, res, next) => {
        if ((req.user.clearance_level || 0) < minLevel) {
            logAction('ACCESS_DENIED', req.user.callsign, `Required clearance: ${minLevel}`);
            return res.status(403).json({ error: `Insufficient clearance. Level ${minLevel}+ required.` });
        }
        next();
    };
}

function buildUserResponse(person) {
    return {
        id: person.id,
        callsign: person.callsign,
        rank: person.rank,
        clearance_level: person.clearance_level,
        department: person.department
    };
}

// ============================================================
// AUTH ENDPOINTS
// ============================================================
app.post('/api/auth/login', (req, res) => {
    const { callsign, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    logAction('LOGIN_ATTEMPT', callsign, `IP: ${ip}`);

    db.get(
        'SELECT * FROM personnel WHERE callsign = ? AND password = ?',
        [callsign, password],
        (err, person) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (person) {
                if (person.status !== 'active') {
                    logAction('LOGIN_FAILED', callsign, `IP: ${ip} | Account inactive`);
                    return res.status(403).json({ error: 'This account has been deactivated' });
                }

                const token = jwt.sign(
                    {
                        id: person.id,
                        callsign: person.callsign,
                        rank: person.rank,
                        clearance_level: person.clearance_level,
                        department: person.department
                    },
                    JWT_SECRET,
                    { expiresIn: '9999h' }
                );

                logAction('LOGIN_SUCCESS', person.callsign, `IP: ${ip} | Clearance: ${person.clearance_level}`);
                return res.json({ token, user: buildUserResponse(person) });
            }

            logAction('LOGIN_FAILED', callsign, `IP: ${ip} | Invalid credentials`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
    );
});

app.get('/api/auth/verify', authenticate, (req, res) => {
    db.get(
        'SELECT * FROM personnel WHERE id = ? AND status = "active"',
        [req.user.id],
        (err, person) => {
            if (err || !person) {
                return res.status(401).json({ error: 'Account no longer valid' });
            }
            res.json({ user: buildUserResponse(person) });
        }
    );
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
    
    db.get(`
        SELECT 
            (SELECT COUNT(*) FROM subjects) as total_subjects,
            (SELECT COUNT(*) FROM casefiles WHERE status = 'open') as open_cases,
            (SELECT COUNT(*) FROM casefiles) as total_cases,
            (SELECT COUNT(*) FROM reports) as total_reports,
            (SELECT COUNT(*) FROM evidence) as total_evidence,
            (SELECT COUNT(*) FROM personnel WHERE status = 'active') as active_personnel
    `, (err, stats) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(stats);
    });
});

// ============================================================
// SUBJECTS CRUD
// ============================================================
app.get('/api/subjects', authenticate, (req, res) => {
    logAction('VIEW_SUBJECTS', req.user.callsign, 'List requested');
    db.all('SELECT * FROM subjects ORDER BY id DESC', (err, subjects) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(subjects);
    });
});

app.get('/api/subjects/:id', authenticate, (req, res) => {
    db.get('SELECT * FROM subjects WHERE id = ?', [req.params.id], (err, subject) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!subject) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        logAction('VIEW_SUBJECT', req.user.callsign, `ID: ${req.params.id}`);
        res.json(subject);
    });
});

app.post('/api/subjects', authenticate, (req, res) => {
    const { designation, classification, planet_of_origin, loyalty_status, notes } = req.body;
    
    db.run(
        'INSERT INTO subjects (designation, classification, planet_of_origin, loyalty_status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [designation, classification, planet_of_origin, loyalty_status, notes, new Date().toISOString()],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            const newSubject = { id: this.lastID, designation, classification, planet_of_origin, loyalty_status, notes, created_at: new Date().toISOString() };
            logAction('CREATE_SUBJECT', req.user.callsign, `Designation: ${designation}`);
            res.status(201).json(newSubject);
        }
    );
});

app.put('/api/subjects/:id', authenticate, (req, res) => {
    const id = req.params.id;
    const { designation, classification, planet_of_origin, loyalty_status, notes } = req.body;
    
    db.run(
        'UPDATE subjects SET designation = ?, classification = ?, planet_of_origin = ?, loyalty_status = ?, notes = ?, updated_at = ? WHERE id = ?',
        [designation, classification, planet_of_origin, loyalty_status, notes, new Date().toISOString(), id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Subject not found' });
            }
            logAction('UPDATE_SUBJECT', req.user.callsign, `ID: ${id}`);
            db.get('SELECT * FROM subjects WHERE id = ?', [id], (err, subject) => {
                res.json(subject);
            });
        }
    );
});

app.delete('/api/subjects/:id', authenticate, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM subjects WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        logAction('DELETE_SUBJECT', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Subject ${id} purged` });
    });
});

// ============================================================
// CASEFILES CRUD
// ============================================================
app.get('/api/casefiles', authenticate, (req, res) => {
    logAction('VIEW_CASES', req.user.callsign, 'List requested');
    db.all('SELECT * FROM casefiles ORDER BY id DESC', (err, casefiles) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(casefiles);
    });
});

app.get('/api/casefiles/:id', authenticate, (req, res) => {
    db.get('SELECT * FROM casefiles WHERE id = ?', [req.params.id], (err, casefile) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!casefile) {
            return res.status(404).json({ error: 'Case not found' });
        }
        logAction('VIEW_CASE', req.user.callsign, `ID: ${req.params.id}`);
        
        if ((casefile.access_level || 0) > (req.user.clearance_level || 0)) {
            return res.json({ ...casefile, content: null, redacted: true });
        }
        res.json(casefile);
    });
});

app.post('/api/casefiles', authenticate, (req, res) => {
    const { designation, threat_level, status, assigned_officer, summary, content, access_level } = req.body;
    
    db.run(
        `INSERT INTO casefiles 
        (designation, threat_level, status, assigned_officer, assigned_officer_name, subject_count, report_count, summary, content, access_level, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [designation, threat_level, status, assigned_officer || req.user.id, req.user.callsign, 0, 0, summary, content || '', access_level || 1, new Date().toISOString()],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            const newCase = { id: this.lastID, designation, threat_level, status, assigned_officer: assigned_officer || req.user.id, assigned_officer_name: req.user.callsign, subject_count: 0, report_count: 0, summary, content: content || '', access_level: access_level || 1, created_at: new Date().toISOString() };
            logAction('CREATE_CASE', req.user.callsign, `Designation: ${designation}`);
            res.status(201).json(newCase);
        }
    );
});

app.put('/api/casefiles/:id', authenticate, (req, res) => {
    const id = req.params.id;
    const { designation, threat_level, status, assigned_officer, summary, content, access_level } = req.body;
    
    db.run(
        'UPDATE casefiles SET designation = ?, threat_level = ?, status = ?, assigned_officer = ?, summary = ?, content = ?, access_level = ?, updated_at = ? WHERE id = ?',
        [designation, threat_level, status, assigned_officer, summary, content, access_level, new Date().toISOString(), id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Case not found' });
            }
            logAction('UPDATE_CASE', req.user.callsign, `ID: ${id}`);
            db.get('SELECT * FROM casefiles WHERE id = ?', [id], (err, casefile) => {
                res.json(casefile);
            });
        }
    );
});

app.delete('/api/casefiles/:id', authenticate, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM casefiles WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Case not found' });
        }
        logAction('DELETE_CASE', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Case ${id} closed and purged` });
    });
});

// ============================================================
// REPORTS CRUD
// ============================================================
app.get('/api/reports', authenticate, (req, res) => {
    const { case_id } = req.query;
    logAction('VIEW_REPORTS', req.user.callsign, `Case ID: ${case_id || 'All'}`);
    
    let query = 'SELECT * FROM reports';
    const params = [];
    if (case_id) {
        query += ' WHERE case_id = ?';
        params.push(parseInt(case_id));
    }
    query += ' ORDER BY id DESC';
    
    db.all(query, params, (err, reports) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        const scoped = reports.map(r => {
            if ((r.access_level || 0) > (req.user.clearance_level || 0)) {
                return { ...r, content: null, redacted: true };
            }
            return r;
        });
        res.json(scoped);
    });
});

app.get('/api/reports/:id', authenticate, (req, res) => {
    db.get('SELECT * FROM reports WHERE id = ?', [req.params.id], (err, report) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        logAction('VIEW_REPORT', req.user.callsign, `ID: ${req.params.id}`);
        
        if ((report.access_level || 0) > (req.user.clearance_level || 0)) {
            return res.json({ ...report, content: null, redacted: true });
        }
        res.json(report);
    });
});

app.post('/api/reports', authenticate, (req, res) => {
    const { case_id, content, classification, access_level } = req.body;
    
    // Get case designation
    db.get('SELECT designation FROM casefiles WHERE id = ?', [case_id], (err, casefile) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        const case_designation = casefile ? casefile.designation : `Case_${case_id}`;
        
        db.run(
            'INSERT INTO reports (case_id, case_designation, author_name, content, classification, access_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [case_id, case_designation, req.user.callsign, content, classification, access_level, new Date().toISOString()],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                // Update report count in casefile
                db.run('UPDATE casefiles SET report_count = report_count + 1 WHERE id = ?', [case_id]);
                
                const newReport = { id: this.lastID, case_id, case_designation, author_name: req.user.callsign, content, classification, access_level, created_at: new Date().toISOString() };
                logAction('CREATE_REPORT', req.user.callsign, `Case ID: ${case_id}`);
                res.status(201).json(newReport);
            }
        );
    });
});

app.delete('/api/reports/:id', authenticate, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM reports WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }
        logAction('DELETE_REPORT', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Report ${id} deleted` });
    });
});

// ============================================================
// EVIDENCE CRUD
// ============================================================
app.get('/api/evidence', authenticate, (req, res) => {
    logAction('VIEW_EVIDENCE', req.user.callsign, 'List requested');
    db.all('SELECT * FROM evidence ORDER BY id DESC', (err, evidence) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        const scoped = evidence.map(e => {
            if ((e.access_level || 0) > (req.user.clearance_level || 0)) {
                return { ...e, storage_path: null, redacted: true };
            }
            return e;
        });
        res.json(scoped);
    });
});

app.get('/api/evidence/:id', authenticate, (req, res) => {
    db.get('SELECT * FROM evidence WHERE id = ?', [req.params.id], (err, item) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!item) {
            return res.status(404).json({ error: 'Evidence not found' });
        }
        logAction('VIEW_EVIDENCE_ITEM', req.user.callsign, `ID: ${req.params.id}`);
        
        if ((item.access_level || 0) > (req.user.clearance_level || 0)) {
            return res.json({ ...item, storage_path: null, redacted: true });
        }
        res.json(item);
    });
});

app.post('/api/evidence', authenticate, (req, res) => {
    const { case_id, file_name, storage_path, evidence_type, access_level } = req.body;
    
    db.get('SELECT designation FROM casefiles WHERE id = ?', [case_id], (err, casefile) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        const case_designation = casefile ? casefile.designation : `Case_${case_id}`;
        
        db.run(
            'INSERT INTO evidence (case_id, case_designation, file_name, storage_path, evidence_type, uploaded_by_name, access_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [case_id, case_designation, file_name, storage_path, evidence_type, req.user.callsign, access_level, new Date().toISOString()],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                const newEvidence = { id: this.lastID, case_id, case_designation, file_name, storage_path, evidence_type, uploaded_by_name: req.user.callsign, access_level, created_at: new Date().toISOString() };
                logAction('UPLOAD_EVIDENCE', req.user.callsign, `File: ${file_name}`);
                res.status(201).json(newEvidence);
            }
        );
    });
});

app.delete('/api/evidence/:id', authenticate, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM evidence WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Evidence not found' });
        }
        logAction('DELETE_EVIDENCE', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Evidence ${id} deleted` });
    });
});

// ============================================================
// ENTITIES CRUD
// ============================================================
app.get('/api/entities', authenticate, (req, res) => {
    logAction('VIEW_ENTITIES', req.user.callsign, 'List requested');
    db.all('SELECT * FROM entities ORDER BY id DESC', (err, entities) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(entities);
    });
});

app.get('/api/entities/:id', authenticate, (req, res) => {
    db.get('SELECT * FROM entities WHERE id = ?', [req.params.id], (err, entity) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!entity) {
            return res.status(404).json({ error: 'Entity not found' });
        }
        logAction('VIEW_ENTITY', req.user.callsign, `ID: ${req.params.id}`);
        res.json(entity);
    });
});

app.post('/api/entities', authenticate, (req, res) => {
    const { entity_name, entity_type, classification, description, linked_subject_id, linked_case_id, threat_rating, access_level } = req.body;
    
    // Get subject and case names if linked
    let subject_name = null;
    let case_name = null;
    
    // Use a simple approach - get subject name if linked
    if (linked_subject_id) {
        db.get('SELECT designation FROM subjects WHERE id = ?', [linked_subject_id], (err, subject) => {
            if (!err && subject) subject_name = subject.designation;
        });
    }
    
    if (linked_case_id) {
        db.get('SELECT designation FROM casefiles WHERE id = ?', [linked_case_id], (err, casefile) => {
            if (!err && casefile) case_name = casefile.designation;
        });
    }
    
    db.run(
        'INSERT INTO entities (entity_name, entity_type, classification, description, subject_name, case_name, threat_rating, access_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [entity_name, entity_type, classification, description, subject_name, case_name, threat_rating, access_level || 1, new Date().toISOString()],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            const newEntity = { id: this.lastID, entity_name, entity_type, classification, description, subject_name, case_name, threat_rating, access_level: access_level || 1, created_at: new Date().toISOString() };
            logAction('CREATE_ENTITY', req.user.callsign, `Name: ${entity_name}`);
            res.status(201).json(newEntity);
        }
    );
});

app.delete('/api/entities/:id', authenticate, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM entities WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Entity not found' });
        }
        logAction('DELETE_ENTITY', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Entity ${id} deleted` });
    });
});

// ============================================================
// PERSONNEL / ACCOUNTS (admin-only management)
// ============================================================
app.get('/api/personnel', authenticate, (req, res) => {
    logAction('VIEW_PERSONNEL', req.user.callsign, 'List requested');
    db.all('SELECT id, callsign, rank, clearance_level, department, status, created_at FROM personnel ORDER BY id DESC', (err, personnel) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(personnel);
    });
});

app.get('/api/personnel/:id', authenticate, (req, res) => {
    db.get('SELECT id, callsign, rank, clearance_level, department, status, created_at FROM personnel WHERE id = ?', [req.params.id], (err, person) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!person) {
            return res.status(404).json({ error: 'Personnel not found' });
        }
        res.json(person);
    });
});

app.post('/api/personnel', authenticate, requireClearance(900), (req, res) => {
    const { callsign, password, rank, department } = req.body;
    
    if (!callsign || !password) {
        return res.status(400).json({ error: 'Callsign and password are required' });
    }
    
    // Check if callsign exists
    db.get('SELECT id FROM personnel WHERE callsign = ?', [callsign], (err, existing) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (existing) {
            return res.status(409).json({ error: 'That callsign is already in use' });
        }
        
        // Fixed clearance level to 10 and rank is now a free text field
        const clearance_level = 10;
        
        db.run(
            'INSERT INTO personnel (callsign, password, rank, clearance_level, department, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [callsign, password, rank || 'Inquisitor', clearance_level, department || 'Unknown', 'active', new Date().toISOString()],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                logAction('CREATE_PERSONNEL', req.user.callsign, `Callsign: ${callsign} | Clearance: ${clearance_level}`);
                
                res.status(201).json({
                    id: this.lastID,
                    callsign,
                    rank: rank || 'Inquisitor',
                    clearance_level,
                    department: department || 'Unknown',
                    status: 'active',
                    created_at: new Date().toISOString()
                });
            }
        );
    });
});

app.put('/api/personnel/:id/toggle', authenticate, requireClearance(900), (req, res) => {
    const id = req.params.id;
    
    db.get('SELECT status FROM personnel WHERE id = ?', [id], (err, person) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!person) {
            return res.status(404).json({ error: 'Personnel not found' });
        }
        
        const newStatus = person.status === 'active' ? 'inactive' : 'active';
        db.run('UPDATE personnel SET status = ? WHERE id = ?', [newStatus, id], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            logAction('TOGGLE_PERSONNEL', req.user.callsign, `ID: ${id} | Status: ${newStatus}`);
            res.json({ id: parseInt(id), status: newStatus });
        });
    });
});

app.delete('/api/personnel/:id', authenticate, requireClearance(900), (req, res) => {
    const id = req.params.id;
    
    if (id === '1' || parseInt(id) === 1) {
        return res.status(403).json({ error: 'Cannot delete the God_Emperor account' });
    }
    
    db.run('DELETE FROM personnel WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Personnel not found' });
        }
        logAction('DELETE_PERSONNEL', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Personnel ${id} purged` });
    });
});

// ============================================================
// LOGS
// ============================================================
app.get('/api/logs', authenticate, (req, res) => {
    db.all('SELECT * FROM logs ORDER BY id DESC LIMIT 200', (err, logs) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(logs);
    });
});

// ============================================================
// FRONTEND
// ============================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ═══════════════════════════════════════════════
    IMPERIAL INQUISITION DATABASE TERMINAL
    ═══════════════════════════════════════════════
    Server: http://localhost:${PORT}
    Super Admin: God_Emperor
    Password: Ksusa
    ═══════════════════════════════════════════════
    `);
});

// Close database on exit
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});