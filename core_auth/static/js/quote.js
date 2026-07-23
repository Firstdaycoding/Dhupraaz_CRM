// =========================================================================
// 1. GLOBAL INITIALIZATION & CONFIGURATION STATE
// =========================================================================
const tbody = document.getElementById('items-body');
const tableBody = document.querySelector('#items-body');
const quoteMode = document.body.dataset.quoteMode || 'new';
const isViewMode = quoteMode === 'view';
let rowCount = 0;
let currentSearchMatches = []; // Holds active runtime fetch results for mapping snapshots

const urlParams = new URLSearchParams(window.location.search);
const fromLeadId = urlParams.get('from_lead');

// when building the save URL:
const saveUrl = fromLeadId
  ? `/generate_quotation/?from_lead=${fromLeadId}`
  : `/generate_quotation/`;

// ---- Guarded static DOM component listeners ----
const discountInput = document.getElementById('discount');
if (discountInput) discountInput.addEventListener('input', recalc);

const printBtn = document.getElementById('print-btn');
if (printBtn) printBtn.addEventListener('click', () => window.print());

const addItemBtn = document.getElementById('add-item-btn');
if (addItemBtn) addItemBtn.addEventListener('click', () => addRow());

const saveBtn = document.getElementById('save-btn');
if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    submitQuote(saveUrl, "POST", "📋 Quotation saved successfully to database!", false);
  });
}

const updateBtn = document.getElementById('update-btn');
if (updateBtn) {
  updateBtn.addEventListener('click', () => {
    const quoteData = collectQuoteData();
    submitQuote(`/edit_quote/${quoteData.quotation_no}/`, "PUT", "📋 Quotation updated successfully in database!", true);
  });
}

// ---- Auto-hydration for default dates ----
const today = new Date();
const valid = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);
const iso = d => d.toISOString().split('T')[0];
const quotationDateInput = document.getElementById('quotation-date');
const validDateInput = document.getElementById('valid-date');

if (quotationDateInput && !quotationDateInput.value) quotationDateInput.value = iso(today);
if (validDateInput && !validDateInput.value) validDateInput.value = iso(valid);

// ---- Wire server-side / static markup elements already present on load ----
if (tbody) {
  tbody.querySelectorAll('tr').forEach(tr => {
    rowCount++;
    wireRow(tr);
    hydrateRowBomSnapshot(tr);
  });
  recalc();
}

