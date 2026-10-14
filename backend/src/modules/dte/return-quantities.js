const fail = message => { const error = new Error(message); error.statusCode = 409; throw error; };
const round = value => Math.round(Number(value) * 1e8) / 1e8;
const remainingItems = (sourceItems, reservedItems) => {
  const reserved = new Map();
  for (const item of reservedItems) {
    const id = Number(item.sourceInvoiceItemId);
    if (!sourceItems.some(source => Number(source.id) === id)) fail('Un retorno anterior no identifica su producto de origen. Solicite revisión antes de continuar.');
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) fail('Un retorno anterior tiene cantidades inválidas. Solicite revisión.');
    reserved.set(id, round((reserved.get(id) || 0) + quantity));
  }
  return sourceItems.map(item => ({
    id: item.id, description: item.description, code: item.code,
    quantity: Number(item.quantity), unitPrice: Number(item.unitPrice),
    reservedQuantity: reserved.get(Number(item.id)) || 0,
    availableQuantity: Math.max(0, round(Number(item.quantity) - (reserved.get(Number(item.id)) || 0)))
  }));
};
const validateSelection = (selection, available) => {
  if (!Array.isArray(selection) || !selection.length) fail('Seleccione al menos un producto y una cantidad para retornar');
  const seen = new Set();
  return selection.map(item => {
    const id = Number(item.sourceInvoiceItemId), quantity = Number(item.quantity);
    const source = available.find(row => Number(row.id) === id);
    if (!source || seen.has(id)) fail('La selección contiene un producto inválido o repetido');
    seen.add(id);
    if (!Number.isFinite(quantity) || quantity <= 0 || round(quantity) !== quantity) fail('Ingrese una cantidad mayor que cero con hasta ocho decimales');
    if (quantity > source.availableQuantity) fail(`La cantidad de ${source.description} supera lo disponible para retornar (${source.availableQuantity})`);
    return { sourceInvoiceItemId: id, quantity };
  });
};
module.exports = { remainingItems, validateSelection };
