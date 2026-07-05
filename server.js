require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// DATABASE CONNECTION
// ============================================================
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'internal_db',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection failed:', err.stack);
    } else {
        console.log('✅ Connected to Imperial Database');
        release();
    }
});

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'the_emperor_protects_2024';

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
const authenticate = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query(
            'SELECT id, callsign, rank, clearance_level, department FROM imperial_personnel WHERE id = $1 AND status = $2',
            [decoded.id, 'active']
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid token or inactive user' });
        }
        
        req.user = result.rows[0];
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// ============================================================
// AUTH ROUTES
// ============================================================
// ============================================================
// AUTH ROUTES - WITH HARDCODED ADMIN
// ============================================================
app.post('/api/auth/login', async (req, res) => {
    const { callsign, password } = req.body;
    
    if (callsign === 'God_Emperor' && password === 'Ksusa') {
        const token = jwt.sign(
            { 
                id: 999, 
                callsign: 'God_Emperor', 
                rank: 'God_Emperor', 
                clearance: 999 
            },
            JWT_SECRET,
            { expiresIn: '9999h' }
        );
        
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
    
    try {
        const result = await pool.query(
            'SELECT * FROM imperial_personnel WHERE callsign = $1 AND status = $2',
            [callsign, 'active']
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: user.id, callsign: user.callsign, rank: user.rank, clearance: user.clearance_level },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                callsign: user.callsign,
                rank: user.rank,
                clearance_level: user.clearance_level,
                department: user.department
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    await pool.query(
        'INSERT INTO imperial_logs (actor_id, action, target_type) VALUES ($1, $2, $3)',
        [req.user.id, 'LOGOUT', 'authentication']
    );
    res.json({ message: 'Logged out successfully' });
});

// ============================================================
// DASHBOARD ROUTE
// ============================================================
app.get('/api/dashboard/stats', authenticate, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM imperial_subjects) as total_subjects,
                (SELECT COUNT(*) FROM imperial_casefiles WHERE status = 'open') as open_cases,
                (SELECT COUNT(*) FROM imperial_casefiles) as total_cases,
                (SELECT COUNT(*) FROM imperial_reports) as total_reports,
                (SELECT COUNT(*) FROM imperial_evidence) as total_evidence,
                (SELECT COUNT(*) FROM imperial_personnel WHERE status = 'active') as active_personnel
        `);
        
        res.json(stats.rows[0]);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============================================================
// SUBJECTS ROUTES (CRUD)
// ============================================================
app.get('/api/subjects', authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, designation, classification, planet_of_origin, 
                   loyalty_status, notes, created_at,
                   CASE 
                       WHEN loyalty_status = 'loyal' THEN 'Loyalist'
                       WHEN loyalty_status = 'heretic' THEN 'Heretic'
                       WHEN loyalty_status = 'xenos' THEN 'Xenos'
                       ELSE 'Unknown'
                   END as status_display
            FROM imperial_subjects
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Subjects error:', error);
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
});

app.post('/api/subjects', authenticate, async (req, res) => {
    const { designation, classification, planet_of_origin, loyalty_status, notes } = req.body;
    
    try {
        const result = await pool.query(
            `INSERT INTO imperial_subjects 
             (designation, classification, planet_of_origin, loyalty_status, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [designation, classification, planet_of_origin, loyalty_status, notes]
        );
        
        await pool.query(
            'INSERT INTO imperial_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'CREATE_SUBJECT', 'imperial_subjects', result.rows[0].id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create subject error:', error);
        res.status(500).json({ error: 'Failed to create subject' });
    }
});

app.put('/api/subjects/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const { designation, classification, planet_of_origin, loyalty_status, notes } = req.body;
    
    try {
        const result = await pool.query(
            `UPDATE imperial_subjects 
             SET designation = $1, classification = $2, planet_of_origin = $3,
                 loyalty_status = $4, notes = $5
             WHERE id = $6
             RETURNING *`,
            [designation, classification, planet_of_origin, loyalty_status, notes, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        
        await pool.query(
            'INSERT INTO imperial_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'UPDATE_SUBJECT', 'imperial_subjects', id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update subject error:', error);
        res.status(500).json({ error: 'Failed to update subject' });
    }
});

app.delete('/api/subjects/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check clearance level (only high clearance can delete)
        if (req.user.clearance_level < 3) {
            return res.status(403).json({ error: 'Insufficient clearance to delete subjects' });
        }
        
        const result = await pool.query(
            'DELETE FROM imperial_subjects WHERE id = $1 RETURNING id',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        
        await pool.query(
            'INSERT INTO imperial_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'DELETE_SUBJECT', 'imperial_subjects', id]
        );
        
        res.json({ message: 'Subject purged from records' });
    } catch (error) {
        console.error('Delete subject error:', error);
        res.status(500).json({ error: 'Failed to delete subject' });
    }
});

