import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Coins, Search, ArrowLeft, Shield, UserCheck, PlusCircle, MinusCircle, Edit3, Check, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getAllFirestoreUsers, updateFirestoreUserCoins, deleteFirestoreUser, blockFirestoreUser } from '../lib/firebase';

interface AdminUsersProps {
  user: User;
  setActiveTab: (tab: string) => void;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({ user, setActiveTab }) => {
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [coinAction, setCoinAction] = useState<'add' | 'subtract' | 'set'>('add');
  const [coinAmount, setCoinAmount] = useState<string>('100');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Try fetching from server API
      const res = await apiFetch('/api/admin/users');
      if (res?.success && Array.isArray(res.users)) {
        setUsersList(res.users);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn('API fetch users failed, falling back to Firestore:', err);
    }

    try {
      // 2. Fallback to Firestore users collection
      const fsUsers = await getAllFirestoreUsers();
      if (fsUsers.length > 0) {
        setUsersList(fsUsers);
      }
    } catch (err) {
      console.error('Firestore users fetch error:', err);
      setErrorMsg('Failed to load registered users list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdateCoins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    const amount = Number(coinAmount);
    if (isNaN(amount) || amount < 0) {
      setErrorMsg('Please enter a valid coin amount.');
      return;
    }

    let newCoins = selectedUser.coins;
    if (coinAction === 'add') {
      newCoins = (selectedUser.coins || 0) + amount;
    } else if (coinAction === 'subtract') {
      newCoins = Math.max(0, (selectedUser.coins || 0) - amount);
    } else if (coinAction === 'set') {
      newCoins = amount;
    }

    try {
      // Update backend
      await apiFetch('/api/admin/users/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount,
          action: coinAction
        })
      });

      // Update Firestore
      await updateFirestoreUserCoins(selectedUser.id, newCoins);

      // Update local state
      setUsersList(prev => prev.map(u => u.id === selectedUser.id ? { ...u, coins: newCoins } : u));
      setSuccessMsg(`Successfully updated coins for ${selectedUser.email}!`);
      setSelectedUser(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Failed to update user coins:', err);
      setErrorMsg('Failed to update user coins. Please try again.');
    }
  };

