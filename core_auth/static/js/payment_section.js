function closeInvoicePicker() {
    document.getElementById('invoicePickerModal').style.display = 'none';
}
function openInvoicePicker(){
    document.getElementById('invoicePickerModal').style.display = 'flex';
}
function filterPickerInvoices() {
    const query = document.getElementById('invoiceSearchInput').value.toLowerCase();
    const items = document.querySelectorAll('.inv-picker-item');

    items.forEach(item => {
        const text = item.getAttribute('data-invoice-id').toLowerCase() + " " + 
                     item.getAttribute('data-client').toLowerCase();
        
        if (text.includes(query)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}
function applyDateFilter() {
    const startDateVal = document.getElementById("startDate").value;
    const endDateVal = document.getElementById("endDate").value;
    if (!startDateVal || !endDateVal) return;
    const filterStart = new Date(startDateVal);
    const filterEnd = new Date(endDateVal);
    const nodata = document.getElementById('paymentsEmptyState');
    let runningTotal = 0;
    
    filterEnd.setHours(23, 59, 59, 999);
    const paymentRows = document.querySelectorAll(".payment-activity-row");
    paymentRows.forEach(row => {
        if (row.classList.contains("row-is-voided")) {
            row.style.display = "none";
            return;
        }
        const dateText = row.querySelector(".payment-timestamp")?.innerText.trim();
        const paymentDate = new Date(dateText);

        if (paymentDate >= filterStart && paymentDate <= filterEnd) {
            row.style.display = "grid"; // Keep visible
            const amountText = row.querySelector(".payment-amount-display")?.innerText || "0";
            const amountNum = parseFloat(amountText.replace(/[^0-9.-]+/g, "")) || 0;
            runningTotal += amountNum;
        } else {
            row.style.display = "none";
        }
        if(runningTotal == 0) nodata.style.display = 'flex';
        else nodata.style.display = 'none';
    });
    document.getElementById("collectedAmountDisplay").innerText = 
        "₹" + runningTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let showVoided = true; 

function toggleVoidPayments() {
    showVoided = !showVoided;
    const btn = document.getElementById("toggleVoidBtn");
    const voidRows = document.querySelectorAll(".payment-activity-row.row-is-voided");

    // 1. Update button text & style
    if (btn) {
        btn.innerText = showVoided ? "Hide Voided" : "Show Voided";
        btn.classList.toggle("is-hidden-state", !showVoided);
    }

    // 2. Toggle visibility for voided rows
    voidRows.forEach(row => {
        if (showVoided) {
            // Check if date filter is active; if active, re-verify dates before showing
            const startDateVal = document.getElementById("startDate")?.value;
            const endDateVal = document.getElementById("endDate")?.value;

            if (startDateVal && endDateVal) {
                const dateText = row.querySelector(".payment-timestamp")?.innerText.trim();
                const paymentDate = new Date(dateText);
                const filterStart = new Date(startDateVal);
                const filterEnd = new Date(endDateVal);
                filterEnd.setHours(23, 59, 59, 999);

                if (paymentDate >= filterStart && paymentDate <= filterEnd) {
                    row.style.display = "grid";
                }
            } else {
                row.style.display = "grid";
            }
        } else {
            row.style.display = "none";
        }
    });
}

function resetDateFilter() {
    document.getElementById("startDate").value = "";
    document.getElementById("endDate").value = "";
    
    const paymentRows = document.querySelectorAll(".payment-activity-row");
    paymentRows.forEach(row => {
        if (row.classList.contains("row-is-voided")) {
            row.style.display = showVoided ? "grid" : "none";
        } else {
            row.style.display = "grid";
        }
    });

    const emptyState = document.getElementById("paymentsEmptyState");
    if (emptyState) emptyState.style.display = "none";
}