// =========================================================================
// 2. GLOBAL EVENT DELEGATION DECORATORS (TABLE BODY ACTIONS)
// =========================================================================
if (tableBody) {
  // --- 2A. Realtime Input Listener for BOM Search Autocomplete Dropdowns ---
  tableBody.addEventListener('input', async (e) => {
    if (isViewMode) return;
    if (!e.target.classList.contains('item-name-input')) return;

    const inputField = e.target;
    const parentWrapper = inputField.closest('.billing-search-wrapper');
    const dropdown = parentWrapper.querySelector('.bom-suggestions-dropdown');
    const query = inputField.value.trim();

    if (query.length < 1) {
      if (dropdown) dropdown.classList.add('hidden');
      return;
    }

    try {
      const response = await fetch(`/boms/search/?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        dropdown.classList.add('hidden');
        return;
      }

      // Cache structural arrays locally so we don't have to embed strings directly in HTML attributes
      currentSearchMatches = data.results;

      dropdown.innerHTML = data.results.map((bom, index) => `
        <div class="suggestion-item" data-index="${index}" data-name="${bom.package_name}" data-price="${bom.grand_total}">
          <div>
            <div class="suggestion-title">${bom.package_name}</div>
            <div class="suggestion-meta">${bom.system_type} | ${bom.system_size}KW Template</div>
          </div>
          <div class="suggestion-price">₹${bom.grand_total}</div>
        </div>
      `).join('');

      dropdown.classList.remove('hidden');
    } catch (error) {
      showToast("Autocomplete fetch error:", error);
    }
  });

  // --- 2B. Click Listener to Handle Dropdown Selection & Snapshot Capture ---
  tableBody.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;

    const parentRow = item.closest('tr');
    const wrapper = item.closest('.billing-search-wrapper');
    const matchIndex = parseInt(item.dataset.index);
    const targetBOMData = currentSearchMatches[matchIndex];

    const hiddenStorage = parentRow.querySelector('.bom-snapshot-storage');
    if (hiddenStorage && targetBOMData && targetBOMData.bom_snapshot) {
      hiddenStorage.value = JSON.stringify(targetBOMData.bom_snapshot);
      const viewBtn = parentRow.querySelector('.view-bom-btn');
      if (viewBtn) viewBtn.style.display = 'inline-block';
    }
    const bomName = item.dataset.name;
    const bomPrice = parseFloat(item.dataset.price)
      || parseFloat(targetBOMData?.bom_snapshot?.grand_total)
      || 0;

    // Inject description and place BOM grand total into the row total column
    const nameInput = wrapper.querySelector('.item-name-input');
    nameInput.value = bomName;
    applyBomPriceToRow(parentRow, bomPrice);

    if (targetBOMData && targetBOMData.bom_snapshot) {
      nameInput.classList.add('bom-linked-item');
      nameInput.title = "Click to inspect template breakdown snapshot records.";
    }

    const dropdown = wrapper.querySelector('.bom-suggestions-dropdown');
    if (dropdown) {
      dropdown.innerHTML = '';
      dropdown.classList.add('hidden');
    }
  });

// --- 2C. Cleaned Up Click Listener to Open Snapshot Modal View ---
  tableBody.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('.view-bom-btn');
    if (!viewBtn) return;

    const parentRow = viewBtn.closest('tr');
    const hiddenStorage = parentRow.querySelector('.bom-snapshot-storage');

    const snapshot = parseBomSnapshot(hiddenStorage?.value);
    if (!snapshot) {
      showToast("No snapshot data available.", "info", 4000);
      return;
    }

    try {
      // If the object is empty, just exit quietly
      if (Object.keys(snapshot).length === 0) return;

      // Hydrate your overlay window text values safely
      document.getElementById('modal-bom-name').innerText = snapshot.name || "Unnamed Package";
      document.getElementById('modal-bom-meta').innerText = `System Type Profile: ${snapshot.system_type || 'N/A'}`;
      document.getElementById('modal-metric-size').innerText = `${snapshot.system_size_kw || '0'} kW`;
      const profitAmount = snapshot.profit_amount ?? snapshot.profit ?? 0;
      document.getElementById('modal-metric-profit').innerText = `₹${parseFloat(profitAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      document.getElementById('modal-metric-total').innerText = `₹${parseFloat(snapshot.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

      const itemsTableBody = document.getElementById('modal-bom-items-body');
      if (snapshot.items && snapshot.items.length > 0) {
        itemsTableBody.innerHTML = snapshot.items.map(item => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
              <strong>${item.description || item.item_name || item.name || 'Component'}</strong><br>
              <small style="color:#666">${[item.brand, item.specification].filter(Boolean).join(' | ') || '—'}</small>
            </td>
            <td style="text-align:center; padding: 8px; border-bottom: 1px solid #eee;">${item.quantity ?? item.qty ?? 1}</td>
            <td style="text-align:right; padding: 8px; border-bottom: 1px solid #eee;">₹${parseFloat(item.unit_price || item.price || 0).toFixed(2)}</td>
          </tr>
        `).join('');
      } else {
        itemsTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:#999;">No sub-items inside snapshot object.</td></tr>`;
      }

      document.getElementById('bom-view-modal').classList.remove('hidden');

    } catch (err) {
      showToast(err, "info", 4000);
    }
  });
// ---- Global Modal Backdrop & Close Button Trigger Closures ----
document.getElementById('close-bom-modal')?.addEventListener('click', () => {
  document.getElementById('bom-view-modal').classList.add('hidden');
});

document.getElementById('bom-view-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'bom-view-modal') {
    document.getElementById('bom-view-modal').classList.add('hidden');
  }
});
}

// =========================================================================
// 3. CORE FUNCTIONAL UTILITY LIBRARY (ALPHABETICAL / OPERATIONAL LIST)
// =========================================================================

