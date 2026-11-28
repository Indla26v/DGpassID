'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarClock, Check, Copy, FileText, History, MessageSquareText, Pause, Play, Plus, RotateCw, Save, Send, Smartphone, Trash2, X,
} from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { CustomSelect } from '../common/CustomSelect';
import { MultiSelectDropdown } from '../common/MultiSelectDropdown';
import { useDialog } from '../common/useDialog';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { AP_DISTRICTS, POLICE_SPECIAL_UNITS } from '@/core/domain/districts';
import { RANK_GROUPS } from '@/core/domain/ranks';
import {
  DEFAULT_TEMPLATE_BODY, DLT_VAR_MAX, PLACEHOLDERS, render, SAMPLE_VALUES, smsSegments, toDltTemplate, unknownPlaceholders, type Briefing, type PlaceholderKey,
} from '@/modules/messaging/template';
import type { CampaignSummary, MessageSettings } from '@/modules/messaging/messaging.repository';

type Tab = 'message' | 'briefings' | 'send' | 'history';
interface SmsState { dryRun: boolean; configured: boolean; provider: string; senderId: string; messageId: string }
interface Preview {
  total: number;
  sendable: number;
  skippedCount: number;
  skipped: { name: string; mobile: string; reason?: string }[];
  totalParts: number;
  maxParts: number;
  shortened: Partial<Record<PlaceholderKey, number>>;
  samples: { name: string; mobile: string; message: string }[];
}
type Recipient = { id: string; full_name: string; mobile_e164: string | null; status: string; error: string | null; sent_at: string | null };

const TABS: { id: Tab; label: string; Icon: typeof Send }[] = [
  { id: 'message', label: 'Message', Icon: MessageSquareText },
  { id: 'briefings', label: 'Briefings', Icon: CalendarClock },
  { id: 'send', label: 'Send', Icon: Send },
  { id: 'history', label: 'History', Icon: History },
];

const STATUS_TONE: Record<string, string> = {
  SENT: 'bg-blue-600 text-white', SIMULATED: 'bg-slate-700 text-white', FAILED: 'bg-rose-600 text-white', SKIPPED: 'bg-slate-200 text-slate-800',
  QUEUED: 'bg-slate-100 text-slate-700', SENDING: 'bg-slate-100 text-slate-700',
};

const labelOf = (key: PlaceholderKey) => PLACEHOLDERS.find(item => item.key === key)?.label ?? key;

/** Phone-style SMS bubble with the character and SMS-part count. */
function Bubble({ text, title, senderId }: { text: string; title?: string; senderId?: string }) {
  const { characters, parts, unicode } = smsSegments(text);
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-100 p-3">
      <p className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-600">
        <span>{title}</span><span className="rounded-full bg-white px-2 py-0.5 text-slate-700">{senderId || 'XX-SENDER'}</span>
      </p>
      <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-900 shadow-sm">
        {text}
      </div>
      <p className={`mt-2 text-right text-[11px] font-semibold ${parts > 2 ? 'text-rose-700' : 'text-slate-600'}`}>
        {characters} characters · {parts} SMS {parts === 1 ? 'part' : 'parts'}{unicode ? ' · Unicode (70 a part)' : ''}
      </p>
    </div>
  );
}

