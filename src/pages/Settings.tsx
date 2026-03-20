import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { useGoalsStatus } from '../hooks/useData';
import { useUpdater } from '../hooks/useUpdater';

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="bg-[#1e1e28] rounded-2xl border border-white/5 divide-y divide-white/5">
        {children}
      </div>
    </div>
  );
}

function Row({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-200">{label}</div>
        {description && <div className="text-xs text-slate-500 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function MinutePicker({ value, onChange, min = 5, max, step = 5 }: {
  value: number; onChange: (v: number) => void;
  min?: number; max: number; step?: number;
}) {
  const h = Math.floor(value / 60);
  const m = value % 60;
  const display = h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
  return (
    <div className="flex items-center gap-3 w-52">
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-sky-500"
      />
      <span className="text-sm font-semibold text-sky-400 w-16 text-right tabular-nums">
        {display}
      </span>
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      aria-label={label}
      className="relative flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-[#1e1e28]"
      style={{
        width: 44,
        height: 24,
        backgroundColor: value ? '#0ea5e9' : 'rgba(255,255,255,0.12)',
      }}
    >
      <span
        className="absolute top-0.5 rounded-full bg-white shadow transition-transform duration-200"
        style={{
          width: 20,
          height: 20,
          transform: value ? 'translateX(22px)' : 'translateX(2px)',
        }}
      />
    </button>
  );
}

export default function Settings() {
  const { data: goalsData, refresh: refreshGoals } = useGoalsStatus();
  const { state: updaterState, checkForUpdates } = useUpdater();

  const [version, setVersion] = useState('');
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  const [daily, setDaily] = useState<number | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState(20);
  const [streakAlert, setStreakAlert] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [debounceSeconds, setDebounceSeconds] = useState(10);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dailyVal = daily ?? (goalsData?.config.daily_minutes ?? 30);

  useEffect(() => {
    const load = async () => {
      try {
        const re = await invoke<string | null>('get_setting', { key: 'reminder_enabled' });
        if (re !== null) setReminderEnabled(re === 'true');
        const rh = await invoke<string | null>('get_setting', { key: 'reminder_hour' });
        if (rh !== null) setReminderHour(Number(rh));
        const sa = await invoke<string | null>('get_setting', { key: 'streak_alert' });
        if (sa !== null) setStreakAlert(sa !== 'false');
        const ws = await invoke<string | null>('get_setting', { key: 'weekly_summary' });
        if (ws !== null) setWeeklySummary(ws !== 'false');
        const db = await invoke<string | null>('get_setting', { key: 'debounce_seconds' });
        if (db !== null) setDebounceSeconds(Number(db));
      } catch {}
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await invoke('set_goal', { goalType: 'daily', minutes: dailyVal });
      await invoke('set_setting', { key: 'reminder_enabled', value: reminderEnabled.toString() });
      await invoke('set_setting', { key: 'reminder_hour', value: reminderHour.toString() });
      await invoke('set_setting', { key: 'streak_alert', value: streakAlert.toString() });
      await invoke('set_setting', { key: 'weekly_summary', value: weeklySummary.toString() });
      await invoke('set_setting', { key: 'debounce_seconds', value: debounceSeconds.toString() });
      await refreshGoals();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const hourLabel = (h: number) => {
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:00 ${ampm}`;
  };

  return (
    <div className="p-8 fade-in max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configure your goal, notifications, and tracking</p>
      </div>

      <Section title="Practice Goal" description="How long you aim to practice each day">
        <Row label="Daily goal">
          <MinutePicker value={dailyVal} onChange={setDaily} max={240} />
        </Row>
      </Section>

      <Section title="Notifications" description="All notifications are local Windows alerts — no internet required">
        <Row label="Daily reminder" description="Nudge if you haven't hit your goal by the set time">
          <Toggle value={reminderEnabled} onChange={setReminderEnabled} label="Daily reminder" />
        </Row>
        {reminderEnabled && (
          <Row label="Reminder time">
            <div className="flex items-center gap-3 w-52">
              <input
                type="range" min={6} max={23} step={1} value={reminderHour}
                onChange={e => setReminderHour(Number(e.target.value))}
                className="flex-1 accent-sky-500"
              />
              <span className="text-sm font-semibold text-sky-400 w-16 text-right tabular-nums">
                {hourLabel(reminderHour)}
              </span>
            </div>
          </Row>
        )}
        <Row label="Streak at risk" description="Alert at 9pm if you haven't played today">
          <Toggle value={streakAlert} onChange={setStreakAlert} label="Streak at risk alert" />
        </Row>
        <Row label="Weekly summary" description="Sunday evening recap of your week">
          <Toggle value={weeklySummary} onChange={setWeeklySummary} label="Weekly summary" />
        </Row>
      </Section>

      <Section title="Session Detection">
        <Row label="Session end delay" description="Seconds of silence before a session is saved">
          <div className="flex items-center gap-3 w-52">
            <input
              type="range" min={5} max={60} step={5} value={debounceSeconds}
              onChange={e => setDebounceSeconds(Number(e.target.value))}
              className="flex-1 accent-sky-500"
            />
            <span className="text-sm font-semibold text-sky-400 w-16 text-right tabular-nums">
              {debounceSeconds}s
            </span>
          </div>
        </Row>
      </Section>

      <Section title="App" description="Version and updates">
        <Row label="Version" description="Currently installed">
          <span className="text-sm text-slate-400 tabular-nums">{version ? `v${version}` : '—'}</span>
        </Row>
        <Row label="Updates" description={
          updaterState.phase === 'available'
            ? `v${updaterState.update.version} is available`
            : updaterState.phase === 'checking'
            ? 'Checking…'
            : 'You\'re up to date'
        }>
          <button
            onClick={checkForUpdates}
            disabled={updaterState.phase === 'checking' || updaterState.phase === 'downloading'}
            className="px-4 py-1.5 text-xs font-medium rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 disabled:opacity-40 transition-colors"
          >
            {updaterState.phase === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        </Row>
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && <span className="text-green-400 text-sm fade-in">✓ Saved</span>}
      </div>
    </div>
  );
}