function addRow(data) {
  data = data || {};
  rowCount++;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="num">${rowCount}</td>
    <td>
      <div class="billing-search-wrapper">
        <input type="text" class="desc item-name-input" placeholder="Search Template Package..." value="" autocomplete="off">
        <button type="button" class="view-bom-btn" title="View BOM Breakdown">👁️</button>
        <input type="hidden" class="bom-snapshot-storage" name="bom_snapshot" value="">
        <div class="bom-suggestions-dropdown hidden"></div>
      </div>
    </td>
    <td><input type="number" class="qty num" value="${data.qty != null ? data.qty : 1}" min="0" style="text-align:center"></td>
    <td><input type="number" class="price num" value="0.00" min="0" style="text-align:right"></td>
    <td><input type="number" class="gst num" value="${data.gst != null ? data.gst : 18}" min="0" style="text-align:center"></td>
    <td class="row-total num"><input type="number" class="row-total-input" value="${data.price != null ? data.price : 0}" style="text-align:right"></td>
    <td><button type="button" class="remove-row" title="Remove row">✕</button></td>
  `;
  tbody.appendChild(tr);
  wireRow(tr);
  recalc();
}

function collectQuoteData() {
  const quoteData = {
    quotation_no: document.getElementById('quotation-no').value,
    date: document.getElementById('quotation-date').value,
    valid_till: document.getElementById('valid-date').value,
    customer: {
      name: document.getElementById('customer-name').value,
      phone: document.getElementById('customer-phone').value,
      ca_number: document.getElementById('customer-ca-number').value,
      address: document.getElementById('customer-address').value
    },
    project: {
      type: document.getElementById('project-type').value,
      size: parseFloat(document.getElementById('system-size').value)
    },
    items: [],
    subtotal: parseFloat(document.getElementById('subtotal').value.replace(/,/g, '')) || 0,
    gst_total: parseFloat(document.getElementById('gst-total').value.replace(/,/g, '')) || 0,
    discount: parseFloat(document.getElementById('discount').value) || 0,
    grand_total: parseFloat(document.getElementById('grand-total').value.replace(/,/g, '')) || 0
  };

  tbody.querySelectorAll('tr').forEach(tr => {
    const snapshot = parseBomSnapshot(tr.querySelector('.bom-snapshot-storage')?.value || "");
    const gstInput = tr.querySelector('.gst');
    const gstValue = gstInput ? parseFloat(gstInput.value) : NaN;

    quoteData.items.push({
      description: tr.querySelector('.desc').value,
      quantity: parseFloat(tr.querySelector('.qty').value) || 0,
      unit_price: parseFloat(tr.querySelector('.price').value) || 0,
      gst_percentage: Number.isFinite(gstValue) ? gstValue : 0,
      bom_snapshot: snapshot
    });
  });

  return quoteData;
}

function currency(n) {
  return (isNaN(n) ? 0 : n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCookie(name) {
  const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

function numFormat(n) {
  return (isNaN(n) ? 0 : n).toFixed(2);
}

function applyBomPriceToRow(tr, bomGrandTotal) {
  const total = parseFloat(bomGrandTotal) || 0;
  setRowTotal(tr, numFormat(total));
  recalcPriceFromTotal(tr);
}

function hydrateRowBomSnapshot(tr) {
  const hiddenStorage = tr.querySelector('.bom-snapshot-storage');
  const viewBtn = tr.querySelector('.view-bom-btn');
  if (!hiddenStorage) return;

  const snapshot = parseBomSnapshot(hiddenStorage.value);
  if (!snapshot) return;

  if (viewBtn) viewBtn.style.display = 'inline-block';

  const nameInput = tr.querySelector('.item-name-input');
  if (nameInput) {
    nameInput.classList.add('bom-linked-item');
    nameInput.title = "Click to inspect template breakdown snapshot records.";
  }
}

function parseBomSnapshot(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'None' || trimmed === 'null' || /^bom-data-\d+$/.test(trimmed)) {
    return null;
  }

  try {
    const snapshot = JSON.parse(trimmed);
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  } catch (err) {
    showToast(err, 'error');
    return null;
  }
}

function recalc() {
  let subtotal = 0, gstTotal = 0;
  tbody.querySelectorAll('tr').forEach(tr => {
    const qty = parseFloat(tr.querySelector('.qty').value) || 0;
    const price = parseFloat(tr.querySelector('.price').value) || 0;
    const gstPct = parseFloat(tr.querySelector('.gst').value) || 0;
    const lineBase = qty * price;
    const lineGst = lineBase * (gstPct / 100);
    subtotal += lineBase;
    gstTotal += lineGst;
    setRowTotal(tr, numFormat(lineBase + lineGst));
  });

  const discountInput = document.getElementById('discount');
  const discount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
  const grand = subtotal + gstTotal - discount;

  document.getElementById('subtotal').value = currency(subtotal);
  document.getElementById('gst-total').value = currency(gstTotal);
  document.getElementById('grand-total').value = currency(grand < 0 ? 0 : grand);
}

function recalcPriceFromTotal(tr) {
  const totalInput = tr.querySelector('.row-total input');
  const total = parseFloat((totalInput.value || '0').toString().replace(/,/g, '')) || 0;
  const qty = parseFloat(tr.querySelector('.qty').value) || 0;
  const gstPct = parseFloat(tr.querySelector('.gst').value) || 0;
  const divisor = qty * (1 + gstPct / 100);

  const priceInput = tr.querySelector('.price');
  priceInput.value = divisor !== 0 ? (total / divisor).toFixed(2) : 0;

  recalc();
}

function renumber() {
  rowCount = 0;
  tbody.querySelectorAll('tr').forEach(tr => {
    rowCount++;
    tr.querySelector('td:first-child').textContent = rowCount;
  });
}

function setRowTotal(tr, value) {
  const cell = tr.querySelector('.row-total');
  const input = cell.querySelector('input');
  if (input) input.value = value;
  else cell.textContent = value;
}

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) { console.warn('No #toast-container found; message was:', message); return; }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-message"></span><button type="button" class="toast-close" aria-label="Dismiss">✕</button>`;
  toast.querySelector('.toast-message').textContent = message;

  const remove = () => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 200);
  };
  toast.querySelector('.toast-close').addEventListener('click', remove);
  const timer = setTimeout(remove, duration);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));

  container.appendChild(toast);
}