  const filteredUsers = usersList.filter(u => 
    (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.referralCode && u.referralCode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isAdmin = user?.isAdmin || user?.email?.toLowerCase().trim() === 'krja462@gmail.com';

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-zinc-900 mb-2">Access Denied</h2>
        <p className="text-zinc-600 mb-6">You must be logged in as Administrator to view the Google Users directory.</p>
        <button
          onClick={() => setActiveTab('home')}
          className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all cursor-pointer"
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      
      {/* Top Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div>
          <button
            onClick={() => setActiveTab('home')}
            className="inline-flex items-center space-x-2 text-sm font-bold text-blue-600 hover:text-blue-700 mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
          <h1 className="text-3xl font-black text-zinc-900 tracking-tight flex items-center space-x-3">
            <span>Google Login Users Directory</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-extrabold uppercase">
              Admin Portal
            </span>
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            Manage all registered Google creators, check wallet coin balances, and add or deduct coins instantly.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm font-bold text-zinc-700 hover:bg-zinc-50 shadow-xs cursor-pointer transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh List</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center space-x-3 shadow-xs">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-bold">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex items-center space-x-3 shadow-xs">
          <span className="text-sm font-bold">{errorMsg}</span>
        </div>
      )}

      {/* Search Bar & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Google Users</p>
            <p className="text-2xl font-black text-zinc-900 mt-0.5">{usersList.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Coins in Wallets</p>
            <p className="text-2xl font-black text-amber-600 mt-0.5">
              {usersList.reduce((acc, u) => acc + (u.isAdmin ? 0 : (u.coins || 0)), 0).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Active Admin</p>
            <p className="text-sm font-black text-purple-900 mt-0.5 truncate max-w-[200px]">krja462@gmail.com</p>
          </div>
        </div>
      </div>

      {/* Search Filter Input */}
      <div className="mb-6 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by creator name, Gmail address, or referral code..."
          className="w-full pl-12 pr-4 py-3 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder:text-zinc-400 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-600 shadow-xs"
        />
      </div>

      {/* Users List Table / Grid */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-600 font-bold">Loading registered Google accounts...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-3xl p-12 text-center shadow-xs">
          <UserCheck className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
          <h3 className="text-lg font-black text-zinc-900 mb-1">No users found</h3>
          <p className="text-sm text-zinc-500">No registered Google users match your search criteria.</p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-xs font-black text-zinc-500 uppercase tracking-wider">
                  <th className="py-4 px-6">Google Account</th>
                  <th className="py-4 px-6">Referral Code</th>
                  <th className="py-4 px-6">Wallet Balance</th>
                  <th className="py-4 px-6">Referrals / Earned</th>
                  <th className="py-4 px-6 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        <img
                          src={u.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80'}
                          alt={u.name}
                          className="w-10 h-10 rounded-full object-cover border border-zinc-200 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <p className="text-sm font-extrabold text-zinc-900 flex items-center space-x-2">
                            <span>{u.name}</span>
                            {u.isAdmin && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-black uppercase">
                                Admin
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-zinc-500 font-medium">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-800 font-mono text-xs font-bold border border-zinc-200">
                        {u.referralCode || 'REF-XXXX'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-sm font-black">
                        <Coins className="w-4 h-4 text-amber-600" />
                        <span>{u.isAdmin ? '∞ Unlimited' : (u.coins || 0).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-xs font-bold text-zinc-800">{u.referralsCount || 0} friends</p>
                      <p className="text-[11px] text-zinc-500 font-medium">+{u.referralEarnings || 0} coins earned</p>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => {
                            setSelectedUser(u);
                            setCoinAmount('100');
                            setCoinAction('add');
                          }}
                          className="inline-flex items-center space-x-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all cursor-pointer"
                          title="Edit Coins"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>

                        {!u.isAdmin && u.email?.toLowerCase().trim() !== 'krja462@gmail.com' && (
                          <>
                            <button
                              onClick={async () => {
                                const newBlockedStatus = !u.isBlocked;
                                const confirmMsg = newBlockedStatus 
                                  ? `Are you sure you want to block ${u.name || u.email}? They will not be able to log in.`
                                  : `Unblock ${u.name || u.email}?`;
                                if (window.confirm(confirmMsg)) {
                                  try {
                                    await apiFetch('/api/admin/users/block', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ userId: u.id, isBlocked: newBlockedStatus })
                                    });
                                    await blockFirestoreUser(u.id, newBlockedStatus);
                                    setUsersList(prev => prev.map(item => item.id === u.id ? { ...item, isBlocked: newBlockedStatus } : item));
                                    setSuccessMsg(`User ${newBlockedStatus ? 'blocked' : 'unblocked'} successfully.`);
                                    setTimeout(() => setSuccessMsg(null), 3000);
                                  } catch (err) {
                                    setErrorMsg('Failed to update user status.');
                                  }
                                }
                              }}
                              className={`px-3 py-2 text-xs font-extrabold rounded-xl shadow-xs transition-all cursor-pointer ${
                                u.isBlocked 
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                  : 'bg-amber-500 hover:bg-amber-600 text-white'
                              }`}
                              title={u.isBlocked ? "Unblock user" : "Block user"}
                            >
                              <span>{u.isBlocked ? 'Unblock' : 'Block'}</span>
                            </button>

                            <button
                              onClick={async () => {
                                if (window.confirm(`⚠️ PERMANENT DELETE: Are you sure you want to permanently delete account ${u.name || u.email}? This action cannot be undone.`)) {
                                  try {
                                    await apiFetch('/api/admin/users/delete', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ userId: u.id })
                                    });
                                    await deleteFirestoreUser(u.id);
                                    setUsersList(prev => prev.filter(item => item.id !== u.id));
                                    setSuccessMsg(`User ${u.email} permanently deleted.`);
                                    setTimeout(() => setSuccessMsg(null), 3000);
                                  } catch (err) {
                                    setErrorMsg('Failed to delete user account.');
                                  }
                                }
                              }}
                              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all cursor-pointer"
                              title="Permanently Delete"
                            >
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit User Coins Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-zinc-200 animate-in fade-in zoom-in duration-200">
            
            <div className="flex items-center space-x-4 mb-6">
              <img
                src={selectedUser.avatar}
                alt={selectedUser.name}
                className="w-14 h-14 rounded-full object-cover border-2 border-blue-600 shrink-0"
                referrerPolicy="no-referrer"
              />
              <div>
                <h3 className="text-lg font-black text-zinc-900">{selectedUser.name}</h3>
                <p className="text-xs text-zinc-500 font-medium">{selectedUser.email}</p>
                <p className="text-xs font-extrabold text-amber-800 mt-1">
                  Current Balance: {(selectedUser.coins || 0).toLocaleString()} Coins
                </p>
              </div>
            </div>

            <form onSubmit={handleUpdateCoins} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
                  Coin Action
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCoinAction('add')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1 cursor-pointer transition-all ${
                      coinAction === 'add'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Add (+)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCoinAction('subtract')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1 cursor-pointer transition-all ${
                      coinAction === 'subtract'
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    <MinusCircle className="w-3.5 h-3.5" />
                    <span>Deduct (-)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCoinAction('set')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1 cursor-pointer transition-all ${
                      coinAction === 'set'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Set Exact</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
                  {coinAction === 'set' ? 'New Exact Coin Balance' : 'Coin Amount'}
                </label>
                <div className="relative">
                  <Coins className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-600" />
                  <input
                    type="number"
                    min="0"
                    value={coinAmount}
                    onChange={(e) => setCoinAmount(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-zinc-900 font-black text-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-5 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 font-bold text-sm hover:bg-zinc-100 cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-md shadow-blue-600/20 cursor-pointer transition-all"
                >
                  Confirm & Save
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
