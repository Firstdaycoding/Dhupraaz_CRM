(function(){
  const modal = document.getElementById('new-lead-modal');
  const form = document.getElementById('new-lead-form');
  const submitBtn = document.getElementById('lead-submit-btn');

  function getCookie(name){
    const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=')[1]) : null;
  }

  // ---- open/close ----
  window.openNewLeadModal = function(){
    form.reset();
    modal.classList.remove('hidden');
    document.getElementById('lead-name').focus();
  };

  function closeModal(){
    modal.classList.add('hidden');
  }

  document.getElementById('close-lead-modal').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'new-lead-modal') closeModal();
  });

  // ---- submit ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('lead-name').value.trim();
    const phone = document.getElementById('lead-phone').value.trim();

    if (!name || !phone){
      showToast('Name and phone are required.', 'error');
      return;
    }

    const payload = {
      name: name,
      phone: phone,
      email: document.getElementById('lead-email').value.trim(),
      address: document.getElementById('lead-address').value.trim(),
      next_follow_up_date: document.getElementById('lead-followup-date').value || null,
      project_type: document.getElementById('lead-project-type').value,
      estimated_system_size: document.getElementById('lead-system-size').value.trim(),
      estimated_budget: document.getElementById('lead-budget').value || null,
      referral_source_type: document.getElementById('lead-referral-source').value,
      referral_name: document.getElementById('lead-referral-name').value.trim(),
      initial_note: document.getElementById('lead-initial-note').value.trim(),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';

    try{
      const res = await fetch('/leads/create/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken')
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.status === 'success'){
        showToast('Lead added successfully.', 'success');
        closeModal();
        // Simplest reliable option: reload the list so filters/counts stay
        // correct. Swap for a targeted DOM insert later if you want it
        // to feel more instant.
        setTimeout(() => window.location.reload(), 600);
      } else {
        showToast(data.message || 'Failed to add lead.', 'error');
      }
    } catch (err){
      showToast(err, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '+ Add Lead';
    }
  });
  
})();