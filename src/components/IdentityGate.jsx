import React, { useState } from 'react';
import { UserCircle, ChevronDown, LogOut, RefreshCw } from 'lucide-react';

// --- localStorage helpers (store the stable id, not the name → rename-safe) ----
export function readStoredIdentityId(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw).id || null) : null;
  } catch {
    return null;
  }
}

export function storeIdentityId(storageKey, id) {
  try { localStorage.setItem(storageKey, JSON.stringify({ id })); } catch { /* ignore */ }
}

export function clearStoredIdentity(storageKey) {
  try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
}

// --- Blocking name-selection popup ----------------------------------------
// people: [{ id, name, role? }]. onPick(person, remember) is called on select.
export function IdentityPicker({ title, subtitle, people, onPick, loading, error, onRetry }) {
  const [remember, setRemember] = useState(true);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{title}</h2>
        <p className="text-gray-600 mb-6">{subtitle}</p>

        {loading ? (
          <div className="flex items-center gap-3 text-gray-600">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            Laddar namn…
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-red-600 text-sm">{error}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold transition"
              >
                <RefreshCw className="w-4 h-4" /> Försök igen
              </button>
            )}
          </div>
        ) : people.length === 0 ? (
          <p className="text-gray-600 text-sm">Inga namn konfigurerade ännu.</p>
        ) : (
          <>
            <div className="space-y-3">
              {people.map(person => (
                <button
                  key={person.id}
                  onClick={() => onPick(person, remember)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-lg font-semibold transition text-left flex items-center justify-between"
                >
                  <span>{person.name}</span>
                  {person.role && <span className="text-sm text-indigo-200">{person.role}</span>}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 mt-5 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              Kom ihåg mig på den här datorn
            </label>
          </>
        )}
      </div>
    </div>
  );
}

// --- Header chip showing the active identity, with a switch action ----------
export function IdentityChip({ person, onSwitch }) {
  const [open, setOpen] = useState(false);
  if (!person) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium transition"
      >
        <UserCircle className="w-5 h-5 text-indigo-600" />
        <span className="text-sm">Du är: <strong>{person.name}</strong></span>
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
          <button
            onClick={() => { setOpen(false); onSwitch(); }}
            className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
          >
            <LogOut className="w-4 h-4" /> Byt person
          </button>
        </div>
      )}
    </div>
  );
}
