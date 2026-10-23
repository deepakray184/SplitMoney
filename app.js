if (window.SplitMoneyCloud?.configured) {
  import('./cloud-app.js').then(({ startCloudApp }) => startCloudApp()).catch(error => {
    console.error('Could not start SplitMoney cloud app', error);
    document.querySelector('#authMessage').textContent = 'Could not load the sign-in service. Refresh the page and try again.';
    document.querySelector('#authBackdrop').classList.add('open');
  });
} else {
const DEFAULT_USER = 'Alex Morgan';
const STORAGE_KEY = 'splitmoney.v1';
const DEFAULT_GROUPS = [
  { id: 'coastal-california', name: 'Coastal California', emoji: '🌊', members: [DEFAULT_USER, 'Maya Chen', 'Jamie Lee', 'Chris Park'] },
  { id: 'new-york-weekend', name: 'New York weekend', emoji: '🗽', members: [DEFAULT_USER, 'Jamie Lee'] },
  { id: 'cabin-in-the-woods', name: 'Cabin in the woods', emoji: '🌲', members: [DEFAULT_USER, 'Maya Chen', 'Chris Park'] }
];

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.groups) && Array.isArray(saved.expenses)) return { userName: DEFAULT_USER, ...saved };
  } catch { /* Start fresh if saved browser data is invalid. */ }
  return { userName: DEFAULT_USER, groups: DEFAULT_GROUPS, expenses: [], currentGroupId: DEFAULT_GROUPS[0].id };
}

const state = readState();
let currentUser = state.userName || DEFAULT_USER;
let activeFilter = 'all';
let toastTimer;
$('#accountAccess').addEventListener('click', () => {
  $('#authTitle').textContent = 'Connect shared accounts';
  $('#authSubtitle').textContent = 'This published preview currently stores data in this browser only.';
  $('#authForm').hidden = true;
  $('#authToggle').hidden = true;
  $('#backendSetupInfo').hidden = false;
  $('#authClose').hidden = false;
  $('#authBackdrop').classList.add('open');
  $('#authBackdrop').setAttribute('aria-hidden', 'false');
});
$('#authClose').addEventListener('click', () => {
  $('#authBackdrop').classList.remove('open');
  $('#authBackdrop').setAttribute('aria-hidden', 'true');
});
$('#shareGroupInvite').addEventListener('click', () => $('#accountAccess').click());
$('#authBackdrop').addEventListener('click', event => {
  if (event.target === $('#authBackdrop')) { $('#authClose').click(); }
});
const $ = selector => document.querySelector(selector);
const dollars = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
const safe = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const groupById = id => state.groups.find(group => group.id === id);
const currentGroup = () => groupById(state.currentGroupId) || state.groups[0];
const personInitials = name => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { showToast('Could not save in this browser. Check its storage settings.'); }
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function balancesFor(group) {
  const balances = Object.fromEntries(group.members.map(name => [name, 0]));
  const groupExpenses = state.expenses.filter(expense => expense.groupId === group.id);
  groupExpenses.forEach(expense => {
    const shares = expense.splits || [];
    balances[expense.payer] = (balances[expense.payer] || 0) + expense.amountCents;
    shares.forEach(split => { balances[split.name] = (balances[split.name] || 0) - split.cents; });
  });
  return { balances, groupExpenses };
}

function renderGroups() {
  const list = $('#tripList');
  list.replaceChildren();
  state.groups.forEach(group => {
    const link = document.createElement('a');
    link.href = `#group-${encodeURIComponent(group.id)}`;
    link.className = `trip-link${group.id === state.currentGroupId ? ' selected' : ''}`;
    link.innerHTML = `<span class="trip-emoji">${safe(group.emoji || '✈️')}</span><span>${safe(group.name)}</span>${group.id === state.currentGroupId ? '<i class="trip-dot"></i>' : ''}`;
    link.addEventListener('click', event => {
      event.preventDefault();
      state.currentGroupId = group.id;
      persist();
      renderAll();
    });
    list.append(link);
  });
  $('#groupCount').textContent = state.groups.length;
}

