// ---Constants Declaration---
const saveBtn = document.getElementById('invoice-save-btn');
const updateBtn = document.getElementById('invoice-update-btn');
const printBtn = document.getElementById('invoice-print-btn');
const addBtn = document.getElementById('invoice-add-item-btn');
const tbody = document.getElementById('invoice-items-body');
let rowCount = 0;
let currentSearchMatches = [];
const urlParams = new URLSearchParams(window.location.search);
const fromQuoteId = urlParams.get('from_quote');

// when building the save URL:
const saveUrl = fromQuoteId
  ? `/generate_invoice/?from_quote=${fromQuoteId}`
  : `/generate_invoice/`

// View - Click View - View Bill/Bill id - returns Bill data + render read only page.
// Edit - Click Edit - Edit Bill/Bill id - return Bill data + render page - edit - Save.

// ---Initialization---

const today = new Date();
const valid = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);
const iso = d => d.toISOString().split('T')[0];
const invoiceDate = document.getElementById('invoice-date');
if (invoiceDate && !invoiceDate.value) invoiceDate.value = iso(today);

if(tbody){
    tbody.querySelectorAll("tr").forEach(row => {
        rowCount++;
        wireRow(row);
    });
}
document.getElementById('invoice-discount').addEventListener('input', recalc)
if(tbody.querySelectorAll("tr").length == 0){
    addRow();
}

// ===========  2.Top Buttons  ==============

if(addBtn) addBtn.addEventListener('click', () => addRow());
if(printBtn)printBtn.addEventListener('click', () => window.print());
if(saveBtn){
    saveBtn.addEventListener('click', () => {
        const data = collectInvoiceData();
        const checkResult = validateInvoiceData(data);
        if (!checkResult.valid) {
            showToast(`Validation failed: ${checkResult.error}`, 'error');
        }
        else{
            fetch(saveUrl, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie('csrftoken')
    },
    credentials: 'same-origin',
    body: JSON.stringify(data)
})
.then(response => {
    if (!response.ok) {
        throw new Error(`HTTP network error! Status: ${response.status}`);
    }
    return response.json();
})
.then(data => {
    if (data.status === "success") {
        showToast('Invoice saved successfully.', 'success');
        window.location.href = `/view_invoice/${data.invoice_id}`;
    } else {
        showToast(`Unable to save invoice: ${data.message}`, 'error');
    }
})
.catch(() => {
    showToast('Could not save invoice. Please try again.', 'error');
});
 
}})
}
if(updateBtn){
    updateBtn.addEventListener('click', () => {
        const data = collectInvoiceData();
        const checkResult = validateInvoiceData(data);
        const invoice_id = document.getElementById('invoice-no').value
        if (!checkResult.valid) {
            showToast(`Validation failed: ${checkResult.error}`, 'error');
        }
        else{
            fetch(`/edit_invoice/${invoice_id}/`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie('csrftoken')
    },
    credentials: 'same-origin',
    body: JSON.stringify(data)
})
.then(response => {
    if (!response.ok) {
        throw new Error(`HTTP network error! Status: ${response.status}`);
    }
    return response.json();
})
.then(data => {
    if (data.status === "success") {
        showToast(data.message || 'Invoice updated successfully.', 'success');
        setTimeout(() => { window.location.href = "/dashboard/"; }, 1200);
    } else {
        showToast(`Unable to update invoice: ${data.message}`, 'error');
    }
})
.catch(() => {
    showToast('Could not update invoice. Please try again.', 'error');
});
}})
}

