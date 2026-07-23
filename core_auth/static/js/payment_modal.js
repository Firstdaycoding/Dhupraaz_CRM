(function(){
  let currentInvoiceId = null;

  const modal = document.getElementById('payment-modal');
  const form = document.getElementById('payment-form');
  const historyBody = document.getElementById('payment-history-body');

  function getCookie(name){
    const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=')[1]) : null;
  }

  function currency(n){
    return (isNaN(n) ? 0 : parseFloat(n)).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  // ---- open/close ----
  document.querySelectorAll(".add-payment-btn, .btn-select-invoice").forEach(btn => {
    const inv_id = btn.dataset.inv_id;
    btn.addEventListener('click', () => openPaymentModal(inv_id));
  });

  function openPaymentModal(invoiceId){
    currentInvoiceId = invoiceId;
    document.getElementById('payment-modal-invoice-id').textContent = `Invoice #${invoiceId}`;
    document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
    modal.classList.remove('hidden');
    loadPaymentHistory();
  };

  function closeModal(){
    modal.classList.add('hidden');
    form.reset();
    currentInvoiceId = null;
  }

  document.getElementById('close-payment-modal').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'payment-modal') closeModal();
  });

  // ---- load summary + history ----
  async function loadPaymentHistory(){
    if (!currentInvoiceId) return;
    historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">Loading…</td></tr>`;

    try{
      const res = await fetch(`/invoice/${currentInvoiceId}/payments/`);
      const data = await res.json();
      if (data.status !== 'success') throw new Error(data.message || 'Failed to load payments');

      document.getElementById('payment-summary-total').textContent = `₹${currency(data.grand_total)}`;
      document.getElementById('payment-summary-paid').textContent = `₹${currency(data.amount_paid)}`;
      document.getElementById('payment-summary-due').textContent = `₹${currency(data.balance_due)}`;

      if (data.payments.length === 0){
        historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">No payments recorded yet.</td></tr>`;
      } else {
        historyBody.innerHTML = data.payments.map(p => `
          <tr>
            <td>${p.paid_on}</td>
            <td>₹${currency(p.amount)}</td>
            <td>${p.method}</td>
            <td>${p.reference_no || '—'}</td>
            <td><button type="button" class="payment-void-btn" data-payment-id="${p.id}">Void</button></td>
          </tr>
        `).join('');
      }

      // disable the form entirely once fully paid — nothing left to collect
      const submitBtn = document.getElementById('payment-submit-btn');
      submitBtn.disabled = parseFloat(data.balance_due) <= 0;
      submitBtn.textContent = submitBtn.disabled ? 'Fully Paid' : '+ Add Payment';

    } catch (err){
      historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:#ef4444;">Failed to load payment history.</td></tr>`;
      showToast(err, 'error');
    }
  }

  // ---- void a payment (event delegation, since rows are re-rendered) ----
  if(historyBody && !historyBody.dataset.listenerAdded){
    historyBody.dataset.listenerAdded = "true";
    historyBody.addEventListener('click', async (e) => {
          console.log("Payment button clicked");
      const btn = e.target.closest('.payment-void-btn');
      if (!btn) return;

      if (!confirm('Void this payment? This cannot be undone.')) return;
      const message = prompt("Specify the reason for Revering the payment.");
      try{
        const res = await fetch(`/payments/${btn.dataset.paymentId}/void/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
          credentials: 'same-origin',
          body: JSON.stringify({ message })
        });
        const data = await res.json();
        if (data.status === 'success'){
          showToast('Payment voided.', 'info');
          loadPaymentHistory();
        } else {
          showToast(data.message || 'Failed to void payment.', 'error');
        }
      } catch (err){
        showToast(err, 'error');
      }
    });
}
  // ---- submit new payment ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentInvoiceId) return;

    const payload = {
      amount: parseFloat(document.getElementById('payment-amount').value) || 0,
      paid_on: document.getElementById('payment-date').value,
      method: document.getElementById('payment-method').value,
      reference_no: document.getElementById('payment-reference').value,
      notes: document.getElementById('payment-notes').value,
    };

    try{
      const res = await fetch(`/invoice/${currentInvoiceId}/payments/add/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.status === 'success'){
        showToast('Payment recorded successfully.', 'success');
        form.reset();
        setTimeout(() => { window.location.href = "/dashboard/"; }, 1200);
        document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
        loadPaymentHistory();
        // let the page behind the modal know totals changed, e.g. to refresh a dashboard card
        document.dispatchEvent(new CustomEvent('payment:recorded', { detail: { invoiceId: currentInvoiceId } }));
      } else {
        showToast(data.message || 'Failed to record payment.', 'error');
      }
    } catch (err){
      showToast(err, 'error');
    }
  });
})();