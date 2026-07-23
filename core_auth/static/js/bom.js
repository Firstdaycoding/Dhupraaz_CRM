
  const modal = document.getElementById('bom-modal-overlay');
  const openBtn = document.getElementById('open-bom-modal-btn');
  const closeBtn = document.getElementById('close-bom-modal');
  const cancelBtn = document.getElementById('cancel-bom-btn');
  const addItemBtn = document.getElementById('add-bom-item-btn');
  const itemsBody = document.getElementById('bom-items-body');

  const pills = document.querySelectorAll(".pill");
  const cards = document.querySelectorAll(".bom-note-card");
// Filter Logic
pills.forEach(pill => {
    pill.addEventListener("click", () => {
        // Update active pill
        pills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        const filter = pill.dataset.filter;
        cards.forEach(card => {
            if (filter === "all" || card.dataset.type === filter) {
                card.style.display = "";
            } else {
                card.style.display = "none";
            }
        });
    });
});
    document.querySelectorAll(".bom-note-card").forEach(card => {
        const colorMap = {
            "on-grid": "color-warm-yellow",
            "off-grid": "color-soft-blue",
            "hybrid": "color-mint-green"
        };
        const colorClass = colorMap[card.dataset.type];
        if(colorClass){
            card.classList.add(colorClass)
        }
        const totalElement = card.querySelector(".amount");
        const total = parseFloat(totalElement.dataset.total) || 0;
        totalElement.textContent = total.toLocaleString("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0
        });
        const size = parseFloat(
            card.querySelector(".system-badge").dataset.size
        ) || 1;
        const costPerKw = total / size;
        card.querySelector(".rate-val").textContent =
            costPerKw.toLocaleString("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0
            });
            });
    document.querySelectorAll(".last-updated").forEach(element => {
        const updatedDate = new Date(element.dataset.updated);
        const now = new Date();
        const diff = now - updatedDate;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (minutes < 1) {
            element.textContent = "Updated just now";
        }
        else if (minutes < 60) {
            element.textContent = `Updated : ${minutes} min ago`;
        }
        else if (hours < 24) {
            element.textContent = `Updated : ${hours} hour${hours > 1 ? "s" : ""} ago`;
        }
        else if (days < 30) {
            element.textContent = `Updated : ${days} day${days > 1 ? "s" : ""} ago`;
        }
        else {
            element.textContent =
                "Updated : " +
                updatedDate.toLocaleDateString("en-IN");
        }
    });

  // Open modal
  openBtn.addEventListener('click', () => {
    editMode = false;
    document.getElementById('modal-title').textContent = "Create System BOM Template";
    itemsBody.innerHTML = '';
    document.getElementById('bom-capacity').value = '';
    document.getElementById('bom-package-name').value = '';
    document.getElementById('modal-items-total').textContent = '';
    document.getElementById('bom-margin-pct').value = '';
    document.getElementById('modal-grand-total').textContent = '';
    addModalRow();
    modal.classList.remove('hidden');
  });

  // Close modal handles
  const closeModal = () => modal.classList.add('hidden');
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  addItemBtn.addEventListener('click', () => addModalRow());

// Save Btn Logic (Creating And Updating)
  const saveBtn = document.getElementById('save-new-bom-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const bomData = collectData();
        if(editMode){
            try {
                const response = await fetch(`/edit_bom/${currentBomId}`, {
                    method: 'PUT',
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCookie('csrftoken')
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify(bomData)
                });
                if (!response.ok) {
                    throw new Error("Failed to save BOM");
                }
                showToast('Updated Successfully', 'BOM Data Updated Successfully in the Database', 'success', 4000);
                modal.classList.add("hidden");
                setTimeout(() => { window.location.href = "/dashboard/"; }, 1200);

            }
            catch (error) {
                showToast('Unable To Update BOM', error, 'error', 4000);
            }
        }
        else{
            try {
                const response = await fetch('/create_bom/', {
                    method: 'POST',
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCookie('csrftoken')
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify(bomData)
                });
                if (!response.ok) {
                    throw new Error("Failed to save BOM");
                }
                showToast('Saved Successfully', 'BOM Saved Successfully in the Database', 'success', 4000);
                modal.classList.add("hidden");
            }
            catch (error) {
                showToast('Unable To Save BOM', error, 'error', 4000);
            }
        }
    });
}

// Event Listeners for Live Calculations
document.getElementById('bom-items-body').addEventListener('input', () => {
    calculateBOMTotals();
});
document.getElementById('bom-margin-pct').addEventListener('input', calculateBOMTotals);

function getCookie(name){
    const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=')[1]) : null;
  }