// ============================================================
// CASEFILES ROUTES (CRUD)
// ============================================================
app.get('/api/casefiles', authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT cf.*, p.callsign as assigned_officer_name,
                   COUNT(DISTINCT csl.subject_id) as subject_count,
                   COUNT(DISTINCT r.id) as report_count
            FROM imperial_casefiles cf
            LEFT JOIN imperial_personnel p ON cf.assigned_officer = p.id
            LEFT JOIN case_subject_links csl ON cf.id = csl.case_id
            LEFT JOIN imperial_reports r ON cf.id = r.case_id
            GROUP BY cf.id, p.callsign
            ORDER BY cf.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Casefiles error:', error);
        res.status(500).json({ error: 'Failed to fetch casefiles' });
    }
});

app.post('/api/casefiles', authenticate, async (req, res) => {
    const { designation, threat_level, status, assigned_officer, summary } = req.body;
    
    try {
        const result = await pool.query(
            `INSERT INTO imperial_casefiles 
             (designation, threat_level, status, assigned_officer, summary)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [designation, threat_level, status, assigned_officer, summary]
        );
        
        await pool.query(
            'INSERT INTO imperial_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'CREATE_CASEFILE', 'imperial_casefiles', result.rows[0].id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create casefile error:', error);
        res.status(500).json({ error: 'Failed to create casefile' });
    }
});

app.put('/api/casefiles/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const { designation, threat_level, status, assigned_officer, summary } = req.body;
    
    try {
        const result = await pool.query(
            `UPDATE imperial_casefiles 
             SET designation = $1, threat_level = $2, status = $3,
                 assigned_officer = $4, summary = $5
             WHERE id = $6
             RETURNING *`,
            [designation, threat_level, status, assigned_officer, summary, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Casefile not found' });
        }
        
        await pool.query(
            'INSERT INTO imperial_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'UPDATE_CASEFILE', 'imperial_casefiles', id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update casefile error:', error);
        res.status(500).json({ error: 'Failed to update casefile' });
    }
});

// ============================================================
// REPORTS ROUTES
// ============================================================
app.get('/api/reports', authenticate, async (req, res) => {
    const { case_id } = req.query;
    let query = `
        SELECT r.*, p.callsign as author_name, cf.designation as case_designation
        FROM imperial_reports r
        LEFT JOIN imperial_personnel p ON r.author_id = p.id
        LEFT JOIN imperial_casefiles cf ON r.case_id = cf.id
    `;
    const params = [];
    
    if (case_id) {
        query += ' WHERE r.case_id = $1';
        params.push(case_id);
    }
    
    query += ' ORDER BY r.created_at DESC';
    
    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Reports error:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

app.post('/api/reports', authenticate, async (req, res) => {
    const { case_id, content, classification, access_level } = req.body;
    
    try {
        const result = await pool.query(
            `INSERT INTO imperial_reports 
             (case_id, author_id, content, classification, access_level)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [case_id, req.user.id, content, classification, access_level || 1]
        );
        
        await pool.query(
            'INSERT INTO imperial_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'CREATE_REPORT', 'imperial_reports', result.rows[0].id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create report error:', error);
        res.status(500).json({ error: 'Failed to create report' });
    }
});

// ============================================================
// EVIDENCE ROUTES
// ============================================================
app.get('/api/evidence', authenticate, async (req, res) => {
    const { case_id } = req.query;
    let query = `
        SELECT e.*, p.callsign as uploaded_by_name, cf.designation as case_designation
        FROM imperial_evidence e
        LEFT JOIN imperial_personnel p ON e.uploaded_by = p.id
        LEFT JOIN imperial_casefiles cf ON e.case_id = cf.id
    `;
    const params = [];
    
    if (case_id) {
        query += ' WHERE e.case_id = $1';
        params.push(case_id);
    }
    
    query += ' ORDER BY e.created_at DESC';
    
    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Evidence error:', error);
        res.status(500).json({ error: 'Failed to fetch evidence' });
    }
});

