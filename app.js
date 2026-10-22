const modalBackdrop = document.querySelector('#modalBackdrop');
const expenseForm = document.querySelector('#expenseForm');
const activityList = document.querySelector('#activityList');
const toast = document.querySelector('#toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function openModal() {
  modalBackdrop.classList.add('open');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  setTimeout(() => expenseForm.elements.description.focus(), 30);
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  modalBackdrop.setAttribute('aria-hidden', 'true');
}

document.querySelectorAll('#addExpenseTop, #addExpenseSide').forEach(button => button?.addEventListener('click', openModal));
document.querySelector('#modalClose').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', event => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

expenseForm.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(expenseForm);
  const description = data.get('description').trim();
  const amount = Number(data.get('amount'));
  const payer = data.get('payer');
  const trip = data.get('trip');
  const youPaid = payer === 'You';
  const owed = (amount / 4).toFixed(2);
  const row = document.createElement('article');
  row.className = 'activity-row';
  row.dataset.kind = 'expenses';
  const icon = description.toLowerCase().includes('food') || description.toLowerCase().includes('dinner') ? '🍽' : '✳';
  row.innerHTML = `<div class="activity-icon ticket">${icon}</div><div class="activity-detail"><b></b><span><strong></strong> paid <span class="group-tag"></span></span></div><div class="activity-amount"><b></b><span></span></div><button class="row-more" aria-label="Expense options">···</button>`;
  row.querySelector('.activity-detail>b').textContent = description;
  row.querySelector('.activity-detail strong').textContent = payer;
  row.querySelector('.group-tag').textContent = trip;
  row.querySelector('.activity-amount>b').textContent = `$${amount.toFixed(2)}`;
  const amountLabel = row.querySelector('.activity-amount span');
  amountLabel.innerHTML = youPaid ? `You lent <em>$${(amount - owed * 1).toFixed(2)}</em>` : `You owe <em>$${owed}</em>`;
  activityList.prepend(row);
  const dateLabel = activityList.querySelector('.date-label');
  if (dateLabel) activityList.insertBefore(dateLabel, row);
  document.querySelectorAll('.activity-row').forEach(item => item.hidden = false);
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.filter === 'all'));
  document.querySelector('.empty-state').style.display = 'none';
  closeModal();
  expenseForm.reset();
  showToast('Expense added. The trip tab is up to date.');
});

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item === tab));
  const filter = tab.dataset.filter;
  let visible = 0;
  document.querySelectorAll('.activity-row').forEach(row => {
    const show = filter === 'all' || (filter === 'expenses' && row.dataset.kind === 'expenses') || (filter === 'settlements' && row.dataset.kind === 'settlements');
    row.hidden = !show;
    if (show) visible++;
  });
  document.querySelectorAll('.date-label').forEach(label => label.hidden = filter === 'settlements' && label.textContent.includes('TODAY'));
  document.querySelector('#emptyState').style.display = visible ? 'none' : 'block';
}));

document.querySelector('#settleButton').addEventListener('click', () => {
  const row = document.createElement('article');
  row.className = 'activity-row';
  row.dataset.kind = 'settlements';
  row.innerHTML = '<div class="activity-icon settle">↗</div><div class="activity-detail"><b></b><span><strong>You</strong> settled up <span class="group-tag">Coastal California</span></span></div><div class="activity-amount"><b>$28.50</b><span class="settled-label">Settled</span></div>';
  row.querySelector('.activity-detail>b').textContent = 'Paid Jamie back';
  activityList.prepend(row);
  const dateLabel = activityList.querySelector('.date-label');
  if (dateLabel) activityList.insertBefore(dateLabel, row);
  const jamie = [...document.querySelectorAll('.balance-person')].find(person => person.textContent.includes('Jamie Lee'));
  if (jamie) { jamie.querySelector('.person-name small').textContent = 'settled up'; jamie.querySelector('.person-amount').textContent = '$0.00'; jamie.querySelector('.person-amount').className = 'person-amount'; }
  showToast('Payment recorded. Jamie is settled up.');
});
document.querySelector('#dismissTip').addEventListener('click', () => document.querySelector('.tip-card').remove());
document.querySelector('#inviteButton').addEventListener('click', async () => {
  const invite = 'Join my trip on together: https://together.app/invite/coastal-california';
  try { await navigator.clipboard.writeText(invite); showToast('Invite link copied to clipboard.'); }
  catch { showToast('Invite link: together.app/invite/coastal-california'); }
});
document.querySelector('#addTrip').addEventListener('click', () => {
  const name = prompt('What should we call your trip?');
  if (!name?.trim()) return;
  const link = document.createElement('a');
  link.href = '#trip'; link.className = 'trip-link'; link.dataset.trip = name.trim();
  link.innerHTML = '<span class="trip-emoji">✈️</span><span></span>';
  link.querySelector('span:last-child').textContent = name.trim();
  document.querySelector('.trip-list').append(link);
  showToast(`${name.trim()} is ready for expenses.`);
});
document.querySelectorAll('.nav-item').forEach(link => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === link));
  document.querySelector('#crumbCurrent').textContent = link.textContent.trim();
}));
document.querySelectorAll('.trip-link').forEach(link => link.addEventListener('click', () => {
  document.querySelectorAll('.trip-link').forEach(item => item.classList.toggle('selected', item === link));
  if (link.dataset.trip) showToast(`${link.dataset.trip} selected.`);
}));
document.querySelector('#viewAll').addEventListener('click', () => {
  document.querySelector('[data-filter="all"]').click();
  showToast('Showing all recent activity.');
});
document.querySelector('#searchButton').addEventListener('click', () => {
  const query = prompt('Search expenses, friends, or trips');
  if (!query?.trim()) return;
  const matches = [...document.querySelectorAll('.activity-row')].filter(row => row.textContent.toLowerCase().includes(query.toLowerCase()));
  document.querySelectorAll('.activity-row').forEach(row => row.hidden = !matches.includes(row));
  document.querySelectorAll('.tab').forEach(item => item.classList.remove('active'));
  document.querySelector('#emptyState').style.display = matches.length ? 'none' : 'block';
  showToast(matches.length ? `${matches.length} matching ${matches.length === 1 ? 'expense' : 'expenses'} found.` : 'No matching expenses found.');
});
