document.addEventListener('DOMContentLoaded', () => {
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.crm-section');

function switchSection(sectionName) {
        navItems.forEach(nav => nav.classList.remove('active'));
        const activeNav = document.querySelector(`[data-section="${sectionName}"]`);
        if (activeNav) activeNav.classList.add('active');

        sections.forEach(section => section.classList.add('hidden'));
        const activeSection = document.getElementById(`section-${sectionName}`);
        if (activeSection) activeSection.classList.remove('hidden');

        localStorage.setItem("activeSession", sectionName);
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionName = item.getAttribute('data-section');
            switchSection(sectionName);
        });
    });

    const savedSection = localStorage.getItem("activeSession");
    if (savedSection) {
        switchSection(savedSection);
    } else {
        switchSection('Overview'); 
    }

// Mock Search focus effect (optional visual polish)
const searchInput = document.querySelector('.search-input');
if(searchInput) {
    searchInput.addEventListener('focus', () => {
        searchInput.parentElement.style.opacity = '1';
    });
}
});
const popup = document.getElementById("status-popup");

let selectedQuote = null;
document.querySelectorAll(".status-badge").forEach(badge=>{
    badge.addEventListener("click",(e)=>{
        selectedQuote = badge.dataset.id;
        popup.style.display="block";
        popup.style.left=e.pageX+"px";
        popup.style.top=e.pageY+"px";
    });

});
document.querySelectorAll(".status-option").forEach(option=>{
    option.addEventListener("click",()=>{
        updateStatus(
            selectedQuote,
            option.dataset.status
        );
        popup.style.display="none";
    });
});
document.addEventListener("click",(e)=>{
    if(!popup.contains(e.target) &&
       !e.target.classList.contains("status-badge")){
        popup.style.display="none";
    }
});
const csrfToken = document.cookie.split('; ')
        .find(row => row.startsWith('csrftoken='))
        ?.split('=')[1];
async function updateStatus(id,status){
    const response = await fetch(
        `/update_quote_status/${id}/`,
        {
            method:"PATCH",
            headers:{
                "Content-Type":"application/json",
                "X-CSRFToken":csrfToken
            },
            body:JSON.stringify({
                id:id,
                status:status
            })
        }
    );
    const data = await response.json();
    if(data.success){
        location.reload();
        showToast('Status Updated', 'Status Updated Successfully', 'success', 4000)
    }
    else{
        showToast('Update Failed', 'Unable To update The Status', 'error', 4000)
    }
}
/**
 * Triggers a slick custom toast notification on the bottom right.
 * @param {string} title - Header text for the toast alert.
 * @param {string} message - Explanatory body text message.
 * @param {string} type - Theme style indicator: 'success' | 'error' | 'info'.
 * @param {number} duration - Milliseconds before auto-dismissal (Default: 4000).
 */
function showToast(title, message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close">✕</button>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  const dismissToast = () => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  };

  toast.querySelector('.toast-close').addEventListener('click', dismissToast);

  if (duration > 0) {
    setTimeout(dismissToast, duration);
  }
}