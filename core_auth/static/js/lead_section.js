(function(){
  const container = document.getElementById('lead-rows-container');
  const rows = Array.from(container.querySelectorAll('.lead-row'));
  const emptyState = document.getElementById('lead-empty-state');
  const resultCount = document.getElementById('lead-result-count');

  const searchInput = document.getElementById('lead-search-input');
  const statusFilter = document.getElementById('lead-status-filter');
  const followupFilter = document.getElementById('lead-followup-filter');
  const sortSelect = document.getElementById('lead-sort-select');

  const AVATAR_COLORS = ['c1', 'c2', 'c3', 'c4', 'c5'];

function todayISO() {
    const today = new Date();
    today.setHours(0,0,0,0);
    return today;
}

function daysBetween(dateStr){
    const today = new Date();
    today.setHours(0,0,0,0);

    const target = new Date(dateStr);
    target.setHours(0,0,0,0);

    return Math.floor((target - today) / 86400000);
}

  function computeUrgency(row){
    const status = row.dataset.status;
    const followup = row.dataset.followup;
    const hasConversion = row.dataset.hasConversion === '1';

    if (status === 'won' || status === 'lost' || hasConversion){
      row.classList.add('urgency-closed');
      return;
    }
    if (!followup){
      row.classList.add('urgency-none');
      return;
    }

    const diff = daysBetween(followup);
    const followupTextEl = row.querySelector('.followup-text');
    const dotEl = row.querySelector('.followup-dot');

    if (diff < 0){
      row.classList.add('urgency-overdue');
      if (dotEl) dotEl.classList.add('dot-overdue');
      if (followupTextEl){
        followupTextEl.classList.add('text-overdue');
        followupTextEl.textContent = `Overdue — ${followupTextEl.textContent}`;
      }
    } else if (diff === 0){
      row.classList.add('urgency-today');
      if (dotEl) dotEl.classList.add('dot-today');
      if (followupTextEl){
        followupTextEl.classList.add('text-today');
        followupTextEl.textContent = `Today — ${followupTextEl.textContent}`;
      }
    } else {
      row.classList.add('urgency-upcoming');
      if (dotEl) dotEl.classList.add('dot-upcoming');
    }
  }

  function assignAvatarColors(){
    rows.forEach((row, i) => {
      const avatar = row.querySelector('.client-avatar');
      if (avatar) avatar.classList.add('avatar-' + AVATAR_COLORS[i % AVATAR_COLORS.length]);
    });
  }

  function matchesFollowupFilter(row, filterValue){
    if (!filterValue) return true;

    const followup = row.dataset.followup;
    const status = row.dataset.status;
    const hasConversion = row.dataset.hasConversion === '1';
    if (filterValue === 'none') return !followup;
    if (!followup || status === 'won' || status === 'lost') return false;

    const diff = daysBetween(followup);
    if (filterValue === 'overdue') return diff < 0;
    if (filterValue === 'today') return diff === 0;
    if (filterValue === 'week') return diff >= 0 && diff <= 7;
    return true;
  }

  function applyFilters(){
    const searchTerm = searchInput.value.trim().toLowerCase();
    const statusValue = statusFilter.value;
    const followupValue = followupFilter.value;

    let visibleCount = 0;

    rows.forEach(row => {
      const matchesSearch = !searchTerm ||
        row.dataset.name.includes(searchTerm) ||
        row.dataset.phone.includes(searchTerm) ||
        row.dataset.referral.includes(searchTerm);

      const matchesStatus = !statusValue || row.dataset.status === statusValue;
      const matchesFollowup = matchesFollowupFilter(row, followupValue);
      const visible = matchesSearch && matchesStatus && matchesFollowup;
      row.style.display = visible ? '' : 'none';
      if (visible) visibleCount++;
    });

    resultCount.textContent = `${visibleCount} lead${visibleCount === 1 ? '' : 's'}`;

    // FIX: previously this was `visibleCount !== 0 || rows.length === 0`, which
    // meant "hide the empty state whenever there are visible rows OR whenever
    // there are zero rows at all" — the second half of that OR was backwards.
    // It caused the empty state to stay hidden even when the lead list was
    // genuinely empty. The correct condition is simply: show it exactly when
    // nothing is currently visible, whether that's due to filters or because
    // there really are no leads.
    emptyState.classList.toggle('hidden', visibleCount !== 0);

    if (visibleCount === 0){
      if (rows.length === 0){
        document.getElementById('lead-empty-title').textContent = 'No leads yet';
        document.getElementById('lead-empty-text').textContent = 'New leads you add will show up here.';
      } else {
        document.getElementById('lead-empty-title').textContent = 'No leads match these filters';
        document.getElementById('lead-empty-text').textContent = 'Try adjusting your search or clearing filters to see more results.';
      }
    }
  }

  function applySort(){
    const sortValue = sortSelect.value;
    const sorted = [...rows].sort((a, b) => {
      if (sortValue === 'name'){
        return a.dataset.name.localeCompare(b.dataset.name);
      }
      if (sortValue === 'recent'){
        return new Date(b.dataset.created) - new Date(a.dataset.created);
      }
      const aDate = a.dataset.followup;
      const bDate = b.dataset.followup;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return new Date(aDate) - new Date(bDate);
    });
    sorted.forEach(row => container.appendChild(row));
  }

  function updateMetrics(){
    const openCount = rows.filter(r => r.dataset.isOpen === '1').length;
    const today = todayISO();
    const todayFollowUpCount = rows.filter(r => r.dataset.followup === today && r.dataset.isOpen === "1").length;
    const overdueCount = rows.filter(r => r.classList.contains('urgency-overdue')).length;
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const wonCount = rows.filter(r => r.dataset.status === 'won' && r.dataset.updated.slice(0, 7) === thisMonth).length;
    const lostCount = rows.filter(r => r.dataset.status === 'lost' && r.dataset.updated.slice(0, 7) === thisMonth).length;

    document.getElementById('metric-open-count').textContent = openCount;
    document.getElementById('metric-overdue-count').textContent = overdueCount;
    document.getElementById('metric-won-count').textContent = wonCount;
    document.getElementById('metric-lost-count').textContent = lostCount;
  }

  function getFollowUpText(dateString) {
    if (!dateString) return "No follow-up";
    const followUp = new Date(dateString);
    // Remove time part
    followUp.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
        (followUp - today) / (1000 * 60 * 60 * 24)
    );
    const formattedDate = followUp.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short"
    });
    let message = "";
    if (diffDays === 0) {
        message = "Today";
    }
    else if (diffDays === 1) {
        message = "Tomorrow";
    }
    else if (diffDays === -1) {
        message = "Yesterday";
    }
    else if (diffDays > 1) {
        message = `In ${diffDays} days`;
    }
    else {
        message = `${Math.abs(diffDays)} days overdue`;
    }

    return `${formattedDate} (${message})`;
}
document.querySelectorAll(".followup-text").forEach(el => {
    const date = el.dataset.date;

    if (date) {
        el.textContent = getFollowUpText(date);
    }
});

  searchInput.addEventListener('input', applyFilters);
  statusFilter.addEventListener('change', applyFilters);
  followupFilter.addEventListener('change', applyFilters);
  sortSelect.addEventListener('change', applySort);
emptyState
  rows.forEach(computeUrgency);
  assignAvatarColors();
  applySort();
  applyFilters();
  updateMetrics();
})();