# Generate SQL file with real hash
node -e "
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('Ksusa', 10);
const fs = require('fs');

const sql = \`-- ============================================================
-- IMPERIAL INQUISITION DATABASE - GOD_EMPEROR SUPER ADMIN
-- ============================================================

DROP TABLE IF EXISTS imperial_logs CASCADE;
DROP TABLE IF EXISTS imperial_blueprints CASCADE;
DROP TABLE IF EXISTS imperial_entities CASCADE;
DROP TABLE IF EXISTS imperial_evidence CASCADE;
DROP TABLE IF EXISTS imperial_reports CASCADE;
DROP TABLE IF EXISTS case_subject_links CASCADE;
DROP TABLE IF EXISTS imperial_casefiles CASCADE;
DROP TABLE IF EXISTS imperial_subjects CASCADE;
DROP TABLE IF EXISTS imperial_personnel CASCADE;

CREATE TABLE imperial_personnel (
    id SERIAL PRIMARY KEY,
    callsign TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rank TEXT DEFAULT 'Adeptus_Scribe',
    clearance_level INTEGER DEFAULT 1,
    department TEXT DEFAULT 'Administratum',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE imperial_subjects (
    id SERIAL PRIMARY KEY,
    designation TEXT NOT NULL,
    classification TEXT DEFAULT 'civilian',
    planet_of_origin TEXT,
    loyalty_status TEXT DEFAULT 'unknown',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE imperial_casefiles (
    id SERIAL PRIMARY KEY,
    designation TEXT NOT NULL,
    threat_level TEXT DEFAULT 'low',
    status TEXT DEFAULT 'open',
    assigned_officer INTEGER REFERENCES imperial_personnel(id),
    summary TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE case_subject_links (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES imperial_casefiles(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES imperial_subjects(id) ON DELETE CASCADE,
    role TEXT
);

CREATE TABLE imperial_reports (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES imperial_casefiles(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES imperial_personnel(id),
    content TEXT,
    classification TEXT DEFAULT 'restricted',
    access_level INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE imperial_evidence (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES imperial_casefiles(id) ON DELETE CASCADE,
    uploaded_by INTEGER REFERENCES imperial_personnel(id),
    file_name TEXT,
    storage_path TEXT,
    evidence_type TEXT,
    access_level INTEGER DEFAULT 2,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE imperial_entities (
    id SERIAL PRIMARY KEY,
    entity_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    classification TEXT DEFAULT 'unknown',
    description TEXT,
    linked_subject_id INTEGER REFERENCES imperial_subjects(id),
    linked_case_id INTEGER REFERENCES imperial_casefiles(id),
    threat_rating INTEGER DEFAULT 0,
    access_level INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE imperial_blueprints (
    id SERIAL PRIMARY KEY,
    blueprint_name TEXT NOT NULL,
    blueprint_type TEXT DEFAULT 'structure',
    author_id INTEGER REFERENCES imperial_personnel(id),
    classification TEXT DEFAULT 'restricted',
    data JSONB,
    status TEXT DEFAULT 'draft',
    access_level INTEGER DEFAULT 2,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE imperial_logs (
    id SERIAL PRIMARY KEY,
    actor_id INTEGER REFERENCES imperial_personnel(id),
    action TEXT,
    target_type TEXT,
    target_id INTEGER,
    timestamp TIMESTAMP DEFAULT NOW()
);

DELETE FROM imperial_personnel WHERE callsign = 'God_Emperor';

INSERT INTO imperial_personnel (
    callsign,
    password_hash,
    rank,
    clearance_level,
    department,
    status
) VALUES (
    'God_Emperor',
    '\${hash}',
    'God_Emperor',
    999,
    'Imperial_Palace',
    'active'
);

SELECT id, callsign, rank, clearance_level, department, status, created_at 
FROM imperial_personnel 
WHERE callsign = 'God_Emperor';

INSERT INTO imperial_subjects (designation, classification, planet_of_origin, loyalty_status, notes)
VALUES 
    ('Kryptman', 'Inquisitor', 'Armageddon', 'excommunicated', 'Former Inquisitor Lord.'),
    ('Ahriman', 'Chaos_Sorcerer', 'Prospero', 'heretic', 'Exiled Thousand Sons Sorcerer.'),
    ('Eisenhorn', 'Inquisitor', 'Helican_Subsector', 'renegade', 'Radical Inquisitor.');

INSERT INTO imperial_casefiles (designation, threat_level, status, summary)
VALUES 
    ('Case_Omega_Kryptman', 'existential', 'active', 'Tracking Inquisitor Kryptman.'),
    ('Case_Ahriman_Seeking', 'alpha', 'active', 'Investigation into Ahriman.'),
    ('Case_Eisenhorn_Disappearance', 'high', 'cold', 'Last seen in Helican Subsector.');

INSERT INTO case_subject_links (case_id, subject_id, role)
VALUES 
    (1, 1, 'primary_suspect'),
    (2, 2, 'target'),
    (3, 3, 'person_of_interest');

INSERT INTO imperial_entities (entity_name, entity_type, classification, description, threat_rating)
VALUES 
    ('Hive_Fleet_Leviathan', 'xenos_organism', 'extreme', 'Largest known Tyranid Hive Fleet.', 10),
    ('Black_Library', 'location', 'unknown', 'Mythical repository of Eldar knowledge.', 8),
    ('Deathwatch', 'organization', 'imperial', 'Elite Chapter dedicated to xenos hunting.', 3);

SELECT 'DATABASE INITIALIZED WITH GOD_EMPEROR!' as status;
\`;

fs.writeFileSync('/home/$(whoami)/inquisition-db/database/init.sql', sql);
console.log('✅ SQL file created with God_Emperor!');
console.log('   Username: God_Emperor');
console.log('   Password: Ksusa');
console.log('   Clearance: 999');
console.log('   File: ~/inquisition-db/database/init.sql');
"