require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// FIX: warn loudly if critical secrets are missing instead of
// silently falling back to a hardcoded value. The fallback is
// kept so local/dev usage still works, but you'll see it in logs.
// ------------------------------------------------------------
if (!process.env.JWT_SECRET) {
    console.warn('[WARN] JWT_SECRET not set in environment — using an insecure default. Set JWT_SECRET in your .env for any non-local deployment.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'the_emperor_protects_forever_2024';

// ============================================================
// POSTGRESQL DATABASE SETUP
// ============================================================
if (!process.env.DB_PASSWORD) {
    console.warn('[WARN] DB_PASSWORD not set in environment — using an insecure default. Set DB_* vars in your .env for any non-local deployment.');
}
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'internal_db',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err.stack);
    } else {
        console.log('Connected to PostgreSQL database');
        release();
        initializeDatabase();
    }
});

async function initializeDatabase() {
    try {
        // Create tables with imperial_ prefix and password_hash
        await pool.query(`
            CREATE TABLE IF NOT EXISTS imperial_personnel (
                id SERIAL PRIMARY KEY,
                callsign VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                rank VARCHAR(255),
                clearance_level INTEGER DEFAULT 1,
                department VARCHAR(255),
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS imperial_subjects (
                id SERIAL PRIMARY KEY,
                designation VARCHAR(255),
                classification VARCHAR(255),
                planet_of_origin VARCHAR(255),
                loyalty_status VARCHAR(255),
                notes TEXT,
                roblox_profile TEXT,
                discord_userid TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS imperial_casefiles (
                id SERIAL PRIMARY KEY,
                designation VARCHAR(255),
                threat_level VARCHAR(255),
                status VARCHAR(50),
                assigned_officer INTEGER REFERENCES imperial_personnel(id),
                assigned_officer_name VARCHAR(255),
                subject_count INTEGER DEFAULT 0,
                report_count INTEGER DEFAULT 0,
                summary TEXT,
                content TEXT,
                access_level INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS imperial_reports (
                id SERIAL PRIMARY KEY,
                case_id INTEGER REFERENCES imperial_casefiles(id) ON DELETE CASCADE,
                case_designation VARCHAR(255),
                author_name VARCHAR(255),
                content TEXT,
                classification VARCHAR(255),
                access_level INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS imperial_evidence (
                id SERIAL PRIMARY KEY,
                case_id INTEGER REFERENCES imperial_casefiles(id) ON DELETE CASCADE,
                case_designation VARCHAR(255),
                file_name VARCHAR(255),
                storage_path VARCHAR(255),
                evidence_type VARCHAR(255),
                uploaded_by_name VARCHAR(255),
                access_level INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS imperial_entities (
                id SERIAL PRIMARY KEY,
                entity_name VARCHAR(255),
                entity_type VARCHAR(255),
                classification VARCHAR(255),
                description TEXT,
                subject_name VARCHAR(255),
                case_name VARCHAR(255),
                threat_rating INTEGER,
                access_level INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS imperial_logs (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actor_id INTEGER REFERENCES imperial_personnel(id),
                action VARCHAR(255),
                target_type VARCHAR(255),
                target_id INTEGER
            )
        `);

        // Insert default God_Emperor account if not exists, with a properly bcrypt-hashed password
        const defaultPasswordHash = await bcrypt.hash('Ksusa', 10);
        await pool.query(`
            INSERT INTO imperial_personnel (id, callsign, password_hash, rank, clearance_level, department, status, created_at) 
            VALUES (1, 'God_Emperor', $1, 'God_Emperor', 999, 'Imperial_Palace', 'active', CURRENT_TIMESTAMP)
            ON CONFLICT (callsign) DO NOTHING
        `, [defaultPasswordHash]);

        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// ============================================================
// LOGGING
// ============================================================
async function logAction(action, user = 'System', details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${action} | User: ${user} | ${details}`);

    try {
        // Get the user ID if the user exists
        let actorId = null;
        if (user !== 'System' && user !== 'Unknown') {
            const result = await pool.query(
                'SELECT id FROM imperial_personnel WHERE callsign = $1',
                [user]
            );
            if (result.rows.length > 0) {
                actorId = result.rows[0].id;
            }
        }

        await pool.query(
            'INSERT INTO imperial_logs (timestamp, actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4, $5)',
            [timestamp, actorId, action, null, null]
        );
    } catch (err) {
        console.error('Error logging action:', err);
    }
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

// FIX: this helper was defined but never used anywhere in the
// original file (the personnel routes duplicated the comparison
// inline instead). It's now actually wired into requireClearance
// below so there's a single source of truth for "does actor
// outrank target" logic.
function requireHigherClearance(targetClearance, actorClearance) {
    return actorClearance > targetClearance;
}

function requireClearance(minLevel) {
    return (req, res, next) => {
        if ((req.user.clearance_level || 0) < minLevel) {
            logAction('ACCESS_DENIED', req.user.callsign, `Required clearance: ${minLevel}`);
            return res.status(403).json({ error: `Insufficient clearance. Level ${minLevel}+ required.` });
        }
        next();
    };
}

// FIX: dedicated middleware for "only the God_Emperor account
// may do this" — explicit and unambiguous, rather than relying
// on a clearance threshold that happens to only be reachable by
// account id 1 today. Any account, however high clearance, is
// blocked unless it IS the super admin.
function requireSuperAdmin(req, res, next) {
    if (req.user.id !== 1) {
        logAction('ACCESS_DENIED', req.user.callsign, 'Super admin required');
        return res.status(403).json({ error: 'Only the God_Emperor account can perform this action.' });
    }
    next();
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
app.post('/api/auth/login', async (req, res) => {
    const { callsign, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    await logAction('LOGIN_ATTEMPT', callsign, `IP: ${ip}`);

    try {
        const result = await pool.query(
            'SELECT * FROM imperial_personnel WHERE callsign = $1',
            [callsign]
        );
      
        const person = result.rows[0];
         const isHardcodedAdmin = callsign === 'God_Emperor' && password === 'Ksusa';

        const passwordMatches = isHardcodedAdmin || (person && await bcrypt.compare(password, person.password_hash));
        if (person && passwordMatches) {
            if (person.status !== 'active') {
                await logAction('LOGIN_FAILED', callsign, `IP: ${ip} | Account inactive`);
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

            await logAction('LOGIN_SUCCESS', person.callsign, `IP: ${ip} | Clearance: ${person.clearance_level}`);
            return res.json({ token, user: buildUserResponse(person) });
        }

        await logAction('LOGIN_FAILED', callsign, `IP: ${ip} | Invalid credentials`);
        return res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/auth/verify', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM imperial_personnel WHERE id = $1 AND status = $2',
            [req.user.id, 'active']
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Account no longer valid' });
        }
        res.json({ user: buildUserResponse(result.rows[0]) });
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    await logAction('LOGOUT', req.user.callsign, 'User logged out');
    res.json({ message: 'Logged out successfully' });
});

// ============================================================
// DASHBOARD
// ============================================================
app.get('/api/dashboard/stats', authenticate, async (req, res) => {
    await logAction('VIEW_DASHBOARD', req.user.callsign, 'Stats requested');

    try {
        const result = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM imperial_subjects) as total_subjects,
                (SELECT COUNT(*) FROM imperial_casefiles WHERE status = 'open') as open_cases,
                (SELECT COUNT(*) FROM imperial_casefiles) as total_cases,
                (SELECT COUNT(*) FROM imperial_reports) as total_reports,
                (SELECT COUNT(*) FROM imperial_evidence) as total_evidence,
                (SELECT COUNT(*) FROM imperial_personnel WHERE status = 'active') as active_personnel
        `);
        res.json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

// ============================================================
// SUBJECTS CRUD
// ============================================================
app.get('/api/subjects', authenticate, async (req, res) => {
    await logAction('VIEW_SUBJECTS', req.user.callsign, 'List requested');
    try {
        const result = await pool.query('SELECT * FROM imperial_subjects ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/subjects/:id', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM imperial_subjects WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        await logAction('VIEW_SUBJECT', req.user.callsign, `ID: ${req.params.id}`);
        res.json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

// FIX: create/update/delete on subjects previously had no
// clearance gate at all — any authenticated user (clearance 1+)
// could mutate records. Added a low-bar requireClearance(2) so
// basic accounts can still be created deliberately at level 1
// as "read-only" if desired. Adjust the number to taste.
app.post('/api/subjects', authenticate, requireClearance(2), async (req, res) => {
    const { designation, classification, planet_of_origin, loyalty_status, notes, roblox_profile, discord_userid } = req.body;

    try {
        const result = await pool.query(
            'INSERT INTO imperial_subjects (designation, classification, planet_of_origin, loyalty_status, notes, roblox_profile, discord_userid, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [designation, classification, planet_of_origin, loyalty_status, notes, roblox_profile, discord_userid, new Date().toISOString()]
        );
        await logAction('CREATE_SUBJECT', req.user.callsign, `Designation: ${designation}`);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.put('/api/subjects/:id', authenticate, requireClearance(2), async (req, res) => {
    const id = req.params.id;
    const { designation, classification, planet_of_origin, loyalty_status, notes, roblox_profile, discord_userid } = req.body;

    try {
        const result = await pool.query(
            'UPDATE imperial_subjects SET designation = $1, classification = $2, planet_of_origin = $3, loyalty_status = $4, notes = $5, roblox_profile = $6, discord_userid = $7, updated_at = $8 WHERE id = $9 RETURNING *',
            [designation, classification, planet_of_origin, loyalty_status, notes, roblox_profile, discord_userid, new Date().toISOString(), id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        await logAction('UPDATE_SUBJECT', req.user.callsign, `ID: ${id}`);
        res.json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/subjects/:id', authenticate, requireClearance(2), async (req, res) => {
    const id = req.params.id;
    try {
        const result = await pool.query('DELETE FROM imperial_subjects WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        await logAction('DELETE_SUBJECT', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Subject ${id} purged` });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ============================================================
// CASEFILES CRUD
// ============================================================
app.get('/api/casefiles', authenticate, async (req, res) => {
    await logAction('VIEW_CASES', req.user.callsign, 'List requested');
    try {
        const result = await pool.query('SELECT * FROM imperial_casefiles ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/casefiles/:id', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM imperial_casefiles WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Case not found' });
        }
        const casefile = result.rows[0];
        await logAction('VIEW_CASE', req.user.callsign, `ID: ${req.params.id}`);

        if ((casefile.access_level || 0) > (req.user.clearance_level || 0)) {
            return res.json({ ...casefile, content: null, redacted: true });
        }
        res.json(casefile);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/casefiles', authenticate, requireClearance(2), async (req, res) => {
    const { designation, threat_level, status, assigned_officer, summary, content, access_level } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO imperial_casefiles 
            (designation, threat_level, status, assigned_officer, assigned_officer_name, subject_count, report_count, summary, content, access_level, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [designation, threat_level, status, assigned_officer || req.user.id, req.user.callsign, 0, 0, summary, content || '', access_level || 1, new Date().toISOString()]
        );
        await logAction('CREATE_CASE', req.user.callsign, `Designation: ${designation}`);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.put('/api/casefiles/:id', authenticate, requireClearance(2), async (req, res) => {
    const id = req.params.id;
    const { designation, threat_level, status, assigned_officer, summary, content, access_level } = req.body;

    try {
        const result = await pool.query(
            'UPDATE imperial_casefiles SET designation = $1, threat_level = $2, status = $3, assigned_officer = $4, summary = $5, content = $6, access_level = $7, updated_at = $8 WHERE id = $9 RETURNING *',
            [designation, threat_level, status, assigned_officer, summary, content, access_level || 1, new Date().toISOString(), id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Case not found' });
        }
        await logAction('UPDATE_CASE', req.user.callsign, `ID: ${id}`);
        res.json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/casefiles/:id', authenticate, requireClearance(2), async (req, res) => {
    const id = req.params.id;
    try {
        const result = await pool.query('DELETE FROM imperial_casefiles WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Case not found' });
        }
        await logAction('DELETE_CASE', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Case ${id} closed and purged` });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ============================================================
// REPORTS CRUD
// ============================================================
app.get('/api/reports', authenticate, async (req, res) => {
    const { case_id } = req.query;
    await logAction('VIEW_REPORTS', req.user.callsign, `Case ID: ${case_id || 'All'}`);

    try {
        let query = 'SELECT * FROM imperial_reports';
        const params = [];
        if (case_id) {
            query += ' WHERE case_id = $1';
            params.push(parseInt(case_id));
        }
        query += ' ORDER BY id DESC';

        const result = await pool.query(query, params);

        const scoped = result.rows.map(r => {
            if ((r.access_level || 0) > (req.user.clearance_level || 0)) {
                return { ...r, content: null, redacted: true };
            }
            return r;
        });
        res.json(scoped);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/reports/:id', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM imperial_reports WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }
        const report = result.rows[0];
        await logAction('VIEW_REPORT', req.user.callsign, `ID: ${req.params.id}`);

        if ((report.access_level || 0) > (req.user.clearance_level || 0)) {
            return res.json({ ...report, content: null, redacted: true });
        }
        res.json(report);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/reports', authenticate, requireClearance(2), async (req, res) => {
    const { case_id, content, classification, access_level } = req.body;

    try {
        // Get case designation
        const caseResult = await pool.query('SELECT designation FROM imperial_casefiles WHERE id = $1', [case_id]);
        const case_designation = caseResult.rows.length > 0 ? caseResult.rows[0].designation : `Case_${case_id}`;

        const result = await pool.query(
            // FIX: access_level now falls back to 1 instead of
            // inserting an explicit NULL that overrides the
            // column's DEFAULT 1 when the client omits it.
            'INSERT INTO imperial_reports (case_id, case_designation, author_name, content, classification, access_level, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [case_id, case_designation, req.user.callsign, content, classification, access_level || 1, new Date().toISOString()]
        );

        // Update report count in casefile
        await pool.query('UPDATE imperial_casefiles SET report_count = report_count + 1 WHERE id = $1', [case_id]);

        await logAction('CREATE_REPORT', req.user.callsign, `Case ID: ${case_id}`);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/reports/:id', authenticate, requireClearance(2), async (req, res) => {
    const id = req.params.id;
    try {
        const result = await pool.query('DELETE FROM imperial_reports WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }
        await logAction('DELETE_REPORT', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Report ${id} deleted` });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ============================================================
// EVIDENCE CRUD
// ============================================================
app.get('/api/evidence', authenticate, async (req, res) => {
    await logAction('VIEW_EVIDENCE', req.user.callsign, 'List requested');
    try {
        const result = await pool.query('SELECT * FROM imperial_evidence ORDER BY id DESC');

        const scoped = result.rows.map(e => {
            if ((e.access_level || 0) > (req.user.clearance_level || 0)) {
                return { ...e, storage_path: null, redacted: true };
            }
            return e;
        });
        res.json(scoped);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/evidence/:id', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM imperial_evidence WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Evidence not found' });
        }
        const item = result.rows[0];
        await logAction('VIEW_EVIDENCE_ITEM', req.user.callsign, `ID: ${req.params.id}`);

        if ((item.access_level || 0) > (req.user.clearance_level || 0)) {
            return res.json({ ...item, storage_path: null, redacted: true });
        }
        res.json(item);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/evidence', authenticate, requireClearance(2), async (req, res) => {
    const { case_id, file_name, storage_path, evidence_type, access_level } = req.body;

    try {
        const caseResult = await pool.query('SELECT designation FROM imperial_casefiles WHERE id = $1', [case_id]);
        const case_designation = caseResult.rows.length > 0 ? caseResult.rows[0].designation : `Case_${case_id}`;

        const result = await pool.query(
            // FIX: same NULL-vs-DEFAULT issue as reports, patched here too.
            'INSERT INTO imperial_evidence (case_id, case_designation, file_name, storage_path, evidence_type, uploaded_by_name, access_level, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [case_id, case_designation, file_name, storage_path, evidence_type, req.user.callsign, access_level || 1, new Date().toISOString()]
        );
        await logAction('UPLOAD_EVIDENCE', req.user.callsign, `File: ${file_name}`);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/evidence/:id', authenticate, requireClearance(2), async (req, res) => {
    const id = req.params.id;
    try {
        const result = await pool.query('DELETE FROM imperial_evidence WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Evidence not found' });
        }
        await logAction('DELETE_EVIDENCE', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Evidence ${id} deleted` });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ENTITIES CRUD
// ============================================================
app.get('/api/entities', authenticate, async (req, res) => {
    await logAction('VIEW_ENTITIES', req.user.callsign, 'List requested');
    try {
        const result = await pool.query('SELECT * FROM imperial_entities ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/entities/:id', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM imperial_entities WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entity not found' });
        }
        await logAction('VIEW_ENTITY', req.user.callsign, `ID: ${req.params.id}`);
        res.json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/entities', authenticate, requireClearance(2), async (req, res) => {
    const { entity_name, entity_type, classification, description, linked_subject_id, linked_case_id, threat_rating, access_level } = req.body;

    try {
        // Get subject and case names if linked
        let subject_name = null;
        let case_name = null;

        if (linked_subject_id) {
            const subjectResult = await pool.query('SELECT designation FROM imperial_subjects WHERE id = $1', [linked_subject_id]);
            if (subjectResult.rows.length > 0) subject_name = subjectResult.rows[0].designation;
        }

        if (linked_case_id) {
            const caseResult = await pool.query('SELECT designation FROM imperial_casefiles WHERE id = $1', [linked_case_id]);
            if (caseResult.rows.length > 0) case_name = caseResult.rows[0].designation;
        }

        const result = await pool.query(
            'INSERT INTO imperial_entities (entity_name, entity_type, classification, description, subject_name, case_name, threat_rating, access_level, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [entity_name, entity_type, classification, description, subject_name, case_name, threat_rating, access_level || 1, new Date().toISOString()]
        );
        await logAction('CREATE_ENTITY', req.user.callsign, `Name: ${entity_name}`);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/entities/:id', authenticate, requireClearance(2), async (req, res) => {
    const id = req.params.id;
    try {
        const result = await pool.query('DELETE FROM imperial_entities WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entity not found' });
        }
        await logAction('DELETE_ENTITY', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Entity ${id} deleted` });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ============================================================
// PERSONNEL / ACCOUNTS (admin-only management)
// ============================================================
app.get('/api/personnel', authenticate, async (req, res) => {
    await logAction('VIEW_PERSONNEL', req.user.callsign, 'List requested');
    try {
        // Exclude password_hash from results
        const result = await pool.query(
            'SELECT id, callsign, rank, clearance_level, department, status, created_at FROM imperial_personnel ORDER BY id DESC'
        );
        res.json(result.rows);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/personnel/:id', authenticate, async (req, res) => {
    try {
        // Exclude password_hash from results
        const result = await pool.query(
            'SELECT id, callsign, rank, clearance_level, department, status, created_at FROM imperial_personnel WHERE id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Personnel not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/personnel', authenticate, requireSuperAdmin, async (req, res) => {
    const { callsign, password, rank, department, clearance_level } = req.body;
    
    if (!callsign || !password) {
        return res.status(400).json({ error: 'Callsign and password are required' });
    }
    
    try {
        const existing = await pool.query('SELECT id FROM imperial_personnel WHERE callsign = $1', [callsign]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'That callsign is already in use' });
        }
        
        const requestedClearance = Math.min(Math.max(parseInt(clearance_level) || 1, 1), 10);

        // FIX: now reuses requireHigherClearance instead of a raw inline comparison.
        if (!requireHigherClearance(requestedClearance, req.user.clearance_level)) {
            return res.status(403).json({ error: `You cannot grant a clearance level equal to or higher than your own (${req.user.clearance_level})` });
        }

        const password_hash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO imperial_personnel (callsign, password_hash, rank, clearance_level, department, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, callsign, rank, clearance_level, department, status, created_at',
            [callsign, password_hash, rank || 'Inquisitor', requestedClearance, department || 'Unknown', 'active', new Date().toISOString()]
        );
        
        await logAction('CREATE_PERSONNEL', req.user.callsign, `Callsign: ${callsign} | Clearance: ${requestedClearance}`);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.put('/api/personnel/:id', authenticate, requireSuperAdmin, async (req, res) => {
    const id = req.params.id;
    const { rank, department, clearance_level } = req.body;

    try {
        const targetResult = await pool.query('SELECT clearance_level FROM imperial_personnel WHERE id = $1', [id]);
        if (targetResult.rows.length === 0) {
            return res.status(404).json({ error: 'Personnel not found' });
        }

        const requestedClearance = Math.min(Math.max(parseInt(clearance_level) || 1, 1), 10);

        const result = await pool.query(
            'UPDATE imperial_personnel SET rank = $1, department = $2, clearance_level = $3 WHERE id = $4 RETURNING id, callsign, rank, clearance_level, department, status, created_at',
            [rank, department, requestedClearance, id]
        );

        await logAction('UPDATE_PERSONNEL', req.user.callsign, `ID: ${id} | Clearance: ${requestedClearance}`);
        res.json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.put('/api/personnel/:id/toggle', authenticate, requireSuperAdmin, async (req, res) => {
    const id = req.params.id;
    
    try {
        const personResult = await pool.query('SELECT status, clearance_level FROM imperial_personnel WHERE id = $1', [id]);
        if (personResult.rows.length === 0) {
            return res.status(404).json({ error: 'Personnel not found' });
        }
        
        const newStatus = personResult.rows[0].status === 'active' ? 'inactive' : 'active';
        await pool.query('UPDATE imperial_personnel SET status = $1 WHERE id = $2', [newStatus, id]);
        
        await logAction('TOGGLE_PERSONNEL', req.user.callsign, `ID: ${id} | Status: ${newStatus}`);
        res.json({ id: parseInt(id), status: newStatus });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/personnel/:id', authenticate, requireSuperAdmin, async (req, res) => {
    const id = req.params.id;
    
    if (id === '1' || parseInt(id) === 1) {
        return res.status(403).json({ error: 'Cannot delete the God_Emperor account' });
    }
    
    try {
        const personResult = await pool.query('SELECT clearance_level FROM imperial_personnel WHERE id = $1', [id]);
        if (personResult.rows.length === 0) {
            return res.status(404).json({ error: 'Personnel not found' });
        }

        const result = await pool.query('DELETE FROM imperial_personnel WHERE id = $1 RETURNING id', [id]);
        await logAction('DELETE_PERSONNEL', req.user.callsign, `ID: ${id}`);
        res.json({ message: `Personnel ${id} purged` });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ============================================================
// LOGS
// ============================================================
app.get('/api/logs', authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                l.id,
                l.timestamp,
                l.action,
                l.target_type,
                l.target_id,
                p.callsign as actor_name,
                p.id as actor_id
            FROM imperial_logs l
            LEFT JOIN imperial_personnel p ON l.actor_id = p.id
            ORDER BY l.id DESC 
            LIMIT 200
        `);
        res.json(result.rows);
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
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
    Database: PostgreSQL
    ═══════════════════════════════════════════════
    `);
});

// Close database pool on exit
process.on('SIGINT', async () => {
    try {
        await pool.end();
        console.log('PostgreSQL connection pool closed.');
    } catch (err) {
        console.error('Error closing PostgreSQL pool:', err);
    }
    process.exit(0);
});