function submitQuote(url, method, successMessage, requireQuotationNo) {
  const quoteData = collectQuoteData();
  if (!validateQuoteData(quoteData, requireQuotationNo)) return;

  fetch(url, {
    method: method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie('csrftoken')
    },
    credentials: 'same-origin',
    body: JSON.stringify(quoteData)
  })
  .then(async response => {
    if (response.ok) {
      showToast(successMessage, "success");
      setTimeout(() => { window.location.href = "/dashboard/"; }, 1200);
    } else {
      const errText = await response.text();
      showToast(errText, "error");
    }
  })
  .catch(error => {
    showToast(error, "error");
  });
}

function validateQuoteData(quoteData, requireQuotationNo) {
  if (quoteData.items.length === 0) {
    showToast("Please add at least one item to the quotation before saving.", "error");
    return false;
  }
  const required = [quoteData.customer.name, quoteData.customer.phone, quoteData.date, quoteData.valid_till];
  if (requireQuotationNo) required.push(quoteData.quotation_no);
  if (required.some(f => !f)) {
    showToast("Please fill in all required fields.", "error");
    return false;
  }
  return true;
}

function wireRow(tr) {
  if (isViewMode) return;

  tr.querySelectorAll('.qty, .price, .gst').forEach(inp => inp.addEventListener('input', recalc));

  const totalInput = tr.querySelector('.row-total input');
  if (totalInput) {
    totalInput.removeAttribute('readonly');
    totalInput.style.pointerEvents = '';
    totalInput.addEventListener('input', () => recalcPriceFromTotal(tr));
  }

  const removeBtn = tr.querySelector('.remove-row');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      tr.remove();
      renumber();
      recalc();
    });
  }
}

function goToDashboard() {
    window.location.href = "/dashboard/";
}