// Edit Btn Logic
let currentBomId = null;
let editMode = false;
  document.querySelectorAll(".edit-bom-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
        editMode = true;
        currentBomId = btn.dataset.id;

        document.getElementById("modal-title").textContent = "Edit System BOM Template";
        document.getElementById("save-new-bom-btn").textContent = "Update";

        try {
            const response = await fetch(`/edit_bom/${currentBomId}`);
            if (!response.ok) {
                throw new Error("Failed to fetch BOM");
            }
            const data = await response.json();

            document.getElementById('bom-package-name').value = data.package_name;
            document.getElementById('bom-type').value = data.system_type;
            document.getElementById('bom-capacity').value = data.system_size_kw;
            document.getElementById('bom-margin-pct').value = data.profit_amount;
            document.getElementById('bom-items-body').innerHTML = '';
            data.items.forEach(item => {
               addModalRow(item)
            })
            calculateBOMTotals()
        }
        catch(error) {
            showToast('Unable To Fetch BOM Data', error, 'error', 4000);
        }

        document.getElementById("bom-modal-overlay").classList.remove("hidden");
    });

});

// Functions Declaration and Definition
  function addModalRow(data = {}){
    const itemsBody = document.getElementById('bom-items-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="m-desc" placeholder="e.g. 540W Mono PERC Panel" value="${data.description || ''}" required></td>
      <td><input type="text" class="m-qty" placeholder="e.g. 6x or 1 Set" value="${data.quantity || ''}" required></td>
      <td><input type="number" class="m-cost" placeholder="0" value="${data.unit_price || ''}" required></td>
      <td><button type="button" style="color:red; background:none; border:none; cursor:pointer;" onclick="this.closest('tr').remove()">✕</button></td>
    `;
    
    const removeBtn = tr.querySelector("button");
    removeBtn.addEventListener("click", () => {
        tr.remove();
        calculateBOMTotals();
    });
    itemsBody.appendChild(tr);
  }

  function calculateBOMTotals() {
  let baseTotal = 0;

  // Sum all item cost inputs
  document.querySelectorAll('.m-cost').forEach(input => {
    const qtyInput = input.closest('tr').querySelector('.m-qty');
    const qty = parseFloat(qtyInput.value) || 0;
    const val = parseFloat(input.value) || 0;
    baseTotal += val * qty;
  });

  const marginAmount = parseFloat(document.getElementById('bom-margin-pct').value) || 0;
  const grandTotal = baseTotal + marginAmount;

  // Update DOM labels
  document.getElementById('modal-items-total').textContent = `₹${baseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('modal-grand-total').textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

  function collectData(){
    const bomData = {
            packageName: document.getElementById('bom-package-name').value.trim(),
            bomType: document.getElementById('bom-type').value.trim(),
            bomCapacity: document.getElementById('bom-capacity').value.trim(),
            bomMargin: parseFloat(document.getElementById('bom-margin-pct').value) || 0,
            items: []
        };
        // ---------- Validate Required Fields ----------
        if (!bomData.packageName) {
            showToast('Incomplete Information', 'Please provide a Valid Package Name', 'error', 4000);
            return;
        }
        if (!bomData.bomType) {
            showToast('Incomplete Information', 'Please provide a Valid Package Type', 'error', 4000);
            return;
        }
        if (!bomData.bomCapacity) {
            showToast('Incomplete Information', 'Please provide a Valid Package SIze', 'error', 4000);
            return;
        }
        // ---------- Read Table ----------
        const itemRows = document.querySelectorAll("#bom-items-body tr");
        itemRows.forEach(tr => {
            const description = tr.querySelector(".m-desc").value.trim();
            const quantity = tr.querySelector(".m-qty").value.trim();
            const unitPrice = tr.querySelector(".m-cost").value.trim();
            // Ignore completely empty rows
            if (
                description === "" &&
                quantity === "" &&
                unitPrice === ""
            ) {
                return;
            }
            // Validate partially filled rows
            if (
                description === "" ||
                quantity === "" ||
                unitPrice === ""
            ) {
                showToast('Incomplete Information', 'Please complete all fields for every BOM item.', 'error', 4000);
                throw new Error("Incomplete BOM row");
                return;
            }
            bomData.items.push({
                description,
                quantity: Number(quantity),
                unit_price: Number(unitPrice)
            });
        });
        // ---------- At least one item ----------
        if (bomData.items.length === 0) {
            showToast('Incomplete Information', 'Provide at least one item in the package.', 'error', 4000);
            return;
        }
        if(!bomData.bomMargin){
            showToast('Incomplete Information', 'Provide a valid number in margin.', 'error', 4000);
            return;
        }
        return bomData;
  }