import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { Button, Switch, Card, CardBody, Slider, Chip } from '@heroui/react';
import { useGoalsStatus } from '../hooks/useData';
import { useUpdaterContext } from '../context/UpdaterContext';

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-foreground-400 mt-0.5">{description}</p>}
      </div>
      <Card classNames={{ base: 'bg-content2 border border-divider' }}>
        <CardBody className="p-0 divide-y divide-divider">
          {children}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="text-xs text-foreground-400 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { data: goalsData, refresh: refreshGoals } = useGoalsStatus();
  const { state: updaterState, checkForUpdates } = useUpdaterContext();

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

  const h = Math.floor(dailyVal / 60);
  const m = dailyVal % 60;
  const goalDisplay = h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-in max-w-xl">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-foreground-400 text-sm mt-1">Configure your goal, notifications, and tracking</p>
      </div>

      <Section title="Practice Goal" description="How long you aim to practice each day">
        <Row label="Daily goal" description={`Currently: ${goalDisplay}`}>
          <div className="w-48">
            <Slider
              size="sm"
              color="primary"
              minValue={5}
              maxValue={240}
              step={5}
              value={dailyVal}
              onChange={v => setDaily(v as number)}
              classNames={{ thumb: 'bg-primary', track: 'bg-content3' }}
            />
          </div>
        </Row>
      </Section>

      <Section title="Notifications" description="Local Windows alerts — no internet required">
        <Row label="Daily reminder" description="Nudge if you haven't hit your goal">
          <Switch
            isSelected={reminderEnabled}
            onValueChange={setReminderEnabled}
            color="primary"
            size="sm"
          />
        </Row>
        {reminderEnabled && (
          <Row label="Reminder time" description={hourLabel(reminderHour)}>
            <div className="w-48">
              <Slider
                size="sm"
                color="primary"
                minValue={6}
                maxValue={23}
                step={1}
                value={reminderHour}
                onChange={v => setReminderHour(v as number)}
                classNames={{ thumb: 'bg-primary', track: 'bg-content3' }}
              />
            </div>
          </Row>
        )}
        <Row label="Streak at risk" description="Alert at 9pm if you haven't played today">
          <Switch isSelected={streakAlert} onValueChange={setStreakAlert} color="primary" size="sm" />
        </Row>
        <Row label="Weekly summary" description="Sunday evening recap of your week">
          <Switch isSelected={weeklySummary} onValueChange={setWeeklySummary} color="primary" size="sm" />
        </Row>
      </Section>

      <Section title="Session Detection">
        <Row label="Session end delay" description={`${debounceSeconds}s of silence before saving`}>
          <div className="w-48">
            <Slider
              size="sm"
              color="primary"
              minValue={5}
              maxValue={60}
              step={5}
              value={debounceSeconds}
              onChange={v => setDebounceSeconds(v as number)}
              classNames={{ thumb: 'bg-primary', track: 'bg-content3' }}
            />
          </div>
        </Row>
      </Section>

      <Section title="App" description="Version and updates">
        <Row label="Version">
          <Chip size="sm" variant="flat" classNames={{ base: 'bg-content3', content: 'text-foreground-400 tabular-nums text-xs' }}>
            {version ? `v${version}` : '—'}
          </Chip>
        </Row>
        <Row label="Updates" description={
          updaterState.phase === 'available'
            ? `v${updaterState.update.version} is available`
            : updaterState.phase === 'checking' ? 'Checking…'
            : updaterState.phase === 'up-to-date' ? "You're up to date"
            : updaterState.phase === 'error' ? updaterState.message
            : 'Check for the latest version'
        }>
          <Button
            size="sm"
            variant="bordered"
            color={updaterState.phase === 'available' ? 'success' : 'default'}
            onPress={() => checkForUpdates(false)}
            isLoading={updaterState.phase === 'checking' || updaterState.phase === 'downloading'}
            className="border-white/15 text-foreground-300"
          >
            {updaterState.phase === 'available' ? '↓ Install update' : 'Check for updates'}
          </Button>
        </Row>
      </Section>

      <div className="flex items-center gap-3 mt-2">
        <Button
          color="primary"
          onPress={save}
          isLoading={saving}
          className="font-medium"
        >
          Save Settings
        </Button>
        {saved && <Chip color="success" variant="flat" size="sm">✓ Saved</Chip>}
      </div>
    </div>
  );
}