function renderGroupSummary() {
  const group = currentGroup();
  if (!group) return;
  const { balances, groupExpenses } = balancesFor(group);
  const ownBalance = balances[currentUser] || 0;
  $('#currentGroupName').textContent = group.name;
  $('#balanceGroupName').textContent = group.name;
  $('#currentGroupEmoji').textContent = group.emoji || '✈️';
  $('#currentGroupMembers').textContent = `${group.members.length} people · ${groupExpenses.length} expenses`;
  $('#currentGroupPeople').textContent = `${group.members.length} people`;
  $('#groupPeopleCount').textContent = `${group.members.length} people`;
  $('#currentGroupAvatars').innerHTML = group.members.slice(0, 4).map((name, index) => `<span class="avatar avatar-member avatar-color-${index % 4}" title="${safe(name)}">${safe(personInitials(name))}</span>`).join('');
  $('#groupTotal').textContent = dollars(groupExpenses.reduce((sum, expense) => sum + expense.amountCents, 0));
  $('#groupNet').textContent = ownBalance > 0 ? `You are owed ${dollars(ownBalance)}` : ownBalance < 0 ? `You owe ${dollars(-ownBalance)}` : 'You are all settled up';
  $('#groupNet').className = ownBalance < 0 ? 'negative' : 'positive';
  $('#memberBalances').replaceChildren();
  group.members.filter(name => name !== currentUser).forEach((name, index) => {
    const balance = balances[name] || 0;
    const row = document.createElement('div');
    row.className = 'balance-person';
    row.innerHTML = `<span class="avatar avatar-member avatar-color-${index % 4}">${safe(personInitials(name))}</span><span class="person-name"><b>${safe(name)}</b><small>${balance > 0 ? 'is owed' : balance < 0 ? 'owes the group' : 'all settled up'}</small></span><b class="person-amount ${balance > 0 ? 'positive' : balance < 0 ? 'negative' : ''}">${dollars(Math.abs(balance))}</b>`;
    $('#memberBalances').append(row);
  });
  if (group.members.length < 2) $('#memberBalances').innerHTML = '<p class="balance-empty">Add friends to this group to start splitting expenses.</p>';
}

function renderOverallBalances() {
  const totals = Object.fromEntries(state.groups.map(group => [group.id, balancesFor(group).balances[currentUser] || 0]));
  const owed = Object.values(totals).filter(amount => amount > 0).reduce((a, b) => a + b, 0);
  const owe = Object.values(totals).filter(amount => amount < 0).reduce((a, b) => a - b, 0);
  const asMoney = amount => {
    const [whole, fraction] = dollars(amount).replace('$', '').split('.');
    return `<span class="money-whole">$${whole}</span><span>.${fraction || '00'}</span>`;
  };
  $('#owedAmount').innerHTML = asMoney(owed);
  $('#youOweAmount').innerHTML = asMoney(owe);
  const owedGroups = Object.values(totals).filter(amount => amount > 0).length;
  const oweGroups = Object.values(totals).filter(amount => amount < 0).length;
  const owedPeople = new Set(state.groups.flatMap(group => {
    const { balances } = balancesFor(group);
    return (balances[currentUser] || 0) > 0 ? group.members.filter(name => name !== currentUser && (balances[name] || 0) < 0) : [];
  }));
  $('#owedGroups').textContent = `${owedGroups} ${owedGroups === 1 ? 'group' : 'groups'}`;
  $('#oweGroups').textContent = `${oweGroups} ${oweGroups === 1 ? 'group' : 'groups'}`;
  $('#owedFriends').textContent = `${owedPeople.size} ${owedPeople.size === 1 ? 'friend' : 'friends'}`;
}

