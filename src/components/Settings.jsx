import React, { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, Lock, Plus, Trash2, X, Save, Users, UserCog, Calendar } from 'lucide-react';
import MeetingRulesEditor from './MeetingRulesEditor';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

const genId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Self-contained Settings panel: PIN gate → tabbed editor. Saves the full config
// explicitly via PUT /api/settings (never via the meetings auto-save).
const Settings = ({ onClose }) => {
  const [stage, setStage] = useState('pin'); // 'pin' | 'editor'
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('directors'); // 'rules' | 'directors' | 'admins'
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const loadConfig = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(JSON.parse(JSON.stringify(data.config))); // editable deep copy
    } catch (err) {
      console.error('Failed to load settings:', err);
      setLoadError('Kunde inte ladda inställningarna.');
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const verifyPin = async () => {
    setVerifying(true);
    setPinError('');
    try {
      const res = await fetch(`${API_URL}/api/settings/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (data.ok) setStage('editor');
      else setPinError('Fel PIN. Försök igen.');
    } catch (err) {
      setPinError('Kunde inte verifiera PIN. Är servern igång?');
    } finally {
      setVerifying(false);
    }
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, pin }) // PIN re-verified server-side
      });
      if (res.status === 401) { setSavedMsg('Fel PIN — kunde inte spara.'); return; }
      if (res.status === 429) { setSavedMsg('För många försök — vänta en stund.'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // If the PIN was changed, keep using the new value for subsequent saves.
      if (config.settingsPin && String(config.settingsPin).trim() !== '') {
        setPin(String(config.settingsPin).trim());
      }
      setSavedMsg('Sparat ✓');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSavedMsg('Kunde inte spara — försök igen.');
    } finally {
      setSaving(false);
    }
  };

  // --- roster editing helpers ---------------------------------------------
  const updatePerson = (key, idx, field, value) => {
    setConfig(prev => {
      const next = { ...prev, [key]: prev[key].map((p, i) => i === idx ? { ...p, [field]: value } : p) };
      return next;
    });
  };
  const addPerson = (key, template) => {
    setConfig(prev => ({ ...prev, [key]: [...(prev[key] || []), template] }));
  };
  const removePerson = (key, idx) => {
    setConfig(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));
  };

  // --- PIN gate ------------------------------------------------------------
  if (stage === 'pin') {
    return (
      <Overlay>
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-bold text-gray-800">Inställningar</h2>
          </div>
          <p className="text-gray-600 mb-4 text-sm">Ange PIN för att öppna inställningarna.</p>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && verifyPin()}
            autoFocus
            placeholder="PIN"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {pinError && <p className="text-red-600 text-sm mb-3">{pinError}</p>}
          <div className="flex gap-3">
            <button
              onClick={verifyPin}
              disabled={verifying || !pin}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold transition"
            >
              {verifying ? 'Verifierar…' : 'Öppna'}
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition">
              Avbryt
            </button>
          </div>
        </div>
      </Overlay>
    );
  }

  // --- editor --------------------------------------------------------------
  return (
    <Overlay>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-bold text-gray-800">Inställningar</h2>
          </div>
          <div className="flex items-center gap-3">
            {savedMsg && <span className="text-sm text-green-700">{savedMsg}</span>}
            <button
              onClick={save}
              disabled={saving || !config}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition"
            >
              <Save className="w-4 h-4" /> {saving ? 'Sparar…' : 'Spara'}
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition" title="Stäng">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          <TabButton active={activeTab === 'rules'} onClick={() => setActiveTab('rules')} icon={Calendar} label="Mötesregler" />
          <TabButton active={activeTab === 'directors'} onClick={() => setActiveTab('directors')} icon={Users} label="Directors" />
          <TabButton active={activeTab === 'admins'} onClick={() => setActiveTab('admins')} icon={UserCog} label="Administratörer" />
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {loadError && <p className="text-red-600">{loadError}</p>}
          {!config && !loadError && <p className="text-gray-600">Laddar…</p>}

          {config && activeTab === 'rules' && (
            <MeetingRulesEditor
              rules={config.meetingRules || {}}
              onChange={(newRules) => setConfig(prev => ({ ...prev, meetingRules: newRules }))}
            />
          )}

          {config && activeTab === 'directors' && (
            <RosterEditor
              title="Directors"
              hint="Namnen visas i director-länkens namnval. Rollen (t.ex. Director / Deputy Director) ingår i hur svar matchas."
              people={config.directors || []}
              columns={[
                { field: 'name', label: 'Namn', placeholder: 'För- och efternamn' },
                { field: 'role', label: 'Roll', placeholder: 'Director / Deputy Director' },
              ]}
              onUpdate={(idx, field, value) => updatePerson('directors', idx, field, value)}
              onRemove={(idx) => removePerson('directors', idx)}
              onAdd={() => addPerson('directors', { id: genId('dir'), name: '', role: 'Director', active: true })}
            />
          )}

          {config && activeTab === 'admins' && (
            <RosterEditor
              title="Administratörer"
              hint="Namnen visas i namnvals-popupen på huvudsidan."
              people={config.admins || []}
              columns={[{ field: 'name', label: 'Namn', placeholder: 'För- och efternamn' }]}
              onUpdate={(idx, field, value) => updatePerson('admins', idx, field, value)}
              onRemove={(idx) => removePerson('admins', idx)}
              onAdd={() => addPerson('admins', { id: genId('adm'), name: '', active: true })}
            />
          )}
        </div>

        {/* Footer: Settings PIN */}
        {config && (
          <div className="p-6 border-t border-gray-200 flex items-center gap-3">
            <Lock className="w-4 h-4 text-gray-500" />
            <label className="text-sm text-gray-700">Ny PIN:</label>
            <input
              type="text"
              value={config.settingsPin || ''}
              placeholder={config.hasPin ? '•••• (lämna tomt = behåll)' : 'ingen PIN satt'}
              onChange={(e) => setConfig(prev => ({ ...prev, settingsPin: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-400">Lågsäkerhet — internt verktyg. Glöm inte att spara.</span>
          </div>
        )}
      </div>
    </Overlay>
  );
};

const Overlay = ({ children }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    {children}
  </div>
);

const TabButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 font-semibold border-b-2 -mb-px transition ${
      active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}
  >
    <Icon className="w-4 h-4" /> {label}
  </button>
);

const RosterEditor = ({ title, hint, people, columns, onUpdate, onRemove, onAdd }) => (
  <div>
    {hint && <p className="text-sm text-gray-500 mb-4">{hint}</p>}
    <div className="space-y-3">
      {people.map((p, idx) => (
        <div key={p.id || idx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
          {columns.map(col => (
            <input
              key={col.field}
              type="text"
              value={p[col.field] || ''}
              placeholder={col.placeholder || col.label}
              onChange={(e) => onUpdate(idx, col.field, e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          ))}
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={p.active !== false}
              onChange={(e) => onUpdate(idx, 'active', e.target.checked)}
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            Aktiv
          </label>
          <button
            onClick={() => onRemove(idx)}
            className="text-red-500 hover:text-red-700 transition p-1"
            title="Ta bort"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {people.length === 0 && <p className="text-gray-400 text-sm">Inga {title.toLowerCase()} ännu.</p>}
    </div>
    <button
      onClick={onAdd}
      className="mt-4 inline-flex items-center gap-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-4 py-2 rounded-lg font-semibold transition"
    >
      <Plus className="w-4 h-4" /> Lägg till
    </button>
  </div>
);

export default Settings;
