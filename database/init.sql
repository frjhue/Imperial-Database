cat > ~/inquisition-db/database/init.sql << 'EOF'
DROP TABLE IF EXISTS imperial_logs CASCADE;
DROP TABLE IF EXISTS imperial_blueprints CASCADE;
DROP TABLE IF EXISTS imperial_entities CASCADE;
DROP TABLE IF EXISTS imperial_evidence CASCADE;
DROP TABLE IF EXISTS imperial_reports CASCADE;
DROP TABLE IF EXISTS case_subject_links CASCADE;
DROP TABLE IF EXISTS imperial_casefiles CASCADE;
DROP TABLE IF EXISTS imperial_subjects CASCADE;
DROP TABLE IF EXISTS imperial_personnel CASCADE;

CREATE TABLE imperial_personnel (id SERIAL PRIMARY KEY, callsign TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, rank TEXT DEFAULT 'Adeptus_Scribe', clearance_level INTEGER DEFAULT 1, department TEXT DEFAULT 'Administratum', status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE imperial_subjects (id SERIAL PRIMARY KEY, designation TEXT NOT NULL, classification TEXT DEFAULT 'civilian', planet_of_origin TEXT, loyalty_status TEXT DEFAULT 'unknown', notes TEXT, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE imperial_casefiles (id SERIAL PRIMARY KEY, designation TEXT NOT NULL, threat_level TEXT DEFAULT 'low', status TEXT DEFAULT 'open', assigned_officer INTEGER REFERENCES imperial_personnel(id), summary TEXT, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE case_subject_links (id SERIAL PRIMARY KEY, case_id INTEGER REFERENCES imperial_casefiles(id) ON DELETE CASCADE, subject_id INTEGER REFERENCES imperial_subjects(id) ON DELETE CASCADE, role TEXT);
CREATE TABLE imperial_reports (id SERIAL PRIMARY KEY, case_id INTEGER REFERENCES imperial_casefiles(id) ON DELETE CASCADE, author_id INTEGER REFERENCES imperial_personnel(id), content TEXT, classification TEXT DEFAULT 'restricted', access_level INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE imperial_evidence (id SERIAL PRIMARY KEY, case_id INTEGER REFERENCES imperial_casefiles(id) ON DELETE CASCADE, uploaded_by INTEGER REFERENCES imperial_personnel(id), file_name TEXT, storage_path TEXT, evidence_type TEXT, access_level INTEGER DEFAULT 2, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE imperial_entities (id SERIAL PRIMARY KEY, entity_name TEXT NOT NULL, entity_type TEXT NOT NULL, classification TEXT DEFAULT 'unknown', description TEXT, linked_subject_id INTEGER REFERENCES imperial_subjects(id), linked_case_id INTEGER REFERENCES imperial_casefiles(id), threat_rating INTEGER DEFAULT 0, access_level INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE imperial_blueprints (id SERIAL PRIMARY KEY, blueprint_name TEXT NOT NULL, blueprint_type TEXT DEFAULT 'structure', author_id INTEGER REFERENCES imperial_personnel(id), classification TEXT DEFAULT 'restricted', data JSONB, status TEXT DEFAULT 'draft', access_level INTEGER DEFAULT 2, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE imperial_logs (id SERIAL PRIMARY KEY, actor_id INTEGER REFERENCES imperial_personnel(id), action TEXT, target_type TEXT, target_id INTEGER, timestamp TIMESTAMP DEFAULT NOW());

DELETE FROM imperial_personnel WHERE callsign = 'God_Emperor';

INSERT INTO imperial_personnel (callsign, password_hash, rank, clearance_level, department, status) 
VALUES ('God_Emperor', '$2b$10$VQctCEzMeny5vpiuUqsD8.patnZtmG6sdF0fa7tTE89kRSl1n/uom', 'God_Emperor', 999, 'Imperial_Palace', 'active');
EOF

sudo -u postgres psql -d internal_db -f ~/inquisition-db/database/init.sql