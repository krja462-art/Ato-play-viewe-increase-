import React, { useState, useEffect } from 'react';
import { User, Transaction } from '../types';
import { Wallet as WalletIcon, Coins, Gift, Flame, CreditCard, ArrowUpRight, ArrowDownLeft, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface WalletProps {
  user: User;
  onWalletUpdated: (updatedUser: User) => void;
  onClaimCheckin: () => void;
  onWatchAd: () => void;
}

export const Wallet: React.FC<WalletProps> = ({
  user,
  onWalletUpdated,
  onClaimCheckin,
  onWatchAd
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      setLoadingTx(true);
      const data = await apiFetch('/api/transactions');
      if (data?.success && Array.isArray(data.transactions)) {
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.error('Failed to load transactions', err);
    } finally {
      setLoadingTx(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handlePurchase = async (packId: string, coins: number, price: number) => {
    try {
      setPurchasing(packId);
      setSuccessMsg(null);
      const data = await apiFetch('/api/wallet/purchase', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ packId, coins, price, coinsAmount: coins, priceInr: price })
      });
      if (data?.success) {
        if (data.user) {
          onWalletUpdated(data.user);
        }
        setSuccessMsg(data.message);
        fetchTransactions();
      }
    } catch (err) {
      console.error('Purchase failed', err);
    } finally {
      setPurchasing(null);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const hasCheckedInToday = user.lastCheckIn === today;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Wallet Balance Hero */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 text-white rounded-3xl p-6 sm:p-10 shadow-xl border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold uppercase tracking-wider border border-yellow-500/30">
            <Coins className="w-3.5 h-3.5" />
            <span>Secure Coin Wallet</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            {user.coins.toLocaleString()} <span className="text-yellow-400 text-2xl">Virtual Coins</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Used for launching AtoPlay promotion campaigns and boosting view exchange speed.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onWatchAd}
            className="px-6 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-lg shadow-purple-600/30 transition-all hover:scale-105 flex items-center space-x-2"
          >
            <Gift className="w-4 h-4" />
            <span>Earn Ad Reward (+100)</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-center space-x-3 shadow-md">
          <CheckCircle2 className="w-6 h-6 flex-shrink-0 text-emerald-600" />
          <div className="text-sm font-bold">{successMsg}</div>
        </div>
      )}

      {/* In-App Purchase Coin Packs & Daily Check-In Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* IAP Coin Packs */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">In-App Purchase (IAP) Coin Packs</h2>
            <p className="text-sm text-zinc-500">Directly buy coin packs securely via gateway simulation</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            
            <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-red-500/50 transition-all">
              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold uppercase tracking-wider">
                  Starter Pack
                </span>
                <h3 className="text-2xl font-extrabold text-zinc-900">1,000 Coins</h3>
                <p className="text-xs text-zinc-500">Perfect for trying out your first 2 campaign boosts.</p>
              </div>
              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-lg font-bold text-zinc-900">$2.99</span>
                <button
                  onClick={() => handlePurchase('pack_1k', 1000, 2.99)}
                  disabled={purchasing === 'pack_1k'}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/20 transition-all hover:scale-105"
                >
                  {purchasing === 'pack_1k' ? 'Processing...' : 'Buy Now'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border-2 border-red-500 shadow-lg flex flex-col justify-between space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                Most Popular
              </div>
              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider">
                  Creator Pro
                </span>
                <h3 className="text-2xl font-extrabold text-zinc-900">5,000 Coins</h3>
                <p className="text-xs text-zinc-500">Save 25% with our best value creator pack.</p>
              </div>
              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-lg font-bold text-zinc-900">$9.99</span>
                <button
                  onClick={() => handlePurchase('pack_5k', 5000, 9.99)}
                  disabled={purchasing === 'pack_5k'}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/20 transition-all hover:scale-105"
                >
                  {purchasing === 'pack_5k' ? 'Processing...' : 'Buy Now'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-red-500/50 transition-all">
              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-600 text-xs font-bold uppercase tracking-wider">
                  Mega Enterprise
                </span>
                <h3 className="text-2xl font-extrabold text-zinc-900">15,000 Coins</h3>
                <p className="text-xs text-zinc-500">Maximum growth for professional AtoPlay channels.</p>
              </div>
              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-lg font-bold text-zinc-900">$24.99</span>
                <button
                  onClick={() => handlePurchase('pack_15k', 15000, 24.99)}
                  disabled={purchasing === 'pack_15k'}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/20 transition-all hover:scale-105"
                >
                  {purchasing === 'pack_15k' ? 'Processing...' : 'Buy Now'}
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Daily Check-In Widget */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <Flame className="w-6 h-6 fill-current" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-zinc-900">Daily Check-In Streak</h3>
                <p className="text-xs text-zinc-500">Day {user.streak} Login Reward</p>
              </div>
            </div>
            <p className="text-sm text-zinc-600">
              Log in daily and claim your streak bonus to earn free coins without spending cash.
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-100">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-zinc-500">Streak Progress</span>
              <span className="text-amber-600 font-bold">{user.streak} Days Active</span>
            </div>
            <button
              onClick={onClaimCheckin}
              disabled={hasCheckedInToday}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                hasCheckedInToday
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 hover:scale-105'
              }`}
            >
              {hasCheckedInToday ? 'Checked In Today ✓' : `Claim Day ${user.streak} Reward`}
            </button>
          </div>
        </div>

      </div>

      {/* Transaction History Log */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200 shadow-sm space-y-6">
        <div>
          <h3 className="text-xl font-bold text-zinc-900">Secure Transaction Ledger</h3>
          <p className="text-sm text-zinc-500">Encrypted ledger logging all coin earnings, spendings, and purchases</p>
        </div>

        {loadingTx ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-zinc-500">Loading ledger...</p>
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-8">No transactions recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {transactions.map(tx => {
              const isPositive = tx.amount > 0;
              return (
                <div key={tx.id} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isPositive ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {isPositive ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-zinc-900">{tx.description}</h4>
                      <p className="text-xs text-zinc-500">{new Date(tx.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className={`text-base font-extrabold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isPositive ? `+${tx.amount}` : tx.amount} Coins
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
