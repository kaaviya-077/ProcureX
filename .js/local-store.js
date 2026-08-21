const prefix = 'procurex.temporary.';

// Each workspace area has its own key, keeping RFQs, vendors, quotations,
// orders, inventory, and finance records independent in this browser.
export const localDataKeys = Object.freeze([
  'rfqs', 'vendors', 'quotations', 'purchaseOrders', 'materials', 'financeRecords'
]);

export function isLocalDataRequest(path) {
  const route = path.split('?')[0];
  return [
    '/api/rfqs',
    '/api/vendors',
    '/api/quotations',
    '/api/ai/extract-quotation',
    '/api/scoring/rfq/',
    '/api/inventory/',
    '/api/purchase-orders',
    '/api/finance',
    '/api/dashboard/summary'
  ].some((localRoute) => route === localRoute || route.startsWith(localRoute));
}

function read(name) {
  try {
    const value = JSON.parse(localStorage.getItem(`${prefix}${name}`) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(name, records) {
  localStorage.setItem(`${prefix}${name}`, JSON.stringify(records));
}

function id(name) {
  return `${name.slice(0, 3).toUpperCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function add(name, record) {
  const records = read(name);
  records.unshift(record);
  write(name, records);
  return record;
}

function summary() {
  const rfqs = read('rfqs'), quotations = read('quotations'), purchaseOrders = read('purchaseOrders'), materials = read('materials'), vendors = read('vendors'), financeRecords = read('financeRecords');
  return {
    summary: {
      activeRfqs: rfqs.filter((item) => ['draft', 'sent'].includes(item.status)).length,
      quotations: quotations.length,
      purchaseOrders: purchaseOrders.filter((item) => !['received', 'cancelled', 'rejected'].includes(item.status)).length,
      lowStockItems: materials.filter((item) => Number(item.currentStock || 0) <= Number(item.reorderLevel || 0)).length,
      approvedVendors: vendors.filter((item) => ['approved', 'active'].includes(item.status)).length,
      outstandingAmount: financeRecords.reduce((total, item) => total + Number(item.outstandingAmount || 0), 0)
    },
    recentActivity: rfqs.slice(0, 5).map((item) => ({ title: `RFQ ${item.id} ${item.status}`, detail: item.material, status: item.status })),
    topVendors: vendors.slice(0, 3).map((item) => ({ name: item.companyName, score: Number(item.reliabilityScore || 0) }))
  };
}

function scoreQuotations(rfqId) {
  const quotations = read('quotations').filter((quote) => quote.rfqId === rfqId);
  const vendors = read('vendors');
  if (!quotations.length) return [];

  const lowestPrice = Math.min(...quotations.map((quote) => Number(quote.price || 0)));
  const fastestDelivery = Math.min(...quotations.map((quote) => Number(quote.deliveryDays || 0)));
  return quotations
    .map((quote) => {
      const vendor = vendors.find((item) => item.id === quote.vendorId) || {};
      const priceScore = lowestPrice ? Math.round((lowestPrice / Number(quote.price || lowestPrice)) * 100) : 0;
      const deliveryScore = fastestDelivery === 0 ? 100 : Math.round((fastestDelivery / Number(quote.deliveryDays || fastestDelivery)) * 100);
      const reliabilityScore = Number(vendor.reliabilityScore || 0);
      const qualityScore = Number(quote.quality || vendor.qualityScore || 0);
      const finalScore = Math.round((priceScore * 0.35) + (deliveryScore * 0.25) + (reliabilityScore * 0.2) + (qualityScore * 0.2));
      return { vendorId: quote.vendorId, vendorName: vendor.companyName || quote.vendorId || 'Local vendor', priceScore, deliveryScore, reliabilityScore, qualityScore, finalScore };
    })
    .sort((first, second) => second.finalScore - first.finalScore)
    .map((score, index) => ({ ...score, ranking: index + 1 }));
}

export function localApiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const route = path.split('?')[0];
  const body = options.body ? JSON.parse(options.body) : {};

  if (method === 'GET') {
    if (route === '/api/rfqs') return { rfqs: read('rfqs') };
    if (route === '/api/vendors') return { vendors: read('vendors') };
    if (route === '/api/vendors/pending') return { vendors: read('vendors').filter((item) => item.status === 'pending') };
    if (route === '/api/vendors/mine') return { vendor: read('vendors')[0] || null };
    if (route === '/api/quotations') return { quotations: read('quotations') };
    if (route === '/api/inventory/materials') return { materials: read('materials') };
    if (route === '/api/purchase-orders') return { purchaseOrders: read('purchaseOrders') };
    if (route === '/api/purchase-orders/pending-approvals') return { purchaseOrders: read('purchaseOrders').filter((item) => item.status === 'pending_approval') };
    if (route === '/api/finance/summary') {
      const records = read('financeRecords');
      const totalInvoiced = records.reduce((total, item) => total + Number(item.totalAmount || 0), 0);
      const outstanding = records.reduce((total, item) => total + Number(item.outstandingAmount || 0), 0);
      return { records, summary: { totalInvoiced, outstanding, paid: totalInvoiced - outstanding, openInvoices: records.filter((item) => item.outstandingAmount > 0).length } };
    }
    if (route === '/api/dashboard/summary') return summary();
    if (route.startsWith('/api/scoring/rfq/')) return { scores: scoreQuotations(decodeURIComponent(route.split('/').at(-1))) };
  }

  if (method === 'POST' && route === '/api/rfqs') {
    const rfq = add('rfqs', { id: id('rfq'), ...body, quantity: Number(body.quantity), budget: Number(body.budget), status: body.status || 'draft', matchedVendorIds: [], savedLocally: true, createdAt: new Date().toISOString() });
    return { rfq, inventoryCheck: { currentStock: 0, requiredQuantity: rfq.quantity, shortage: rfq.quantity, procurementRequired: true, warning: null }, temporary: true };
  }
  if (method === 'POST' && (route === '/api/vendors' || route === '/api/vendors/directory')) {
    const vendor = add('vendors', { id: id('vendor'), ...body, materials: body.materials || [], status: 'pending', reliabilityScore: 0, qualityScore: 0, historicalOrders: 0, savedLocally: true });
    return { vendor, temporary: true };
  }
  if (method === 'POST' && route === '/api/quotations') {
    const quotation = add('quotations', { id: id('quotation'), ...body, price: Number(body.price), quantity: Number(body.quantity), deliveryDays: Number(body.deliveryDays), status: 'submitted', extractionStatus: 'local_entry', savedLocally: true });
    return { quotation, temporary: true };
  }
  if (method === 'POST' && route === '/api/ai/extract-quotation') {
    return {
      extractedData: { price: null, quantity: null, deliveryDate: null, validity: null, specs: null },
      extractionStatus: 'manual_review',
      temporary: true
    };
  }
  if (method === 'POST' && route === '/api/inventory/materials') {
    const material = add('materials', { id: id('material'), ...body, currentStock: Number(body.currentStock), minimumStock: Number(body.minimumStock), reorderLevel: Number(body.reorderLevel), savedLocally: true });
    return { material, temporary: true };
  }
  if (method === 'POST' && route === '/api/purchase-orders') {
    const quote = read('quotations').find((item) => item.id === body.quotationId) || {};
    const purchaseOrder = add('purchaseOrders', { id: id('purchaseOrder'), poNumber: `PO-LOCAL-${Date.now().toString().slice(-6)}`, quotationId: body.quotationId, rfqId: quote.rfqId || '', vendorId: quote.vendorId || '', totalAmount: Number(quote.price || 0), currency: quote.currency || 'INR', expectedDeliveryDate: body.expectedDeliveryDate || quote.deliveryDate || '', paymentTerms: body.paymentTerms || '', status: 'pending_approval', savedLocally: true });
    return { purchaseOrder, temporary: true };
  }
  if (method === 'POST' && route === '/api/finance') {
    const amount = Number(body.amount || 0), tax = Number(body.tax || 0), paid = Number(body.paidAmount || 0), totalAmount = amount + tax;
    const financeRecord = add('financeRecords', { id: id('finance'), ...body, amount, tax, totalAmount, outstandingAmount: totalAmount - paid, invoiceStatus: 'received', paymentStatus: totalAmount === paid ? 'paid' : paid ? 'partially_paid' : 'outstanding', savedLocally: true });
    return { financeRecord, temporary: true };
  }
  if (method === 'POST' && route === '/api/inventory/receive') {
    const order = read('purchaseOrders').find((item) => item.id === body.purchaseOrderId || item.poNumber === body.purchaseOrderId);
    const material = read('materials').find((item) => item.id === order?.materialId || item.name === order?.material) || read('materials')[0];
    if (!material) throw new Error('Create an inventory material before receiving goods.');
    const materials = read('materials').map((item) => item.id === material.id ? { ...item, currentStock: Number(item.currentStock || 0) + Number(body.receivedQuantity || 0) } : item);
    write('materials', materials);
    return { material: materials.find((item) => item.id === material.id), temporary: true };
  }
  if (method === 'PATCH' && route.includes('/purchase-orders/')) {
    const orderId = route.split('/').at(-2);
    const records = read('purchaseOrders').map((item) => item.id === orderId || item.poNumber === orderId ? { ...item, ...body } : item);
    write('purchaseOrders', records);
    return { purchaseOrderId: orderId, ...body, temporary: true };
  }
  if (method === 'PATCH' && route.includes('/rfqs/')) {
    const rfqId = route.split('/').at(-2);
    const records = read('rfqs').map((item) => item.id === rfqId ? { ...item, ...body } : item);
    write('rfqs', records);
    return { rfqId, ...body, temporary: true };
  }
  if (method === 'POST' && route.includes('/rfqs/') && route.endsWith('/match-vendors')) {
    const rfqId = route.split('/').at(-2);
    const rfq = read('rfqs').find((item) => item.id === rfqId);
    const matchedVendors = read('vendors').filter((vendor) => ['approved', 'active'].includes(vendor.status) && (!rfq?.material || (vendor.materials || []).some((material) => String(material).toLowerCase().includes(String(rfq.material).toLowerCase()))));
    const records = read('rfqs').map((item) => item.id === rfqId ? { ...item, status: 'sent', matchedVendorIds: matchedVendors.map((vendor) => vendor.id) } : item);
    write('rfqs', records);
    return { matchedVendors, temporary: true };
  }
  if (method === 'PATCH' && route.includes('/vendors/')) {
    const vendorId = route.split('/').at(-2);
    const records = read('vendors').map((item, index) => item.id === vendorId || (vendorId === 'mine' && index === 0) ? { ...item, ...body } : item);
    write('vendors', records);
    return { vendorId, ...body, temporary: true };
  }
  if (method === 'PATCH' && route.includes('/finance/')) {
    const recordId = route.split('/').at(-2);
    const records = read('financeRecords').map((item) => {
      if (item.id !== recordId && item.invoiceNumber !== recordId) return item;
      const outstandingAmount = Math.max(0, Number(item.outstandingAmount || 0) - Number(body.amount || 0));
      return { ...item, outstandingAmount, paymentStatus: outstandingAmount ? 'partially_paid' : 'paid' };
    });
    write('financeRecords', records);
    return { financeRecordId: recordId, outstandingAmount: records.find((item) => item.id === recordId || item.invoiceNumber === recordId)?.outstandingAmount || 0, temporary: true };
  }
  throw new Error('This temporary local action is not available yet.');
}