function renderExpenses() {
  const list = $('#activityList');
  list.replaceChildren();
  const expenses = [...state.expenses].sort((a, b) => b.createdAt - a.createdAt);
  $('#allCount').textContent = expenses.length;
  expenses.forEach(expense => {
    const group = groupById(expense.groupId);
    if (!group) return;
    const myShare = (expense.splits || []).find(split => split.name === currentUser)?.cents || 0;
    const impact = expense.payer === currentUser ? expense.amountCents - myShare : -myShare;
    const row = document.createElement('article');
    row.className = 'activity-row';
    row.dataset.kind = 'expenses';
    const impactText = impact > 0 ? `You lent <em>${dollars(impact)}</em>` : impact < 0 ? `You owe <em>${dollars(-impact)}</em>` : 'Your share is covered';
    row.innerHTML = `<div class="activity-icon ticket">✳</div><div class="activity-detail"><b>${safe(expense.description)}</b><span><strong>${safe(expense.payer)}</strong> paid <span class="group-tag">${safe(group.name)}</span></span></div><div class="activity-amount"><b>${dollars(expense.amountCents)}</b><span>${impactText}</span></div>`;
    list.append(row);
  });
  $('#emptyState').style.display = expenses.length ? 'none' : 'block';
  $('#loadMore').style.display = expenses.length ? 'block' : 'none';
  applyFilter(activeFilter);
}

function applyFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.filter === filter));
  document.querySelectorAll('.activity-row').forEach(row => { row.hidden = filter !== 'all' && row.dataset.kind !== filter; });
}

function renderExpenseForm() {
  const groupSelect = $('#expenseGroup');
  groupSelect.innerHTML = state.groups.map(group => `<option value="${safe(group.id)}">${safe(group.name)}</option>`).join('');
  if (currentGroup()) groupSelect.value = currentGroup().id;
  renderExpensePeople();
}

function renderExpensePeople() {
  const group = groupById($('#expenseGroup').value) || currentGroup();
  if (!group) return;
  $('#expensePayer').innerHTML = group.members.map(name => `<option value="${safe(name)}">${name === currentUser ? 'You' : safe(name)}</option>`).join('');
  $('#splitPeople').innerHTML = group.members.map((name, index) => `<label class="split-person"><input type="checkbox" name="splitWith" value="${safe(name)}" checked><span class="avatar avatar-member avatar-color-${index % 4}">${safe(personInitials(name))}</span><span>${name === currentUser ? 'You' : safe(name)}</span></label>`).join('');
}

function renderAll() {
  if (!currentGroup() && state.groups.length) state.currentGroupId = state.groups[0].id;
  const firstName = currentUser.split(/\s+/)[0];
  $('#profileName').textContent = currentUser;
  $('#welcomeName').textContent = firstName;
  $('#profileAvatar').textContent = personInitials(currentUser);
  $('#topAvatar').textContent = personInitials(currentUser);
  renderGroups();
  renderGroupSummary();
  renderOverallBalances();
  renderExpenses();
}

function openExpenseModal() {
  if (!state.groups.length) {
    showToast('Create a group first, then add an expense.');
    openGroupModal();
    return;
  }
  renderExpenseForm();
  $('#modalBackdrop').classList.add('open');
  $('#modalBackdrop').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#expenseForm').elements.description.focus(), 30);
}

function closeExpenseModal() {
  $('#modalBackdrop').classList.remove('open');
  $('#modalBackdrop').setAttribute('aria-hidden', 'true');
}

function openGroupModal() {
  $('#groupModalBackdrop').classList.add('open');
  $('#groupModalBackdrop').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#groupForm').elements.groupName.focus(), 30);
}

function closeGroupModal() {
  $('#groupModalBackdrop').classList.remove('open');
  $('#groupModalBackdrop').setAttribute('aria-hidden', 'true');
}

