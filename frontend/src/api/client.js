async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  me: () => request('/api/auth/me'),
  register: (body) => request('/api/auth/register', { method: 'POST', body }),
  login: (body) => request('/api/auth/login', { method: 'POST', body }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  updateProfile: (body) => request('/api/auth/profile', { method: 'PUT', body }),

  // Paychecks
  getPaychecks: () => request('/api/paychecks'),
  createPaycheck: (body) => request('/api/paychecks', { method: 'POST', body }),
  updatePaycheck: (id, body) => request(`/api/paychecks/${id}`, { method: 'PUT', body }),
  deletePaycheck: (id) => request(`/api/paychecks/${id}`, { method: 'DELETE' }),

  // Bills
  getBills: () => request('/api/bills'),
  createBill: (body) => request('/api/bills', { method: 'POST', body }),
  updateBill: (id, body) => request(`/api/bills/${id}`, { method: 'PUT', body }),
  deleteBill: (id) => request(`/api/bills/${id}`, { method: 'DELETE' }),
  deleteBillGroup: (groupId) => request(`/api/bills/group/${groupId}`, { method: 'DELETE' }),
  reorderBills: (updates) => request('/api/bills/reorder', { method: 'PUT', body: updates }),

  // Balance
  getBalance: () => request('/api/balance'),
  setBalance: (balance) => request('/api/balance', { method: 'PUT', body: { balance } }),

  // Debts
  getDebts: () => request('/api/debts'),
  createDebt: (body) => request('/api/debts', { method: 'POST', body }),
  updateDebt: (id, body) => request(`/api/debts/${id}`, { method: 'PUT', body }),
  deleteDebt: (id) => request(`/api/debts/${id}`, { method: 'DELETE' }),
  reorderDebts: (updates) => request('/api/debts/reorder', { method: 'PUT', body: updates }),
};
