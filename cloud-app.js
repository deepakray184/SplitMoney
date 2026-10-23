export function startCloudApp() {
  const config = window.SplitMoneyCloud;
  const client = window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const $ = selector => document.querySelector(selector);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const dollars = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
  const initials = name => String(name || '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  let user, profile, groups = [], expenses = [], selectedGroup = null, signIn = false, toastTimer, joinedInvite = false, activatedUser = null;
  const inviteToken = new URL(location.href).searchParams.get('invite');
  $('#friendsField')?.remove();
  document.querySelector('#groupForm label:nth-of-type(2)').hidden = true;
  $('#groupForm').elements.members.required = false;
  $('#accountAccess').hidden = true;
  document.querySelector('#groupForm .form-hint').textContent = 'Invite links let friends join this group from any device.';
  $('#authBackdrop').classList.add('open');
  $('#authBackdrop').setAttribute('aria-hidden', 'false');
  if (inviteToken) $('#inviteNotice').textContent = 'You were invited to join a trip group. Sign in or create an account to accept.';
  $('#inviteNotice').hidden = !inviteToken;

  function toast(message) {
    const node = $('#toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3000);
  }
  function setAuthMode(nextSignIn) {
    signIn = nextSignIn;
    $('#authTitle').textContent = inviteToken ? 'Join your friends' : signIn ? 'Welcome back' : 'Create your account';
    $('#authSubtitle').textContent = signIn ? 'Sign in to see your groups and shared expenses.' : 'Create an account to share trip expenses with friends.';
    $('#displayNameField').hidden = signIn;
    $('#authForm').elements.displayName.required = !signIn;
    $('#authForm').elements.password.autocomplete = signIn ? 'current-password' : 'new-password';
    $('#authSubmit').innerHTML = signIn ? 'Sign in <span>→</span>' : 'Create account <span>→</span>';
    $('#authToggle').textContent = signIn ? 'New to SplitMoney? Create an account' : 'Already have an account? Sign in';
    $('#authMessage').textContent = '';
  }
  $('#authToggle').addEventListener('click', () => setAuthMode(!signIn));
  $('#authForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    $('#authSubmit').disabled = true;
    $('#authMessage').textContent = signIn ? 'Signing in…' : 'Creating your account…';
    try {
      const result = signIn
        ? await client.auth.signInWithPassword({ email: form.get('email').trim(), password: form.get('password') })
        : await client.auth.signUp({ email: form.get('email').trim(), password: form.get('password'), options: { data: { display_name: form.get('displayName').trim() }, emailRedirectTo: location.origin + location.pathname + location.search } });
      if (result.error) throw result.error;
      if (!signIn && !result.data.session) {
        $('#authMessage').textContent = 'Check your email to confirm your account, then return here to sign in and join the group.';
        setAuthMode(true);
        return;
      }
      if (result.data.session) await activate(result.data.session);
    } catch (error) { $('#authMessage').textContent = error.message || 'Sign-in failed. Please try again.'; }
    finally { $('#authSubmit').disabled = false; }
  });
  $('#profileButton').addEventListener('click', async () => {
    if (!user) return;
    if (confirm(`Signed in as ${user.email}. Sign out?`)) await client.auth.signOut();
  });
  $('#inviteButton').addEventListener('click', () => document.querySelector('#addTrip').click());
  $('#shareGroupInvite').addEventListener('click', createInvite);
  $('#inviteModalClose').addEventListener('click', closeInviteModal);
  $('#inviteModalBackdrop').addEventListener('click', e => { if (e.target === $('#inviteModalBackdrop')) closeInviteModal(); });
  $('#copyInviteLink').addEventListener('click', async () => {
    const value = $('#inviteLinkInput').value;
    try { await navigator.clipboard.writeText(value); $('#inviteLinkMessage').textContent = 'Invite link copied. Send it to your friends.'; }
    catch { $('#inviteLinkInput').select(); $('#inviteLinkMessage').textContent = 'Copy the selected invite link and send it to your friends.'; }
  });
  $('#addTrip').addEventListener('click', () => { $('#groupModalBackdrop').classList.add('open'); $('#groupModalBackdrop').setAttribute('aria-hidden', 'false'); });
  $('#groupModalClose').addEventListener('click', closeGroupModal);
  $('#groupModalBackdrop').addEventListener('click', e => { if (e.target === $('#groupModalBackdrop')) closeGroupModal(); });
  $('#groupForm').addEventListener('submit', async event => {
    event.preventDefault(); const name = new FormData(event.currentTarget).get('groupName').trim();
    const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
    const { data, error } = await client.rpc('create_trip_group', { group_name: name }); button.disabled = false;
    if (error) return toast(error.message);
    closeGroupModal(); event.currentTarget.reset(); await refresh(data); toast('Group created. Invite friends to join.'); await createInvite();
  });
  document.querySelectorAll('#addExpenseTop, #settleButton').forEach(button => button.addEventListener('click', openExpense));
  $('#modalClose').addEventListener('click', closeExpense);
  $('#modalBackdrop').addEventListener('click', e => { if (e.target === $('#modalBackdrop')) closeExpense(); });
  $('#expenseGroup').addEventListener('change', renderParticipants);
  $('#expenseForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const group = groups.find(g => g.id === form.get('groupId'));
    const amount = Math.round(Number(form.get('amount')) * 100); const ids = [...event.currentTarget.querySelectorAll('[name="splitWith"]:checked')].map(input => input.value);
    if (!group || !ids.length || amount < 1) return toast('Choose a group, amount, and at least one person.');
    const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true;
    const { data: expense, error } = await client.from('expenses').insert({ group_id: group.id, description: form.get('description').trim(), amount_cents: amount, payer_id: form.get('payer') }).select().single();
    if (error) { submit.disabled = false; return toast(error.message); }
    const shareRows = ids.map((id, index) => ({ expense_id: expense.id, user_id: id, cents: Math.floor(amount / ids.length) + (index < amount % ids.length ? 1 : 0) }));
    const result = await client.from('expense_splits').insert(shareRows); submit.disabled = false;
    if (result.error) { await client.from('expenses').delete().eq('id', expense.id); return toast(result.error.message); }
    closeExpense(); event.currentTarget.reset(); await refresh(group.id); toast('Expense added and split equally.');
  });
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(node => node.classList.toggle('active', node === tab));
    document.querySelectorAll('.activity-row').forEach(row => row.hidden = tab.dataset.filter !== 'all' && row.dataset.kind !== tab.dataset.filter);
  }));
  $('#dismissTip').addEventListener('click', () => $('.tip-card').remove());
  $('#searchButton').addEventListener('click', () => {
    const query = prompt('Search expenses, friends, or groups'); if (!query?.trim()) return;
    document.querySelectorAll('.activity-row').forEach(row => row.hidden = !row.textContent.toLowerCase().includes(query.toLowerCase()));
  });
  document.querySelectorAll('.nav-item').forEach(link => link.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === link)); $('#crumbCurrent').textContent = link.textContent.trim();
  }));
  $('#viewAll').addEventListener('click', () => document.querySelector('[data-filter="all"]').click());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeExpense(); closeGroupModal(); closeInviteModal(); } });

  function closeGroupModal() { $('#groupModalBackdrop').classList.remove('open'); $('#groupModalBackdrop').setAttribute('aria-hidden', 'true'); }
  function closeExpense() { $('#modalBackdrop').classList.remove('open'); $('#modalBackdrop').setAttribute('aria-hidden', 'true'); }
  function closeInviteModal() { $('#inviteModalBackdrop').classList.remove('open'); $('#inviteModalBackdrop').setAttribute('aria-hidden', 'true'); }
  function openExpense() {
    if (!groups.length) return toast('Create a group first, then add an expense.');
    $('#expenseGroup').innerHTML = groups.map(g => `<option value="${safe(g.id)}">${safe(g.name)}</option>`).join('');
    $('#expenseGroup').value = selectedGroup || groups[0].id; renderParticipants();
    $('#modalBackdrop').classList.add('open'); $('#modalBackdrop').setAttribute('aria-hidden', 'false');
  }
  function renderParticipants() {
    const group = groups.find(g => g.id === $('#expenseGroup').value); if (!group) return;
    $('#expensePayer').innerHTML = group.members.map(m => `<option value="${safe(m.id)}">${m.id === user.id ? 'You' : safe(m.name)}</option>`).join('');
    $('#splitPeople').innerHTML = group.members.map((m, i) => `<label class="split-person"><input type="checkbox" name="splitWith" value="${safe(m.id)}" checked><span class="avatar avatar-member avatar-color-${i % 4}">${safe(initials(m.name))}</span><span>${m.id === user.id ? 'You' : safe(m.name)}</span></label>`).join('');
  }
  function balancesFor(group) {
    const balances = Object.fromEntries(group.members.map(m => [m.id, 0]));
    const groupExpenses = expenses.filter(e => e.group_id === group.id);
    groupExpenses.forEach(e => { balances[e.payer_id] = (balances[e.payer_id] || 0) + e.amount_cents; e.splits.forEach(s => balances[s.user_id] = (balances[s.user_id] || 0) - s.cents); });
    return { balances, groupExpenses };
  }
  async function refresh(preferred = selectedGroup) {
    const { data: memberships, error: memberError } = await client.from('group_members').select('group_id,user_id,display_name,groups(id,name,emoji)').order('created_at');
    if (memberError) { toast(memberError.message); return; }
    const groupsMap = new Map();
    memberships.forEach(m => { const g = m.groups; if (!g) return; if (!groupsMap.has(g.id)) groupsMap.set(g.id, { ...g, members: [] }); groupsMap.get(g.id).members.push({ id: m.user_id, name: m.display_name }); });
    groups = [...groupsMap.values()];
    const ids = groups.map(g => g.id);
    if (ids.length) {
      const { data: rows, error } = await client.from('expenses').select('id,group_id,description,amount_cents,payer_id,created_at,expense_splits(user_id,cents)').in('group_id', ids).order('created_at', { ascending: false });
      if (error) { toast(error.message); return; } expenses = rows || [];
    } else expenses = [];
    selectedGroup = groups.some(g => g.id === preferred) ? preferred : groups[0]?.id || null;
    render();
  }
  function render() {
    profile = user.user_metadata?.display_name || user.email.split('@')[0];
    $('#profileName').textContent = profile; $('#accountCaption').textContent = user.email;
    $('#profileAvatar').textContent = initials(profile); $('#topAvatar').textContent = initials(profile); $('#welcomeName').textContent = profile.split(/\s+/)[0];
    $('#tripList').replaceChildren();
    groups.forEach(group => { const a = document.createElement('a'); a.href = `#group-${encodeURIComponent(group.id)}`; a.className = `trip-link${group.id === selectedGroup ? ' selected' : ''}`; a.innerHTML = `<span class="trip-emoji">${safe(group.emoji || '✈️')}</span><span>${safe(group.name)}</span>${group.id === selectedGroup ? '<i class="trip-dot"></i>' : ''}`; a.addEventListener('click', e => { e.preventDefault(); selectedGroup = group.id; render(); }); $('#tripList').append(a); });
    $('#groupCount').textContent = groups.length;
    const group = groups.find(g => g.id === selectedGroup); const { balances, groupExpenses } = group ? balancesFor(group) : { balances: {}, groupExpenses: [] };
    if (group) {
      const mine = balances[user.id] || 0; $('#currentGroupName').textContent = group.name; $('#balanceGroupName').textContent = group.name; $('#currentGroupEmoji').textContent = group.emoji || '✈️';
      $('#currentGroupMembers').textContent = `${group.members.length} people · ${groupExpenses.length} expenses`; $('#currentGroupPeople').textContent = `${group.members.length} people`; $('#groupPeopleCount').textContent = `${group.members.length} people`;
      $('#currentGroupAvatars').innerHTML = group.members.slice(0, 4).map((m, i) => `<span class="avatar avatar-member avatar-color-${i % 4}" title="${safe(m.name)}">${safe(initials(m.name))}</span>`).join('');
      $('#groupTotal').textContent = dollars(groupExpenses.reduce((s, e) => s + e.amount_cents, 0)); $('#groupNet').textContent = mine > 0 ? `You are owed ${dollars(mine)}` : mine < 0 ? `You owe ${dollars(-mine)}` : 'You are all settled up'; $('#groupNet').className = mine < 0 ? 'negative' : 'positive';
      $('#memberBalances').innerHTML = group.members.filter(m => m.id !== user.id).map((m, i) => { const value = balances[m.id] || 0; return `<div class="balance-person"><span class="avatar avatar-member avatar-color-${i % 4}">${safe(initials(m.name))}</span><span class="person-name"><b>${safe(m.name)}</b><small>${value > 0 ? 'is owed' : value < 0 ? 'owes the group' : 'all settled up'}</small></span><b class="person-amount ${value > 0 ? 'positive' : value < 0 ? 'negative' : ''}">${dollars(Math.abs(value))}</b></div>`; }).join('') || '<p class="balance-empty">Invite friends to see shared balances.</p>';
    } else { $('#currentGroupName').textContent = 'No groups yet'; $('#balanceGroupName').textContent = 'Create a group to get started'; $('#currentGroupMembers').textContent = '0 people'; $('#currentGroupPeople').textContent = '0 people'; $('#groupPeopleCount').textContent = '0 people'; $('#currentGroupAvatars').replaceChildren(); $('#groupTotal').textContent = '$0.00'; $('#groupNet').textContent = 'Even'; $('#memberBalances').innerHTML = '<p class="balance-empty">Create a group and invite your friends.</p>'; }
    const groupBalances = groups.map(g => balancesFor(g).balances[user.id] || 0); const owed = groupBalances.filter(x => x > 0).reduce((a,b) => a+b,0); const owe = -groupBalances.filter(x => x < 0).reduce((a,b) => a+b,0);
    const displayMoney = n => { const [whole, frac] = dollars(n).replace('$','').split('.'); return `<span class="money-whole">$${whole}</span><span>.${frac}</span>`; };
    $('#owedAmount').innerHTML = displayMoney(owed); $('#youOweAmount').innerHTML = displayMoney(owe); $('#owedGroups').textContent = `${groupBalances.filter(x => x > 0).length} groups`; $('#oweGroups').textContent = `${groupBalances.filter(x => x < 0).length} groups`; $('#owedFriends').textContent = `${new Set(groups.flatMap(g => (balancesFor(g).balances[user.id] || 0) > 0 ? g.members.filter(m => m.id !== user.id && (balancesFor(g).balances[m.id] || 0) < 0).map(m => m.id) : [])).size} friends`;
    const memberNames = Object.fromEntries(groups.flatMap(g => g.members.map(m => [m.id, m.name])));
    const emptyState = $('#emptyState'); $('#activityList').replaceChildren(emptyState); $('#allCount').textContent = expenses.length;
    expenses.forEach(e => { const g = groups.find(item => item.id === e.group_id); if (!g) return; const share = e.expense_splits.find(s => s.user_id === user.id)?.cents || 0; const impact = e.payer_id === user.id ? e.amount_cents - share : -share; const row = document.createElement('article'); row.className = 'activity-row'; row.dataset.kind = 'expenses'; row.innerHTML = `<div class="activity-icon ticket">✳</div><div class="activity-detail"><b>${safe(e.description)}</b><span><strong>${safe(memberNames[e.payer_id] || 'Group member')}</strong> paid <span class="group-tag">${safe(g.name)}</span></span></div><div class="activity-amount"><b>${dollars(e.amount_cents)}</b><span>${impact > 0 ? `You lent <em>${dollars(impact)}</em>` : impact < 0 ? `You owe <em>${dollars(-impact)}</em>` : 'Your share is covered'}</span></div>`; $('#activityList').append(row); });
    $('#emptyState').style.display = expenses.length ? 'none' : 'block'; $('#loadMore').style.display = expenses.length ? 'block' : 'none';
  }
  async function createInvite() {
    if (!selectedGroup) return toast('Create a group before inviting friends.');
    const { data, error } = await client.rpc('create_group_invite', { target_group: selectedGroup });
    if (error) return toast(error.message);
    const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('invite', data);
    $('#inviteLinkInput').value = url.toString(); $('#inviteLinkMessage').textContent = 'Link expires in 30 days. Anyone with the link can join.';
    $('#inviteModalBackdrop').classList.add('open'); $('#inviteModalBackdrop').setAttribute('aria-hidden', 'false');
  }
  async function activate(session) {
    user = session.user;
    if (activatedUser === user.id) return;
    activatedUser = user.id;
    if (inviteToken && !joinedInvite) {
      const { error } = await client.rpc('join_group_with_invite', { invite_token: inviteToken });
      if (error) { activatedUser = null; $('#authBackdrop').classList.add('open'); $('#authMessage').textContent = `Could not join this group: ${error.message}`; return; }
      joinedInvite = true;
      const url = new URL(location.href); url.searchParams.delete('invite'); history.replaceState({}, '', url); toast('You joined the invited group.');
    }
    $('#authBackdrop').classList.remove('open'); $('#authBackdrop').setAttribute('aria-hidden', 'true');
    await refresh();
    client.channel('splitmoney-changes').on('postgres_changes', { event: '*', schema: 'public' }, () => refresh()).subscribe();
    setInterval(() => { if (!document.hidden) refresh(); }, 20000);
  }
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { user = null; activatedUser = null; joinedInvite = false; groups = []; expenses = []; $('#authBackdrop').classList.add('open'); $('#authBackdrop').setAttribute('aria-hidden', 'false'); setAuthMode(true); }
    if (event === 'SIGNED_IN' && session && !user) setTimeout(() => activate(session), 0);
  });
  client.auth.getSession().then(({ data }) => { if (data.session) activate(data.session); else setAuthMode(false); });
}