document.querySelectorAll('#addExpenseTop, #settleButton').forEach(button => button.addEventListener('click', openExpenseModal));
$('#modalClose').addEventListener('click', closeExpenseModal);
$('#groupModalClose').addEventListener('click', closeGroupModal);
$('#modalBackdrop').addEventListener('click', event => { if (event.target === $('#modalBackdrop')) closeExpenseModal(); });
$('#groupModalBackdrop').addEventListener('click', event => { if (event.target === $('#groupModalBackdrop')) closeGroupModal(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeExpenseModal(); closeGroupModal(); }
});

$('#expenseGroup').addEventListener('change', renderExpensePeople);
$('#expenseForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const group = groupById(form.get('groupId'));
  const amountCents = Math.round(Number(form.get('amount')) * 100);
  const payer = form.get('payer');
  const participants = [...event.currentTarget.querySelectorAll('input[name="splitWith"]:checked')].map(input => input.value);
  if (!group || !participants.length || amountCents < 1) {
    showToast('Choose a group, amount, and at least one person to split with.');
    return;
  }
  const baseShare = Math.floor(amountCents / participants.length);
  let remainder = amountCents - baseShare * participants.length;
  const splits = participants.map(name => {
    const cents = baseShare + (remainder-- > 0 ? 1 : 0);
    return { name, cents };
  });
  state.expenses.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    description: form.get('description').trim(),
    amountCents,
    payer,
    groupId: group.id,
    splits,
    createdAt: Date.now()
  });
  state.currentGroupId = group.id;
  persist();
  renderAll();
  closeExpenseModal();
  event.currentTarget.reset();
  showToast('Expense added and split equally.');
});

$('#groupForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = form.get('groupName').trim();
  const friendNames = form.get('members').split(',').map(person => person.trim()).filter(Boolean);
  const members = [currentUser, ...new Set(friendNames.filter(person => person.toLowerCase() !== currentUser.toLowerCase()))];
  if (members.length < 2) {
    showToast('Add at least one friend to your group.');
    return;
  }
  const group = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    emoji: '✈️',
    members
  };
  state.groups.push(group);
  state.currentGroupId = group.id;
  persist();
  renderAll();
  closeGroupModal();
  event.currentTarget.reset();
  showToast(`${group.name} created with ${members.length - 1} ${members.length === 2 ? 'friend' : 'friends'}.`);
});

$('#addTrip').addEventListener('click', openGroupModal);
$('#inviteButton').addEventListener('click', openGroupModal);
$('#profileButton').addEventListener('click', () => {
  const updatedName = prompt('What name should friends see?', currentUser)?.trim();
  if (!updatedName || updatedName === currentUser) return;
  const previousName = currentUser;
  currentUser = updatedName;
  state.userName = currentUser;
  state.groups.forEach(group => { group.members = group.members.map(name => name === previousName ? currentUser : name); });
  state.expenses.forEach(expense => {
    if (expense.payer === previousName) expense.payer = currentUser;
    expense.splits.forEach(split => { if (split.name === previousName) split.name = currentUser; });
  });
  persist();
  renderAll();
  showToast(`Your name is now ${currentUser}.`);
});
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => applyFilter(tab.dataset.filter)));
document.querySelectorAll('.nav-item').forEach(link => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === link));
  $('#crumbCurrent').textContent = link.textContent.trim();
}));
$('#viewAll').addEventListener('click', () => applyFilter('all'));
$('#dismissTip').addEventListener('click', () => $('.tip-card').remove());
$('#searchButton').addEventListener('click', () => {
  const query = prompt('Search expenses, friends, or groups');
  if (!query?.trim()) return;
  let count = 0;
  document.querySelectorAll('.activity-row').forEach(row => {
    const match = row.textContent.toLowerCase().includes(query.toLowerCase());
    row.hidden = !match;
    if (match) count++;
  });
  $('#emptyState').style.display = count ? 'none' : 'block';
  showToast(count ? `${count} matching ${count === 1 ? 'expense' : 'expenses'} found.` : 'No matching expenses found.');
});

renderAll();
}
