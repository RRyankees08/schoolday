PRAGMA foreign_keys = ON;

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  short_name TEXT,
  period TEXT,
  teacher TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE course_mappings (
  id TEXT PRIMARY KEY,
  schoolday_course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  canvas_course_id TEXT,
  studentvue_course_id TEXT,
  belllogic_period_id TEXT,
  match_method TEXT NOT NULL DEFAULT 'manual',
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX course_mappings_canvas_idx
  ON course_mappings(canvas_course_id) WHERE canvas_course_id IS NOT NULL;
CREATE UNIQUE INDEX course_mappings_studentvue_idx
  ON course_mappings(studentvue_course_id) WHERE studentvue_course_id IS NOT NULL;

CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('canvas')),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TEXT,
  points_possible REAL,
  external_url TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(source, external_id)
);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  submitted INTEGER NOT NULL DEFAULT 0 CHECK (submitted IN (0, 1)),
  state TEXT NOT NULL,
  submitted_at TEXT,
  captured_at TEXT NOT NULL
);

CREATE INDEX submissions_assignment_captured_idx
  ON submissions(assignment_id, captured_at DESC);

CREATE TABLE grade_snapshots (
  captured_at TEXT PRIMARY KEY
);

CREATE TABLE course_grade_snapshots (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  percentage REAL,
  letter_grade TEXT,
  raw_display TEXT,
  grading_period TEXT,
  captured_at TEXT NOT NULL
);

CREATE INDEX course_grade_snapshots_course_captured_idx
  ON course_grade_snapshots(course_id, captured_at DESC);
CREATE INDEX course_grade_snapshots_captured_idx
  ON course_grade_snapshots(captured_at DESC);

CREATE TABLE gradebook_assignment_snapshots (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  points_earned REAL,
  points_possible REAL,
  percentage REAL,
  missing INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0, 1)),
  excused INTEGER NOT NULL DEFAULT 0 CHECK (excused IN (0, 1)),
  graded_at TEXT,
  captured_at TEXT NOT NULL
);

CREATE INDEX gradebook_assignment_snapshots_assignment_captured_idx
  ON gradebook_assignment_snapshots(assignment_id, captured_at DESC);
CREATE INDEX gradebook_assignment_snapshots_captured_idx
  ON gradebook_assignment_snapshots(captured_at DESC);

CREATE TABLE grade_changes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'course_grade_changed',
      'assignment_graded',
      'assignment_score_changed',
      'missing_status_changed'
    )
  ),
  previous_value TEXT,
  current_value TEXT,
  assignment_id TEXT,
  assignment_title TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (acknowledged IN (0, 1))
);

CREATE INDEX grade_changes_detected_idx ON grade_changes(detected_at DESC);
CREATE INDEX grade_changes_course_detected_idx ON grade_changes(course_id, detected_at DESC);

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('canvas', 'studentVue', 'bellLogic')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  records_processed INTEGER,
  error_message TEXT
);

CREATE INDEX sync_runs_provider_started_idx ON sync_runs(provider, started_at DESC);

CREATE TABLE user_settings (
  owner_key TEXT NOT NULL DEFAULT 'default',
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_key, setting_key)
);