export function MessagingPanel({ knownDistricts }: { knownDistricts: string[] }) {
  const [tab, setTab] = useState<Tab>('message');
  const [settings, setSettings] = useState<MessageSettings | null>(null);
  const [savedBody, setSavedBody] = useState('');
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [sms, setSms] = useState<SmsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Send tab
  const [zoneName, setZoneName] = useState('');
  const [sectorNumber, setSectorNumber] = useState('');
  const [ranks, setRanks] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [onlyOnPoint, setOnlyOnPoint] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [testMobile, setTestMobile] = useState('');
  const [testing, setTesting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Sending / history
  const [active, setActive] = useState<CampaignSummary | null>(null);
  const [running, setRunning] = useState(false);
  const pauseRef = useRef(false);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [detail, setDetail] = useState<{ campaign: CampaignSummary; recipients: Recipient[] } | null>(null);
  const [detailStatus, setDetailStatus] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/messages/settings', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Could not load the message settings.'); return; }
    setSettings(data.settings);
    setSavedBody(data.settings.templateBody);
    setBriefings(data.briefings);
    setSms(data.sms);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadCampaigns = useCallback(async () => {
    const response = await fetch('/api/messages/campaigns', { cache: 'no-store' });
    if (response.ok) setCampaigns((await response.json()).campaigns);
  }, []);
  useEffect(() => { if (tab === 'history') void loadCampaigns(); }, [tab, loadCampaigns]);

  const districtOptions = useMemo(() => {
    const all = new Map<string, string>();
    for (const name of [...knownDistricts, ...AP_DISTRICTS, ...POLICE_SPECIAL_UNITS]) all.set(name.toLowerCase(), name);
    return [...all.values()].sort((a, b) => a.localeCompare(b));
  }, [knownDistricts]);
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === zoneName);
  const filters = useMemo(() => ({ zone: zoneName || undefined, sectorNumber: sectorNumber || undefined, ranks, districts, onlyOnPoint }),
    [zoneName, sectorNumber, ranks, districts, onlyOnPoint]);

  // Live recipient preview on the Send tab.
  useEffect(() => {
    if (tab !== 'send') return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const response = await fetch('/api/messages/preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(filters), signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not prepare the preview.');
        setPreview(data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not prepare the preview.');
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [tab, filters]);

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/messages/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings, briefings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save.');
      setSavedBody(settings.templateBody);
      setNotice('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const insertPlaceholder = (key: string) => {
    if (!settings) return;
    const area = textareaRef.current;
    const token = `{${key}}`;
    const start = area?.selectionStart ?? settings.templateBody.length;
    const end = area?.selectionEnd ?? start;
    const next = settings.templateBody.slice(0, start) + token + settings.templateBody.slice(end);
    setSettings({ ...settings, templateBody: next });
    requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(start + token.length, start + token.length); });
  };

  const dlt = settings ? toDltTemplate(settings.templateBody) : null;
  const unknown = settings ? unknownPlaceholders(settings.templateBody) : [];
  const previewValues = settings ? { ...SAMPLE_VALUES, event: settings.eventName || SAMPLE_VALUES.event, event_dates: settings.eventDates || SAMPLE_VALUES.event_dates, contact: settings.contact || SAMPLE_VALUES.contact, signature: settings.signature || SAMPLE_VALUES.signature } : SAMPLE_VALUES;

  const copyForDlt = async () => {
    if (!dlt) return;
    const variables = dlt.order.map((key, index) => `{#var#} ${index + 1} = ${labelOf(key)} (e.g. ${previewValues[key] ?? ''})`).join('\n');
    try {
      await navigator.clipboard.writeText(`${dlt.text}\n\nVariables (max ${DLT_VAR_MAX} characters each):\n${variables}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const sendTest = async () => {
    setTesting(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/messages/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile: testMobile }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Test failed.');
      setNotice(data.simulated ? 'Dry run: the test was simulated, nothing was sent.' : 'Test SMS accepted by Fast2SMS. Check your phone.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed.');
    } finally {
      setTesting(false);
    }
  };

  /** Sends a campaign in batches until it finishes, is paused or is cancelled. */
  const runCampaign = useCallback(async (id: string) => {
    setRunning(true); pauseRef.current = false; setError('');
    try {
      for (;;) {
        if (pauseRef.current) break;
        const response = await fetch(`/api/messages/campaigns/${id}/send-next`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Sending stopped.');
        setActive(data.campaign);
        if (data.campaign.status !== 'SENDING' || data.processed === 0) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sending stopped.');
    } finally {
      setRunning(false);
      void loadCampaigns();
    }
  }, [loadCampaigns]);

  const startSend = async () => {
    setConfirmOpen(false); setError(''); setNotice('');
    try {
      const response = await fetch('/api/messages/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filters, expectedCount: preview?.total }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start the send.');
      setActive(null);
      await runCampaign(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the send.');
    }
  };

  const cancelActive = async (id: string) => {
    pauseRef.current = true;
    const response = await fetch(`/api/messages/campaigns/${id}/cancel`, { method: 'POST' });
    if (response.ok) setActive((await response.json()).campaign);
    void loadCampaigns();
  };

  const openDetail = async (id: string, status = '') => {
    setDetailStatus(status);
    const response = await fetch(`/api/messages/campaigns/${id}${status ? `?status=${status}` : ''}`, { cache: 'no-store' });
    if (response.ok) setDetail(await response.json());
  };

  const retry = async (id: string) => {
    const response = await fetch(`/api/messages/campaigns/${id}/retry-failed`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Could not retry.'); return; }
    if (data.requeued) { setTab('send'); await runCampaign(id); } else setNotice('No failed messages to retry.');
  };

  if (!settings || !sms) {
    return <section className="operations-panel p-6 text-sm text-slate-600">{error || 'Loading SMS settings…'}</section>;
  }

  const label = 'block text-xs font-semibold text-slate-700';
  const input = 'operations-input mt-1 px-3.5';
  const progressDone = active ? active.total - active.queued : 0;

  return (
    <section aria-label="SMS duty messages" className="operations-panel operations-enter space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-police-navy">SMS duty messages</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sms.dryRun ? 'bg-slate-800 text-white' : sms.configured ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {sms.dryRun ? 'Dry run: nothing will be sent' : sms.configured ? `Live · ${sms.provider} · sender ${sms.senderId}` : 'SMS not configured'}
        </span>
      </div>

      <div role="tablist" aria-label="SMS sections" className="flex flex-wrap gap-1 rounded-full bg-slate-100 p-1">
        {TABS.map(({ id, label: text, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-police-navy text-white shadow-sm' : 'text-slate-700 hover:bg-white'}`}>
            <Icon aria-hidden="true" className="size-4" />{text}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{notice}</p>}

      {tab === 'message' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {([['eventName', 'Event name'], ['eventDates', 'Event dates'], ['contact', 'Contact number'], ['signature', 'Signature']] as const).map(([field, text]) => (
                <label key={field} className={label}>{text}
                  <input className={input} value={settings[field]} onChange={event => setSettings({ ...settings, [field]: event.target.value })} />
                </label>
              ))}
            </div>
            <div>
              <label htmlFor="template-body" className={label}>Message text</label>
              <div className="mt-1 flex flex-wrap gap-1.5" aria-label="Insert a placeholder">
                {PLACEHOLDERS.map(item => (
                  <button key={item.key} type="button" onClick={() => insertPlaceholder(item.key)} title={`Insert {${item.key}}`}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-police-navy hover:border-police-navy hover:bg-slate-50">
                    + {item.label}
                  </button>
                ))}
              </div>
              <textarea id="template-body" ref={textareaRef} rows={8} maxLength={640} value={settings.templateBody}
                onChange={event => setSettings({ ...settings, templateBody: event.target.value })}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3 font-mono text-[13px] leading-relaxed text-slate-900 focus:border-police-crimson focus:bg-white focus:outline-none focus:ring-2 focus:ring-police-crimson/20" />
              {unknown.length > 0 && <p className="mt-1 text-xs text-rose-700">Unknown placeholder(s): {unknown.map(item => `{${item}}`).join(', ')}</p>}
              {settings.templateBody !== savedBody && (
                <p className="mt-1 text-xs text-rose-700">Unsaved changes. If this text is already registered on DLT, register the changed text again before sending, or the SMS will be rejected.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <PillButton type="button" variant="crimson" size="sm" disabled={saving || unknown.length > 0} icon={<Save aria-hidden="true" className="size-3.5" />} onClick={save}>
                {saving ? 'Saving…' : 'Save message'}
              </PillButton>
              <PillButton type="button" variant="outline" size="sm" icon={copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />} onClick={copyForDlt}>
                {copied ? 'Copied' : 'Copy for DLT registration'}
              </PillButton>
              <PillButton type="button" variant="outline" size="sm" icon={<FileText aria-hidden="true" className="size-3.5" />}
                disabled={settings.templateBody === DEFAULT_TEMPLATE_BODY}
                onClick={() => setSettings({ ...settings, templateBody: DEFAULT_TEMPLATE_BODY })}>
                Use duty passport message
              </PillButton>
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <Bubble title="Preview with sample details" senderId={sms.senderId} text={render(settings.templateBody, previewValues)} />
            <p className="px-1 text-xs text-slate-600">Each detail is cut to {DLT_VAR_MAX} characters (DLT rule). Keep the text short: about 2 SMS parts per officer.</p>
            {dlt && (
              <div className="rounded-3xl border border-slate-200 p-3 text-xs">
                <p className="mb-1.5 font-semibold text-slate-700">DLT template ({dlt.order.length} variables)</p>
                <pre className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-2.5 font-mono text-[11px] text-slate-800">{dlt.text}</pre>
                <p className="mt-1.5 text-slate-600">Register this text on your DLT portal (service implicit), then add it in Fast2SMS DLT Manager.</p>
                <dl className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2"><dt className="text-slate-500">Sender ID</dt><dd className="font-semibold text-slate-900">{sms.senderId || 'Not set'}</dd></div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2"><dt className="text-slate-500">DLT message ID</dt><dd className="font-semibold text-slate-900">{sms.messageId || 'Not set'}</dd></div>
                </dl>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'briefings' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Each officer gets their zone&apos;s briefing. A sector row overrides its zone for that sector only.</p>
          <div className="overflow-x-auto rounded-3xl border border-slate-200">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr><th className="px-3 py-2">Zone / sector</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Venue</th><th className="px-3 py-2"><span className="sr-only">Remove</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {POLICE_BANDOBUSHT_ZONES.flatMap(zoneItem => {
                  const rows = briefings.filter(item => item.zone === zoneItem.name);
                  const zoneRow = rows.find(item => !item.sector) ?? { zone: zoneItem.name, sector: null, briefing_date: null, briefing_time: null, venue: null };
                  const update = (target: Briefing, patch: Partial<Briefing>) => setBriefings(current => {
                    const exists = current.some(item => item.zone === target.zone && (item.sector ?? null) === (target.sector ?? null));
                    const next = { ...target, ...patch };
                    return exists ? current.map(item => (item.zone === target.zone && (item.sector ?? null) === (target.sector ?? null) ? next : item)) : [...current, next];
                  });
                  const cells = (row: Briefing) => (
                    <>
                      <td className="px-3 py-1.5"><input type="date" aria-label="Briefing date" className="operations-input px-3" value={row.briefing_date ?? ''} onChange={event => update(row, { briefing_date: event.target.value || null })} /></td>
                      <td className="px-3 py-1.5"><input type="time" aria-label="Briefing time" className="operations-input px-3" value={row.briefing_time ?? ''} onChange={event => update(row, { briefing_time: event.target.value || null })} /></td>
                      <td className="min-w-[16rem] px-3 py-1.5"><input aria-label="Briefing venue" className="operations-input px-3" placeholder="Venue" value={row.venue ?? ''} onChange={event => update(row, { venue: event.target.value })} /></td>
                    </>
                  );
                  return [
                    <tr key={zoneItem.id} className="bg-white">
                      <th scope="row" className="px-3 py-1.5 font-semibold text-police-navy">Zone {zoneItem.number}: {zoneItem.name}</th>
                      {cells(zoneRow)}
                      <td className="px-3 py-1.5 text-right">
                        <PillButton type="button" size="sm" variant="ghost" icon={<Plus aria-hidden="true" className="size-3.5" />}
                          onClick={() => {
                            const free = zoneItem.sectors.find(sector => !rows.some(item => item.sector === sector.number));
                            if (free) setBriefings(current => [...current, { zone: zoneItem.name, sector: free.number, briefing_date: zoneRow.briefing_date, briefing_time: zoneRow.briefing_time, venue: zoneRow.venue }]);
                          }}>Sector</PillButton>
                      </td>
                    </tr>,
                    ...rows.filter(item => item.sector).map(row => (
                      <tr key={`${zoneItem.id}-${row.sector}`} className="bg-indigo-50/50">
                        <td className="py-1.5 pl-8 pr-3">
                          <CustomSelect ariaLabel="Sector override" value={row.sector ?? ''} onChange={value => setBriefings(current => current.map(item => (item === row ? { ...item, sector: value } : item)))}
                            options={zoneItem.sectors.filter(sector => sector.number === row.sector || !rows.some(item => item.sector === sector.number)).map(sector => ({ value: sector.number, label: `${sector.number}: ${sector.name}` }))} />
                        </td>
                        {cells(row)}
                        <td className="px-3 py-1.5 text-right">
                          <button type="button" aria-label="Remove sector override" onClick={() => setBriefings(current => current.filter(item => item !== row))}
                            className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 aria-hidden="true" className="size-4" /></button>
                        </td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </div>
          <PillButton type="button" variant="crimson" size="sm" disabled={saving} icon={<Save aria-hidden="true" className="size-3.5" />} onClick={save}>
            {saving ? 'Saving…' : 'Save briefings'}
          </PillButton>
        </div>
      )}

      {tab === 'send' && (
        <div className="space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="min-w-0"><span className={label}>Zone</span>
              <CustomSelect ariaLabel="Zone" value={zoneName} onChange={value => { setZoneName(value); setSectorNumber(''); }}
                options={[{ value: '', label: 'All zones' }, ...POLICE_BANDOBUSHT_ZONES.map(item => ({ value: item.name, label: `Zone ${item.number}: ${item.name}` }))]} />
            </div>
            <div className="min-w-0"><span className={label}>Sector</span>
              <CustomSelect ariaLabel="Sector" value={sectorNumber} onChange={setSectorNumber} disabled={!zone} searchable
                options={[{ value: '', label: zone ? 'All sectors' : 'Choose a zone first' }, ...(zone?.sectors ?? []).map(item => ({ value: item.number, label: `${item.number}: ${item.name}` }))]} />
            </div>
            <div className="min-w-0"><span className={label}>Ranks</span>
              <MultiSelectDropdown ariaLabel="Ranks" options={RANK_GROUPS.map(item => item.group)} value={ranks} onChange={setRanks} emptyLabel="All ranks" />
            </div>
            <div className="min-w-0"><span className={label}>Districts / units</span>
              <MultiSelectDropdown ariaLabel="Districts / units" options={districtOptions} value={districts} onChange={setDistricts} emptyLabel="All districts / units" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyOnPoint} onChange={event => setOnlyOnPoint(event.target.checked)} /> Only officers already placed on a duty point
          </label>

          <dl className="flex flex-wrap gap-2 text-xs" aria-live="polite">
            {[
              ['Allotted officers', preview?.total],
              ['Will receive', preview?.sendable],
              ['Skipped (no valid mobile)', preview?.skippedCount],
              ['SMS credits (approx.)', preview?.totalParts],
            ].map(([text, value]) => (
              <div key={text as string} className="rounded-2xl bg-slate-100 px-4 py-2">
                <dt className="text-slate-600">{text}</dt>
                <dd className="text-xl font-bold tabular-nums text-police-navy">{previewLoading ? '…' : (value as number | undefined)?.toLocaleString() ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {Boolean(preview?.skippedCount) && (
            <div className="text-xs">
              <button type="button" onClick={() => setShowSkipped(!showSkipped)} className="font-semibold text-police-crimson underline">
                {showSkipped ? 'Hide' : 'Show'} skipped officers
              </button>
              {showSkipped && (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-2xl border border-slate-200 p-2">
                  {preview!.skipped.map((item, index) => <li key={index} className="py-0.5">{item.name} · {item.mobile || 'no mobile'} · <span className="text-rose-700">{item.reason}</span></li>)}
                </ul>
              )}
            </div>
          )}

          {preview && Object.keys(preview.shortened).length > 0 && (
            <p className="rounded-2xl bg-indigo-50 px-4 py-2.5 text-xs text-indigo-900">
              Cut to {DLT_VAR_MAX} characters for some officers:{' '}
              {(Object.entries(preview.shortened) as [PlaceholderKey, number][]).map(([key, count]) => `${labelOf(key)} (${count})`).join(', ')}.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {preview?.samples[0] ? <Bubble title={`Example: ${preview.samples[0].name}`} senderId={sms.senderId} text={preview.samples[0].message} /> : <div />}
            <div className="space-y-3 rounded-3xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-police-navy">1. Test on your own phone first</p>
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-48 flex-1">
                  <span className="sr-only">Your mobile number</span>
                  <Smartphone aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <input inputMode="numeric" value={testMobile} onChange={event => setTestMobile(event.target.value)} placeholder="Your 10-digit mobile" className="operations-input pl-9 pr-3" />
                </label>
                <PillButton type="button" variant="outline" size="sm" disabled={testing || !testMobile.trim()} onClick={sendTest}>
                  {testing ? 'Sending…' : 'Send test'}
                </PillButton>
              </div>
              <p className="pt-2 text-sm font-semibold text-police-navy">2. Send to the officers</p>
              <PillButton type="button" variant="crimson" disabled={running || previewLoading || !preview?.sendable || (!sms.dryRun && !sms.configured)}
                icon={<Send aria-hidden="true" className="size-4" />} onClick={() => setConfirmOpen(true)}>
                Send to {preview?.sendable?.toLocaleString() ?? 0} officers
              </PillButton>
            </div>
          </div>

          {active && (
            <div className="space-y-2 rounded-3xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-police-navy">
                  {active.status === 'SENDING' ? (running ? 'Sending…' : 'Paused') : active.status === 'DONE' ? 'Finished' : 'Cancelled'}
                  {' '}· {progressDone.toLocaleString()} / {active.total.toLocaleString()}
                </span>
                <span className="flex gap-1.5">
                  {active.status === 'SENDING' && (running
                    ? <PillButton type="button" size="sm" variant="outline" icon={<Pause aria-hidden="true" className="size-3.5" />} onClick={() => { pauseRef.current = true; }}>Pause</PillButton>
                    : <PillButton type="button" size="sm" variant="outline" icon={<Play aria-hidden="true" className="size-3.5" />} onClick={() => void runCampaign(active.id)}>Resume</PillButton>)}
                  {active.status === 'SENDING' && <PillButton type="button" size="sm" variant="ghost" icon={<X aria-hidden="true" className="size-3.5" />} onClick={() => void cancelActive(active.id)}>Cancel</PillButton>}
                </span>
              </div>
              <span aria-hidden="true" className="block h-2.5 overflow-hidden rounded-full bg-slate-200">
                <span className="block h-full rounded-full bg-police-navy transition-[width]" style={{ width: `${active.total ? Math.round((progressDone / active.total) * 100) : 0}%` }} />
              </span>
              <p className="text-xs text-slate-600">
                {active.dry_run ? `Simulated ${active.simulated}` : `Sent ${active.sent}`} · Failed {active.failed} · Skipped {active.skipped}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <PillButton type="button" size="sm" variant="outline" icon={<RotateCw aria-hidden="true" className="size-3.5" />} onClick={() => void loadCampaigns()}>Refresh</PillButton>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-slate-200">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>{['Started', 'By', 'Recipients', 'Sent', 'Failed', 'Skipped', 'Status', ''].map(head => <th key={head} className="px-3 py-2 font-semibold">{head}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">{new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="px-3 py-2">{item.created_by}</td>
                    <td className="px-3 py-2 tabular-nums">{item.total}</td>
                    <td className="px-3 py-2 tabular-nums">{item.dry_run ? `${item.simulated} (dry run)` : item.sent}</td>
                    <td className="px-3 py-2 tabular-nums text-rose-700">{item.failed}</td>
                    <td className="px-3 py-2 tabular-nums">{item.skipped}</td>
                    <td className="px-3 py-2"><span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold">{item.status === 'SENDING' ? 'In progress' : item.status === 'DONE' ? 'Finished' : 'Cancelled'}</span></td>
                    <td className="px-3 py-2 text-right">
                      <span className="flex justify-end gap-1">
                        <PillButton type="button" size="sm" variant="outline" onClick={() => void openDetail(item.id)}>View</PillButton>
                        {item.failed > 0 && <PillButton type="button" size="sm" variant="outline" disabled={running} onClick={() => void retry(item.id)}>Retry failed</PillButton>}
                        {item.status === 'SENDING' && <PillButton type="button" size="sm" variant="outline" disabled={running} onClick={() => { setTab('send'); setActive(item); void runCampaign(item.id); }}>Resume</PillButton>}
                      </span>
                    </td>
                  </tr>
                ))}
                {!campaigns.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">No messages sent yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {detail && (
            <div className="space-y-2 rounded-3xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-police-navy">Recipients</span>
                {['', 'SENT', 'SIMULATED', 'FAILED', 'SKIPPED'].map(status => (
                  <button key={status || 'all'} type="button" aria-pressed={detailStatus === status} onClick={() => void openDetail(detail.campaign.id, status)}
                    className={`rounded-full px-2.5 py-1 font-semibold ${detailStatus === status ? 'bg-police-navy text-white' : 'border border-slate-300 text-slate-700'}`}>
                    {status ? status.charAt(0) + status.slice(1).toLowerCase() : 'All'}
                  </button>
                ))}
                <button type="button" aria-label="Close recipients" onClick={() => setDetail(null)} className="ml-auto grid size-7 place-items-center rounded-full hover:bg-slate-100"><X className="size-4" /></button>
              </div>
              <div className="max-h-80 overflow-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {detail.recipients.map(item => (
                      <tr key={item.id}>
                        <td className="px-3 py-1.5 font-semibold text-slate-900">{item.full_name}</td>
                        <td className="px-3 py-1.5 tabular-nums">{item.mobile_e164 ? `+${item.mobile_e164}` : '—'}</td>
                        <td className="px-3 py-1.5"><span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_TONE[item.status] ?? 'bg-slate-100'}`}>{item.status.toLowerCase()}</span></td>
                        <td className="px-3 py-1.5 text-rose-700">{item.error}</td>
                      </tr>
                    ))}
                    {!detail.recipients.length && <tr><td className="p-4 text-center text-slate-500">None.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {confirmOpen && preview && (
        <ConfirmSend count={preview.sendable} skipped={preview.skippedCount} credits={preview.totalParts} sms={sms}
          onCancel={() => setConfirmOpen(false)} onConfirm={() => void startSend()} />
      )}
    </section>
  );
}

function ConfirmSend({ count, skipped, credits, sms, onCancel, onConfirm }: {
  count: number; skipped: number; credits: number; sms: SmsState; onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useDialog(true, onCancel);
  return createPortal(
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="confirm-send-title" tabIndex={-1} className="w-full max-w-md space-y-3 rounded-[2rem] bg-white p-5 shadow-2xl">
        <h3 id="confirm-send-title" className="text-lg font-semibold text-police-navy">Send duty SMS?</h3>
        <ul className="space-y-1 text-sm text-slate-700">
          <li><b>{count.toLocaleString()}</b> officers will get the duty message.</li>
          {skipped > 0 && <li>{skipped.toLocaleString()} without a valid mobile are skipped.</li>}
          <li>About <b>{credits.toLocaleString()}</b> SMS credits (long messages use more than one).</li>
          <li>Sender ID <b>{sms.senderId || 'not set'}</b> · DLT message <b>{sms.messageId || 'not set'}</b></li>
          <li>{sms.dryRun ? <b>Dry run: nothing will actually be sent.</b> : <b className="text-rose-700">Live: real SMS will be sent and charged.</b>}</li>
        </ul>
        <div className="flex justify-end gap-2 pt-1">
          <PillButton type="button" variant="outline" onClick={onCancel}>Cancel</PillButton>
          <PillButton type="button" variant="crimson" icon={<Send aria-hidden="true" className="size-4" />} onClick={onConfirm}>
            {sms.dryRun ? 'Run dry run' : `Send ${count.toLocaleString()}`}
          </PillButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