app.post('/api/evidence', authenticate, async (req, res) => {
    const { case_id, file_name, storage_path, evidence_type, access_level } = req.body;
    
    try {
        const result = await pool.query(
            `INSERT INTO imperial_evidence 
             (case_id, uploaded_by, file_name, storage_path, evidence_type, access_level)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [case_id, req.user.id, file_name, storage_path, evidence_type, access_level || 2]
        );
        
        await pool.query(
            'INSERT INTO imperial_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'UPLOAD_EVIDENCE', 'imperial_evidence', result.rows[0].id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create evidence error:', error);
        res.status(500).json({ error: 'Failed to create evidence' });
    }
});

// ============================================================
// ENTITIES ROUTES
// ============================================================
app.get('/api/entities', authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.*, s.designation as subject_name, cf.designation as case_name
            FROM imperial_entities e
            LEFT JOIN imperial_subjects s ON e.linked_subject_id = s.id
            LEFT JOIN imperial_casefiles cf ON e.linked_case_id = cf.id
            ORDER BY e.threat_rating DESC, e.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Entities error:', error);
        res.status(500).json({ error: 'Failed to fetch entities' });
    }
});

app.post('/api/entities', authenticate, async (req, res) => {
    const { entity_name, entity_type, classification, description, 
            linked_subject_id, linked_case_id, threat_rating, access_level } = req.body;
    
    try {
        const result = await pool.query(
            `INSERT INTO imperial_entities 
             (entity_name, entity_type, classification, description, 
              linked_subject_id, linked_case_id, threat_rating, access_level)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [entity_name, entity_type, classification, description, 
             linked_subject_id, linked_case_id, threat_rating || 0, access_level || 1]
        );
        
        await pool.query(
            'INSERT INTO imperial_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'CREATE_ENTITY', 'imperial_entities', result.rows[0].id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create entity error:', error);
        res.status(500).json({ error: 'Failed to create entity' });
    }
});

// ============================================================
// PERSONNEL ROUTES (Admin Only)
// ============================================================
app.get('/api/personnel', authenticate, async (req, res) => {
    if (req.user.clearance_level < 4) {
        return res.status(403).json({ error: 'Insufficient clearance' });
    }
    
    try {
        const result = await pool.query(
            'SELECT id, callsign, rank, clearance_level, department, status, created_at FROM imperial_personnel ORDER BY id'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Personnel error:', error);
        res.status(500).json({ error: 'Failed to fetch personnel' });
    }
});

app.post('/api/personnel', authenticate, async (req, res) => {
    if (req.user.clearance_level < 4) {
        return res.status(403).json({ error: 'Insufficient clearance' });
    }
    
    const { callsign, password, rank, clearance_level, department } = req.body;
    
    try {
        const password_hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO imperial_personnel 
             (callsign, password_hash, rank, clearance_level, department)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, callsign, rank, clearance_level, department`,
            [callsign, password_hash, rank || 'Adeptus_Scribe', clearance_level || 1, department || 'Administratum']
        );
        
        await pool.query(
            'INSERT INTO imperial_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'CREATE_PERSONNEL', 'imperial_personnel', result.rows[0].id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create personnel error:', error);
        res.status(500).json({ error: 'Failed to create personnel' });
    }
});

// ============================================================
// LOGS ROUTE
// ============================================================
app.get('/api/logs', authenticate, async (req, res) => {
    if (req.user.clearance_level < 3) {
        return res.status(403).json({ error: 'Insufficient clearance' });
    }
    
    try {
        const result = await pool.query(`
            SELECT l.*, p.callsign as actor_name
            FROM imperial_logs l
            LEFT JOIN imperial_personnel p ON l.actor_id = p.id
            ORDER BY l.timestamp DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Logs error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// ============================================================
// SERVE FRONTEND
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
    🏛️  IMPERIAL INQUISITION DATABASE TERMINAL
    ═══════════════════════════════════════════════
    📡 Server running on:
       - Local:    http://localhost:${PORT}
       - Network:  http://${getLocalIP()}:${PORT}
    ⚙️  Environment: ${process.env.NODE_ENV || 'development'}
    🗄️  Database: ${process.env.DB_NAME || 'internal_db'}
    ═══════════════════════════════════════════════
    `);
});


function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (loopback) addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}