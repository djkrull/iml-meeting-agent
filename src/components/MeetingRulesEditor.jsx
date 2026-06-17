import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { resolveMeetingDate } from '../utils/meetingRuleEngine';

const WEEKDAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const UNIT_LABEL = { days: 'dagar', weeks: 'veckor', months: 'månader' };
const SNAP_LABEL = { forward: 'framåt', backward: 'bakåt', nearest: 'närmast', onOrBefore: 'på-eller-före' };

// Representative sample program per type, only for the live "→ Beräknas" preview.
const SAMPLE = {
  'Spring Program':     { start: new Date(2027, 1, 10), end: new Date(2027, 4, 21), year: 2027 },
  'Fall Program':       { start: new Date(2027, 8, 1),  end: new Date(2027, 11, 10), year: 2027 },
  'Summer Conference':  { start: new Date(2027, 5, 14), end: new Date(2027, 5, 18), year: 2027 },
  'Kleindagarna':       { start: new Date(2027, 0, 14), end: new Date(2027, 0, 16), year: 2027 },
};

const fmtDate = (d) => d
  ? d.toLocaleDateString('sv-SE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  : '—';

function describeTiming(rule) {
  const anchorTxt = rule.anchor === 'end' ? 'programslut' : 'programstart';
  const o = rule.offset || {};
  if (o.direction === 'on') return `på ${anchorTxt}`;
  return `${o.amount} ${UNIT_LABEL[o.unit] || o.unit} ${o.direction === 'before' ? 'före' : 'efter'} ${anchorTxt}`;
}

function describePlacement(rule) {
  const p = rule.placement || {};
  if (rule.recurring === 'weekly') return `veckovis på ${WEEKDAYS[p.weekday] || '?'}`;
  if (p.mode === 'exact') return 'exakt datum (ingen veckodag)';
  return `närmaste ${WEEKDAYS[p.weekday] || '?'} (${SNAP_LABEL[p.snap] || p.snap})`;
}

// Editor for the configurable meeting rules, grouped by program type.
// props: rules (config.meetingRules), onChange(newRules), imlNote?
const MeetingRulesEditor = ({ rules, onChange }) => {
  const types = Object.keys(rules || {});

  const updateRule = (type, idx, mutate) => {
    const next = { ...rules, [type]: rules[type].map((r, i) => i === idx ? mutate({ ...r }) : r) };
    onChange(next);
  };
  const setField = (type, idx, field, value) => updateRule(type, idx, r => { r[field] = value; return r; });
  const setOffset = (type, idx, key, value) =>
    updateRule(type, idx, r => { r.offset = { ...(r.offset || {}), [key]: value }; return r; });
  const setPlacement = (type, idx, key, value) =>
    updateRule(type, idx, r => { r.placement = { ...(r.placement || {}), [key]: value }; return r; });
  const setOverrideOffset = (type, idx, key, value) =>
    updateRule(type, idx, r => {
      const ovr = r.offsetOverrideFromYear || { fromYear: 2028, offset: { ...(r.offset || {}) } };
      r.offsetOverrideFromYear = { ...ovr, offset: { ...ovr.offset, [key]: value } };
      return r;
    });
  const setOverrideYear = (type, idx, value) =>
    updateRule(type, idx, r => {
      const ovr = r.offsetOverrideFromYear || { fromYear: value, offset: { ...(r.offset || {}) } };
      r.offsetOverrideFromYear = { ...ovr, fromYear: value };
      return r;
    });
  const removeOverride = (type, idx) =>
    updateRule(type, idx, r => { delete r.offsetOverrideFromYear; return r; });

  const addRule = (type) => {
    const id = `rule_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const newRule = {
      id, name: 'Nytt möte', anchor: 'start',
      offset: { amount: 0, unit: 'days', direction: 'on' },
      placement: { mode: 'weekday', weekday: 5, snap: 'forward' },
      time: '10:00', duration: 30, participants: ['Directors'],
      requiresDirectors: true, recurring: null, sharedPerYear: false, group: null,
      description: '',
    };
    onChange({ ...rules, [type]: [...rules[type], newRule] });
  };
  const removeRule = (type, idx) => {
    onChange({ ...rules, [type]: rules[type].filter((_, i) => i !== idx) });
  };

  const previewLine = (type, rule) => {
    if (rule.recurring === 'weekly') return describePlacement(rule);
    const s = SAMPLE[type];
    let ex = '—';
    try { ex = fmtDate(resolveMeetingDate(rule, s.start, s.end, s.year)); } catch { /* ignore */ }
    let extra = '';
    if (rule.offsetOverrideFromYear) {
      const o = rule.offsetOverrideFromYear;
      const od = o.offset.direction === 'on'
        ? 'på ankardagen'
        : `${o.offset.amount} ${UNIT_LABEL[o.offset.unit] || o.offset.unit} ${o.offset.direction === 'before' ? 'före' : 'efter'}`;
      extra = `  ⚠ Från år ${o.fromYear}: ${od} istället.`;
    }
    return `${describeTiming(rule)} → ${describePlacement(rule)}.  Ex (start ${fmtDate(s.start)}): ${ex}${extra}`;
  };

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-500">
        Ändringar gäller <strong>framåt</strong> (nästa gång möten genereras). Använd
        "Regenerera" på huvudsidan för att applicera om på befintliga program.
      </p>
      {types.map(type => (
        <div key={type}>
          <h3 className="text-lg font-bold text-gray-800 mb-3">{type}</h3>
          <div className="space-y-4">
            {rules[type].map((rule, idx) => {
              const isWeekly = rule.recurring === 'weekly';
              const onDay = (rule.offset || {}).direction === 'on';
              const isExact = (rule.placement || {}).mode === 'exact';
              return (
                <div key={rule.id || idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={rule.name || ''}
                      onChange={(e) => setField(type, idx, 'name', e.target.value)}
                      className="flex-1 font-semibold border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {rule.sharedPerYear && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full whitespace-nowrap">delas/år</span>}
                    {isWeekly && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full whitespace-nowrap">veckovis</span>}
                    <button onClick={() => removeRule(type, idx)} className="text-red-500 hover:text-red-700 p-1" title="Ta bort regel">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Timing (hidden for weekly — those use the recurring loop) */}
                  {!isWeekly && (
                    <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
                      <span className="text-gray-600 w-20">Tidpunkt:</span>
                      <select value={rule.anchor} onChange={(e) => setField(type, idx, 'anchor', e.target.value)} className="border border-gray-300 rounded px-2 py-1.5">
                        <option value="start">Programstart</option>
                        <option value="end">Programslut</option>
                      </select>
                      <select
                        value={onDay ? 'on' : (rule.offset.direction)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'on') setOffset(type, idx, 'direction', 'on');
                          else setOffset(type, idx, 'direction', v);
                        }}
                        className="border border-gray-300 rounded px-2 py-1.5"
                      >
                        <option value="on">på ankardagen</option>
                        <option value="before">före</option>
                        <option value="after">efter</option>
                      </select>
                      {!onDay && (
                        <>
                          <input type="number" min="0" value={rule.offset.amount}
                            onChange={(e) => setOffset(type, idx, 'amount', parseInt(e.target.value || '0', 10))}
                            className="border border-gray-300 rounded px-2 py-1.5 w-20" />
                          <select value={rule.offset.unit} onChange={(e) => setOffset(type, idx, 'unit', e.target.value)} className="border border-gray-300 rounded px-2 py-1.5">
                            <option value="days">dagar</option>
                            <option value="weeks">veckor</option>
                            <option value="months">månader</option>
                          </select>
                        </>
                      )}
                    </div>
                  )}

                  {/* Year-gated override (e.g. Introduction Meeting FP28+/SP29+). Shown
                      so it's never a hidden value that silently overrides the base offset. */}
                  {!isWeekly && rule.offsetOverrideFromYear && (
                    <div className="flex flex-wrap items-center gap-2 mb-2 text-sm bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      <span className="text-amber-800 w-20">Från år</span>
                      <input type="number" value={rule.offsetOverrideFromYear.fromYear}
                        onChange={(e) => setOverrideYear(type, idx, parseInt(e.target.value || '0', 10))}
                        className="border border-gray-300 rounded px-2 py-1.5 w-24" />
                      <span className="text-amber-800">avvikande:</span>
                      <input type="number" min="0" value={rule.offsetOverrideFromYear.offset.amount}
                        onChange={(e) => setOverrideOffset(type, idx, 'amount', parseInt(e.target.value || '0', 10))}
                        className="border border-gray-300 rounded px-2 py-1.5 w-20" />
                      <select value={rule.offsetOverrideFromYear.offset.unit} onChange={(e) => setOverrideOffset(type, idx, 'unit', e.target.value)} className="border border-gray-300 rounded px-2 py-1.5">
                        <option value="days">dagar</option>
                        <option value="weeks">veckor</option>
                        <option value="months">månader</option>
                      </select>
                      <select value={rule.offsetOverrideFromYear.offset.direction} onChange={(e) => setOverrideOffset(type, idx, 'direction', e.target.value)} className="border border-gray-300 rounded px-2 py-1.5">
                        <option value="before">före</option>
                        <option value="after">efter</option>
                        <option value="on">på ankardagen</option>
                      </select>
                      <button onClick={() => removeOverride(type, idx)} className="text-red-600 hover:text-red-800 text-xs underline ml-1">Ta bort avvikelse</button>
                    </div>
                  )}

                  {/* Placement */}
                  <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-600 w-20">Veckodag:</span>
                    {!isWeekly && (
                      <select value={isExact ? 'exact' : 'weekday'} onChange={(e) => setPlacement(type, idx, 'mode', e.target.value)} className="border border-gray-300 rounded px-2 py-1.5">
                        <option value="weekday">Föredragen veckodag</option>
                        <option value="exact">Exakt datum (ingen veckodag)</option>
                      </select>
                    )}
                    {(isWeekly || !isExact) && (
                      <select value={rule.placement.weekday ?? 5} onChange={(e) => setPlacement(type, idx, 'weekday', parseInt(e.target.value, 10))} className="border border-gray-300 rounded px-2 py-1.5">
                        {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
                      </select>
                    )}
                    {!isWeekly && !isExact && (
                      <select value={rule.placement.snap || 'forward'} onChange={(e) => setPlacement(type, idx, 'snap', e.target.value)} className="border border-gray-300 rounded px-2 py-1.5">
                        <option value="forward">snäpp framåt</option>
                        <option value="backward">snäpp bakåt</option>
                        <option value="onOrBefore">på-eller-före</option>
                        <option value="nearest">närmast</option>
                      </select>
                    )}
                  </div>

                  {/* Time / duration / requiresDirectors */}
                  <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-600 w-20">Tid:</span>
                    <input type="time" value={rule.time || ''} onChange={(e) => setField(type, idx, 'time', e.target.value)} className="border border-gray-300 rounded px-2 py-1.5" />
                    <span className="text-gray-600 ml-2">Längd:</span>
                    <input type="number" min="0" value={rule.duration} onChange={(e) => setField(type, idx, 'duration', parseInt(e.target.value || '0', 10))} className="border border-gray-300 rounded px-2 py-1.5 w-20" /> min
                    <label className="flex items-center gap-1.5 ml-2">
                      <input type="checkbox" checked={rule.requiresDirectors !== false} onChange={(e) => setField(type, idx, 'requiresDirectors', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
                      Kräver directors
                    </label>
                  </div>

                  {/* Participants */}
                  <div className="flex items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-600 w-20">Deltagare:</span>
                    <input
                      type="text"
                      value={Array.isArray(rule.participants) ? rule.participants.join(', ') : ''}
                      onChange={(e) => setField(type, idx, 'participants', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      placeholder="kommaseparerat"
                      className="flex-1 border border-gray-300 rounded px-2 py-1.5"
                    />
                  </div>

                  {/* Description */}
                  <div className="flex items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-600 w-20">Beskrivning:</span>
                    <input type="text" value={rule.description || ''} onChange={(e) => setField(type, idx, 'description', e.target.value)} className="flex-1 border border-gray-300 rounded px-2 py-1.5" />
                  </div>

                  <p className="text-xs text-indigo-700 mt-2">→ Beräknas: {previewLine(type, rule)}</p>
                </div>
              );
            })}
          </div>
          <button onClick={() => addRule(type)} className="mt-3 inline-flex items-center gap-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-4 py-2 rounded-lg font-semibold transition text-sm">
            <Plus className="w-4 h-4" /> Lägg till möte i {type}
          </button>
        </div>
      ))}
    </div>
  );
};

export default MeetingRulesEditor;
