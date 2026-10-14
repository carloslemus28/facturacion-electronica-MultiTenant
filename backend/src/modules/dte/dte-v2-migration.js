const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
module.exports = async () => {
  const qi = sequelize.getQueryInterface();
  for (const [table, name, definition] of [
    ['companies', 'additional_documents_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }],
    ['companies', 'electronic_events_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }],
    ['companies', 'allowed_event_types', { type: DataTypes.JSON, allowNull: true }],
    ['invoices', 'skip_stock_movement', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }],
    ['invoices', 'official_draft_json', { type: DataTypes.JSON, allowNull: true }],
    ['dte_events', 'invalidation_record_json', { type: DataTypes.JSON, allowNull: true }]
  ]) {
    const columns = await qi.describeTable(table);
    if (!columns[name]) {
      try { await qi.addColumn(table, name, definition); }
      catch (e) { if (!['ER_DUP_FIELDNAME', 'ER_DUP_COLUMNNAME'].includes(e.original?.code || e.parent?.code)) throw e; }
    }
  }
  // NULL marks existing companies not yet initialized. Once [] is saved, subsequent
  // restarts preserve the programmer's choices. New companies already default to [].
  await sequelize.transaction(async transaction => {
    const [companies] = await sequelize.query(
      'SELECT id, allowed_document_types FROM companies WHERE allowed_event_types IS NULL FOR UPDATE',
      { transaction }
    );
    for (const company of companies) {
      let enabled = company.allowed_document_types;
      if (typeof enabled === 'string') { try { enabled = JSON.parse(enabled); } catch { enabled = []; } }
      if (!Array.isArray(enabled)) enabled = ['01', '03'];
      enabled = enabled.filter(code => !['04', '06', '07', '08', '09', '15'].includes(String(code)));
      await sequelize.query(
        'UPDATE companies SET allowed_document_types = :documents, allowed_event_types = :events WHERE id = :id AND allowed_event_types IS NULL',
        { transaction, replacements: { id: company.id, documents: JSON.stringify(enabled), events: '[]' } }
      );
    }
  });
};
