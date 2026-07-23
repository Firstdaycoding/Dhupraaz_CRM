(function(){
  const page = document.getElementById('lead-detail-page');
  const leadId = page.dataset.leadId;
  let toastTimeout;
  function getCookie(name){
    const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=')[1]) : null;
  }

  async function postJSON(url, payload, method='POST'){
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  // ============================================================
  // 1. EDIT CONTACT / PROJECT / REFERRAL FIELDS
  // ============================================================
  const editBtn = document.getElementById('edit-lead-btn');
  const saveBtn = document.getElementById('save-lead-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const editableFields = document.querySelectorAll('.editable-field');

  let originalValues = {};

  function captureOriginalValues(){
    originalValues = {};
    editableFields.forEach(el => { originalValues[el.id] = el.value; });
  }

  function setEditMode(on){
    editableFields.forEach(el => { el.disabled = !on; });
    editBtn.classList.toggle('hidden', on);
    saveBtn.classList.toggle('hidden', !on);
    cancelBtn.classList.toggle('hidden', !on);
  }

  editBtn.addEventListener('click', () => {
    captureOriginalValues();
    setEditMode(true);
  });

  cancelBtn.addEventListener('click', () => {
    editableFields.forEach(el => { el.value = originalValues[el.id]; });
    setEditMode(false);
  });

  saveBtn.addEventListener('click', async () => {
    const payload = {
      name: document.getElementById('edit-name').value.trim(),
      phone: document.getElementById('edit-phone').value.trim(),
      email: document.getElementById('edit-email').value.trim(),
      address: document.getElementById('edit-address').value.trim(),
      project_type: document.getElementById('edit-project-type').value,
      estimated_system_size: document.getElementById('edit-system-size').value.trim(),
      estimated_budget: document.getElementById('edit-budget').value || null,
      referral_source_type: document.getElementById('edit-referral-source').value,
      referral_name: document.getElementById('edit-referral-name').value.trim(),
    };

    if (!payload.name || !payload.phone){
      showToast('Name and phone are required.', 'error');
      return;
    }

    saveBtn.disabled = true;
    const { ok, data } = await postJSON(`/leads/${leadId}/update/`, payload, 'PUT');
    saveBtn.disabled = false;

    if (ok && data.status === 'success'){
      showToast('Lead details updated.', 'success');
      setEditMode(false);
      // update the header name/subline without a full reload
      document.querySelector('.lead-detail-name').textContent = payload.name;
    } else {
      showToast(data.message || 'Failed to update lead.', 'error');
    }
  });

  // ============================================================
  // 2. STATUS CHANGE (with lost-reason guard)
  // ============================================================
  const statusSelect = document.getElementById('status-select');
  const lostFields = document.getElementById('lost-reason-fields');
  const updateStatusBtn = document.getElementById('update-status-btn');
  const statusHint = document.getElementById('status-update-hint');

  function toggleLostFields(){
    lostFields.classList.toggle('hidden', statusSelect.value !== 'lost');
  }
  statusSelect.addEventListener('change', toggleLostFields);
  toggleLostFields(); // set correct visibility on load

  updateStatusBtn.addEventListener('click', async () => {
    const newStatus = statusSelect.value;
    const payload = { status: newStatus };

    if (newStatus === 'lost'){
      const reason = document.getElementById('lost-reason-select').value;
      const reasonNotes = document.getElementById('lost-reason-notes-input').value.trim();
      if (!reason){
        showToast('Please select a reason for marking this lead as Lost.', 'error');
        return;
      }
      payload.lost_reason = reason;
      payload.lost_reason_notes = reasonNotes;
    }

    updateStatusBtn.disabled = true;
    statusHint.textContent = 'Updating…';

    const { ok, data } = await postJSON(`/leads/${leadId}/status/`, payload);
    updateStatusBtn.disabled = false;

    if (ok && data.status === 'success'){
      showToast('Status updated.', 'success');
      statusHint.textContent = '';
      // reload so the timeline shows the new auto-logged status-change note,
      // header pill updates, and the "Quoted" option gets disabled if applicable
      setTimeout(() => window.location.reload(), 500);
    } else {
      statusHint.textContent = '';
      showToast(data.message || 'Failed to update status.', 'error');
    }
  });

  // ============================================================
  // 3. FOLLOW-UP SCHEDULING
  // ============================================================
  const followupInput = document.getElementById('followup-date-input');
  const saveFollowupBtn = document.getElementById('save-followup-btn');

  document.querySelectorAll('.quick-followup-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days, 10);
      const base = followupInput.value ? new Date(followupInput.value) : new Date();
      base.setDate(base.getDate() + days);
      followupInput.value = base.toISOString().split('T')[0];
    });
  });

  saveFollowupBtn.addEventListener('click', async () => {
    saveFollowupBtn.disabled = true;
    const { ok, data } = await postJSON(`/leads/${leadId}/followup/`, {
      next_follow_up_date: followupInput.value || null
    }, 'PUT');
    saveFollowupBtn.disabled = false;

    if (ok && data.status === 'success'){
      showToast('Follow-up date saved.', 'success');
    } else {
      showToast(data.message || 'Failed to save follow-up date.', 'error');
    }
  });

  // ============================================================
  // 4. ADD / DELETE NOTES
  // ============================================================
  const addNoteForm = document.getElementById('add-note-form');
  const timeline = document.getElementById('lead-timeline');

  addNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const noteText = document.getElementById('note-text-input').value.trim();
    const noteType = document.getElementById('note-type-select').value;

    if (!noteText){
      showToast('Please write something before adding a note.', 'error');
      return;
    }

    const addBtn = document.getElementById('add-note-btn');
    addBtn.disabled = true;
    const { ok, data } = await postJSON(`/leads/${leadId}/notes/add/`, {
      note: noteText,
      note_type: noteType,
    });

    addBtn.disabled = false;

    if (ok && data.status === 'success'){
      showToast('Note added.', 'success');
      document.getElementById('note-text-input').value = '';

      // remove "no activity yet" placeholder if present
      const emptyMsg = timeline.querySelector('.timeline-empty');
      if (emptyMsg) emptyMsg.remove();

      // insert the new note at the top without a full reload
      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.dataset.noteId = data.note_id;
      item.innerHTML = `
        <div class="timeline-marker marker-${noteType}"></div>
        <div class="timeline-body">
          <div class="timeline-meta">
            <span class="timeline-type-tag">${data.note_type_display}</span>
            <span class="timeline-date">${data.created_at_display}</span>
            <button type="button" class="timeline-delete-btn" data-note-id="${data.note_id}" title="Delete note">✕</button>
          </div>
          <p class="timeline-text"></p>
        </div>`;
      item.querySelector('.timeline-text').textContent = noteText; // textContent — avoids HTML injection from typed notes
      timeline.prepend(item);
    } else {
      showToast(data.message || 'Failed to add note.', 'error');
    }
  });

  // event delegation for delete buttons — covers both server-rendered and just-added notes
  timeline.addEventListener('click', async (e) => {
    const btn = e.target.closest('.timeline-delete-btn');
    if (!btn) return;

    if (!confirm('Delete this note? This cannot be undone.')) return;

    const noteId = btn.dataset.noteId;
    const { ok, data } = await postJSON(`/leads/notes/${noteId}/delete/`, {});

    if (ok && data.status === 'success'){
      showToast('Note deleted.', 'info');
      btn.closest('.timeline-item').remove();
      if (!timeline.querySelector('.timeline-item')){
        timeline.innerHTML = '<p class="timeline-empty">No activity logged yet. Add your first note above.</p>';
      }
    } else {
      showToast(data.message || 'Failed to delete note.', 'error');
    }
  });

  function showToast(message, type = "info") {
      const toast = document.getElementById("toast");

      clearTimeout(toastTimeout);

      toast.textContent = message;
      toast.className = `toast ${type} show`;

      toastTimeout = setTimeout(() => {
          toast.classList.remove("show");
      }, 3000)};

})();