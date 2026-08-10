USE facturacion_electronica_sv;

ALTER TABLE invoices
  ADD COLUMN tipo_modelo INT NOT NULL DEFAULT 1 AFTER issued_at,
  ADD COLUMN tipo_operacion INT NOT NULL DEFAULT 1 AFTER tipo_modelo,
  ADD COLUMN tipo_contingencia INT NULL AFTER tipo_operacion,
  ADD COLUMN motivo_contin VARCHAR(500) NULL AFTER tipo_contingencia;

ALTER TABLE dte_events
  MODIFY COLUMN event_type_code ENUM('17','18','19') NOT NULL,
  ADD COLUMN contingency_started_at DATETIME NULL AFTER issued_at,
  ADD COLUMN contingency_ended_at DATETIME NULL AFTER contingency_started_at,
  ADD COLUMN responsible_name VARCHAR(100) NULL AFTER contingency_ended_at,
  ADD COLUMN responsible_document_type VARCHAR(2) NULL AFTER responsible_name,
  ADD COLUMN responsible_document_number VARCHAR(25) NULL AFTER responsible_document_type;

CREATE INDEX idx_dte_events_company_type_contingency_started
  ON dte_events (company_id, event_type_code, contingency_started_at);