// ===========  2.Ajax Suggestion  ==============
// --- PART 2A: Backend Api Search Via Query ---
tbody.addEventListener('input', async (e) => {
    const rowInput = e.target.closest('.item-name-input');
    if (!rowInput) return;
    const parentWrapper = rowInput.closest('.billing-search-wrapper');
    if (!parentWrapper) return;
    const dropdown = parentWrapper.querySelector('.bom-suggestions-dropdown');
    const query = rowInput.value.trim();

    if (query.length < 1) {
        if (dropdown) dropdown.classList.add('hidden');
        return;
    }

    try {
        const response = await fetch(`/boms/search/?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (!dropdown) return;

        if (!data.results || data.results.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }
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
        showToast('Unable to load BOM suggestions right now.', 'error');
    }
});
// --- PART 2B: Row Population And Calculation  ---
tbody.addEventListener('click', (e) => {
    const targetItem = e.target.closest('.suggestion-item');
    if (!targetItem) return;

    const parentWrapper = targetItem.closest('.billing-search-wrapper');
    const currentRow = targetItem.closest('tr');
    
    if (!parentWrapper || !currentRow) return;

    const index = targetItem.getAttribute('data-index');
    const name = targetItem.getAttribute('data-name');
    const price = targetItem.getAttribute('data-price');
    
    const selectedBom = currentSearchMatches[index];

    // 1. Assign Name/Description
    const descInput = currentRow.querySelector('.item-name-input');
    if (descInput) descInput.value = name;

    // 2. Assign Unit Price
    const priceInput = currentRow.querySelector('.row-total-input');
    if (priceInput) priceInput.value = price;
    
    // 3. Assign Quantity Default
    const qtyInput = currentRow.querySelector('.qty');
    if (qtyInput && (!qtyInput.value || parseFloat(qtyInput.value) === 0)) {
        qtyInput.value = 1;
    }

    // 4. Save BOM snapshots and index name attributes safely
    const hiddenStorage = currentRow.querySelector('.bom-snapshot-storage');
    if (hiddenStorage && selectedBom) {
        hiddenStorage.value = JSON.stringify(selectedBom.bom_snapshot || selectedBom.bom_structure || selectedBom);
        
        const currentIdText = currentRow.querySelector('.num').innerText;
        const currentIdNum = parseInt(currentIdText) || 1;
        hiddenStorage.setAttribute('name', `bom_snapshot_${currentIdNum - 1}`);

        // Reveal the Eye icon button element
        const viewBtn = currentRow.querySelector('.view-bom-btn');
        if (viewBtn) {
            viewBtn.style.display = 'inline-block';
        }
    }
    const dropdown = parentWrapper.querySelector('.bom-suggestions-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    // 5. Fire standard matrix math recalculations
    if (typeof recalcPriceFromTotal === 'function') recalcPriceFromTotal(currentRow);
});
// --- PART 2C: Dynamic Modal Opening Framework (via Event Delegation) ---
tbody.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('.view-bom-btn');
    if (!viewBtn) return; 

    const parentRow = viewBtn.closest('tr');
    const hiddenStorage = parentRow.querySelector('.bom-snapshot-storage');

    if (!hiddenStorage || !hiddenStorage.value || hiddenStorage.value.trim() === "") {
        showToast('No BOM snapshot data is available for this line item.', 'error');
        return;
    }

    try {
        let snapshot;
        try {
            let rawValue = hiddenStorage.value.trim();
            if (rawValue.startsWith("{'") || rawValue.startsWith("['")) {
                rawValue = rawValue.replace(/'/g, '"');
            }
            snapshot = JSON.parse(rawValue);
        } catch (e) {
            showToast('Could not process this item’s BOM configuration.', 'error');
            return;
        }
        if (Object.keys(snapshot).length === 0) return;

        document.getElementById('modal-bom-name').innerText = snapshot.name || snapshot.package_name || "Unnamed Package";
        document.getElementById('modal-bom-meta').innerText = `System Profile: ${snapshot.system_type || 'Standard'}`;
        document.getElementById('modal-metric-size').innerText = `${snapshot.system_size_kw || snapshot.system_size || '0'} kW`;
        document.getElementById('modal-metric-profit').innerText = `₹${currency(snapshot.profit) || '0'} `;
        document.getElementById('modal-metric-total').innerText = `₹${currency(snapshot.grand_total) || 0}`;

        const itemsTableBody = document.getElementById('modal-bom-items-body');
        const itemsList = snapshot.items || snapshot.bom_items || [];
        
        if (itemsList.length > 0) {
            itemsTableBody.innerHTML = itemsList.map(item => `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">
                        <strong>${item.description}</strong><br>
                    </td>
                    <td style="text-align:center; padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}</td>
                    <td style="text-align:right; padding: 8px; border-bottom: 1px solid #eee;">₹${parseFloat(item.unit_price).toFixed(2)}</td>
                </tr>
            `).join('');
        } else {
            itemsTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:#999;">No sub-components mapped inside this snapshot asset.</td></tr>`;
        }
        const modalContainer = document.getElementById('bom-view-modal');
        if (modalContainer) {
            modalContainer.classList.remove('hidden');
        } else {
            showToast('The BOM details modal is unavailable right now.', 'error');
        }
    } catch (err) {
        showToast('Unable to display the BOM breakdown.', 'error');
    }
});
document.getElementById('close-bom-modal')?.addEventListener('click', () => {
  document.getElementById('bom-view-modal').classList.add('hidden');
});
document.getElementById('bom-view-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'bom-view-modal') {
    document.getElementById('bom-view-modal').classList.add('hidden');
  }
});

// ===========  3.Functions  ==============
function addRow(data = {}){
    rowCount++;
    const tr = document.createElement("tr");
    tr.innerHTML = `
                <td class="num">${rowCount}</td>
                <td>
                    <div class="billing-search-wrapper">
                        <input type="text" class="desc item-name-input" placeholder="Seach Template Package..." value="${data.description != null ? data.description : ""}" autocomplete="off">
                        <button type="button" class="view-bom-btn" title="View BOM Breakdown">👁️</button>
                        <input type="hidden" class="bom-snapshot-storage" name="bom_snapshot" value="${data.bom_snapshot != null ? data.bom_snapshot : ""}">
                        <div class="bom-suggestions-dropdown hidden"></div>
                    </div>
                </td>
                <td><input type="number" class="qty num" value="${data.quantity != null ? data.quantity : 1}" min="0" style="text-align:center"></td>
                <td><input type="number" class="price num" value="${data.unit_price != null ? data.unit_price : 0}" min="0" style="text-align:right"></td>
                <td><input type="number" class="gst num" value="${data.gst != null ? data.gst : 18}" min="0" style="text-align:center"}></td>
                <td class="row-total num"><input type="number" class="row-total-input" value="${data.price != null ? data.price : 0}" min="0" style="text-align:right"></td>
                <td><button type="button" class="remove-row" title="Remove row">✕</button></td>
    `
    tbody.appendChild(tr);
    wireRow(tr);
}
function currency(n) {
  return (isNaN(n) ? 0 : n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function numFormat(n) {
  return (isNaN(n) ? 0 : n).toFixed(2);
}
function parseBomSnapshot(raw) {
function parseBomSnapshot(rawString) {
    if (!rawString) return {};
    
    try {
        let validJsonString = rawString
            .replace(/'/g, '"')
            .replace(/True/g, 'true')
            .replace(/False/g, 'false')
            .replace(/None/g, 'null');
            
        return JSON.parse(validJsonString);
        
    } catch (e) {
        showToast('Unable to read the BOM snapshot data.', 'error');
        return {};
    }
}
}
function getCookie(name) {
  const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}
function recalc(){
    let subTotal = 0;
    let gstTotal = 0;
    tbody.querySelectorAll('tr').forEach(row => {
        const qty = parseFloat(row.querySelector('.qty').value) || 0;
        const price = parseFloat(row.querySelector('.price').value) || 0;
        const gstPct = parseFloat(row.querySelector('.gst').value) || 0;
        const lineBase = qty * price;
        const lineGst = lineBase * (gstPct / 100);
        subTotal += lineBase;
        gstTotal += lineGst;
        setRowTotal(row, numFormat(lineBase + lineGst));
    });
    const discountInput = document.getElementById('invoice-discount');
    const discount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
    const grand = subTotal + gstTotal - discount;

    document.getElementById('invoice-subtotal').value = currency(subTotal);
    document.getElementById('invoice-gst-total').value = currency(gstTotal);
    document.getElementById('invoice-grand-total').value = currency(grand < 0 ? 0 : grand);
}
function recalcPriceFromTotal(tr) {
  const totalInput = tr.querySelector('.row-total-input');

  const total = parseFloat((totalInput.value || '0').toString().replace(/,/g, '')) || 0;
  const qty = parseFloat(tr.querySelector('.qty').value) || 0;
  const gstPct = parseFloat(tr.querySelector('.gst').value) || 0;
  const divisor = qty * (1 + gstPct / 100);

  const priceInput = tr.querySelector('.price');
  priceInput.value = divisor !== 0 ? (total / divisor).toFixed(2) : 0;

  recalc();
}
function setRowTotal(tr, value) {
  const cell = tr.querySelector('.row-total');
  const input = cell.querySelector('input');
  if (input) input.value = value;
  else cell.textContent = value;
}
function renumber() {
  rowCount = 0;
  tbody.querySelectorAll('tr').forEach(tr => {
    rowCount++;
    tr.querySelector('td:first-child').textContent = rowCount;
  });
}
function wireRow(tr){
    tr.querySelectorAll('.qty, .gst, .price').forEach(inp => inp.addEventListener('input', recalc));
    tr.querySelector('.row-total').addEventListener('change', () => recalcPriceFromTotal(tr));

    const removeBtn = tr.querySelector('.remove-row');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
        tr.remove();
        renumber();
        recalc();
        });
  }
}
function collectInvoiceData() {
    const urlParams = new URLSearchParams(window.location.search);
    const quoteId = urlParams.get('from_quote') || null;
    const quoteData = {
        invoice_number: document.getElementById('invoice-no').value,
        date: document.getElementById('invoice-date').value,
        customer: {
        name: document.getElementById('invoice-customer-name').value,
        phone: document.getElementById('invoice-customer-phone').value,
        ca_number: document.getElementById('invoice-customer-ca-number').value, // Gathered, but skipped in validation!
        address: document.getElementById('invoice-customer-address').value
        },
        project: {
        type: document.getElementById('invoice-project-type').value,
        size: document.getElementById('invoice-system-size').value
        },
        items: [],
        subtotal: parseFloat(document.getElementById('invoice-subtotal').value.replace(/,/g, '')) || 0,
        gst_total: parseFloat(document.getElementById('invoice-gst-total').value.replace(/,/g, '')) || 0,
        discount: parseFloat(document.getElementById('invoice-discount').value) || 0,
        grand_total: parseFloat(document.getElementById('invoice-grand-total').value.replace(/,/g, '')) || 0
  };
  if(quoteId){
    quoteData.quotationid = quoteId;
  }

  tbody.querySelectorAll('tr').forEach(tr => {
      const gstInput = tr.querySelector('.gst');
      const gstValue = gstInput ? parseFloat(gstInput.value) : NaN;
      const hiddenStorageElement = tr.querySelector('.bom-snapshot-storage');
      let snapshotData = parseBomSnapshot(hiddenStorageElement?.value || "");

    quoteData.items.push({
      description: tr.querySelector('.desc').value,
      quantity: parseFloat(tr.querySelector('.qty').value) || 0,
      unit_price: parseFloat(tr.querySelector('.price').value) || 0,
      gst_percentage: Number.isFinite(gstValue) ? gstValue : 0,
      bom_snapshot: snapshotData
    });
  });
  return quoteData;
}
function validateInvoiceData(data) {
    if (!data.date) return { valid: false, error: "Invoice date is required." };

    if (!data.customer.name.trim()) return { valid: false, error: "Customer Name is required." };
    if (!data.customer.phone.trim()) return { valid: false, error: "Customer Phone Number is required." };
    if (!data.customer.address.trim()) return { valid: false, error: "Customer Address is required." };

    if (!data.project.type.trim()) return { valid: false, error: "Project Type (e.g., On-Grid) is required." };
    if (!data.project.size.trim()) return { valid: false, error: "System Size capacity (e.g., 5kW) is required." };

    if (!data.items || data.items.length < 1) {
        return { valid: false, error: "Your invoice layout must contain at least 1 item line row entry." };
    }

    for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        if (!item.description.trim()) {
            return { valid: false, error: `Row #${i + 1} is missing an item description or package assignment.` };
        }
        if (item.quantity <= 0) {
            return { valid: false, error: `Row #${i + 1} must have a quantity greater than zero.` };
        }
    }

    return { valid: true, error: null };
}
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

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

function goToDashboard() {
    window.location.href = "/dashboard/";
}
recalc();