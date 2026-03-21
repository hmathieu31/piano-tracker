import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Card, CardBody, Progress, Chip, Image } from '@heroui/react';
import { NavLink } from 'react-router-dom';
import { useSessionStatus, useStreak, useGoalsStatus, useDailyTotals, useSessions, useSongsWithStats } from '../hooks/useData';
import { formatDuration, formatDurationLong } from '../utils';
import { feelingEmoji } from '../components/FeelingPicker';
import MasteryBadge from '../components/MasteryBadge';

export default function Home() {
  const status = useSessionStatus();
  const streak = useStreak();
  const { data: goalsStatus } = useGoalsStatus();
  const { data: daily } = useDailyTotals(7);
  const { data: recentSessions } = useSessions(5);
  const { data: allSongs } = useSongsWithStats();

  const todaySeconds = goalsStatus?.today_seconds ?? 0;
  const dailyGoalSeconds = (goalsStatus?.config.daily_minutes ?? 30) * 60;
  const goalProgress = Math.min(100, (todaySeconds / dailyGoalSeconds) * 100);
  const goalMet = todaySeconds >= dailyGoalSeconds;

  const inProgressSongs = allSongs
    .filter(s => s.status === 'learning' || s.status === 'practicing')
    .sort((a, b) => (b.last_played_date ?? '').localeCompare(a.last_played_date ?? ''))
    .slice(0, 4);

  // Songs not played in 14+ days that are mastered (forgetting curve nudge)
  const today = new Date().toISOString().slice(0, 10);
  const needsReview = allSongs
    .filter(s => {
      if (!s.last_played_date) return false;
      const daysSince = Math.floor((Date.parse(today) - Date.parse(s.last_played_date)) / 86400000);
      return daysSince >= 14 && (s.status === 'mastered' || s.status === 'practicing');
    })
    .sort((a, b) => (a.last_played_date ?? '').localeCompare(b.last_played_date ?? ''))
    .slice(0, 3);

  const masteredCount = allSongs.filter(s => s.status === 'mastered').length;
  const totalHours = allSongs.reduce((a, s) => a + (s.total_seconds ?? 0), 0);

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-foreground-400 text-sm mt-0.5">
          {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Quick stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Practice Time', value: formatDurationLong(totalHours), sub: 'all time' },
          { label: 'Songs Mastered', value: String(masteredCount), sub: `of ${allSongs.length} in library` },
          { label: 'Best Streak', value: `${streak.best_streak}d`, sub: `current: ${streak.current_streak}d 🔥` },
        ].map(stat => (
          <Card key={stat.label} classNames={{ base: 'bg-content2 border border-divider', body: 'p-4' }}>
            <CardBody>
              <div className="text-xs text-foreground-500 uppercase tracking-wide mb-1">{stat.label}</div>
              <div className="text-xl font-bold text-foreground">{stat.value}</div>
              <div className="text-[11px] text-foreground-500 mt-0.5">{stat.sub}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Goal ring + live status + streak */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card classNames={{ base: 'bg-content2 border border-divider', body: 'p-5 flex flex-col items-center' }}>
          <CardBody>
            <div className="w-32 h-32 mb-3">
              <CircularProgressbar
                value={goalProgress}
                text={`${Math.round(goalProgress)}%`}
                styles={buildStyles({
                  pathColor: goalMet ? '#22c55e' : '#0ea5e9',
                  textColor: goalMet ? '#22c55e' : '#0ea5e9',
                  trailColor: 'rgba(255,255,255,0.07)',
                  textSize: '18px',
                })}
              />
            </div>
            <div className="text-2xl font-bold text-foreground">{formatDurationLong(todaySeconds)}</div>
            <div className="text-foreground-400 text-xs mt-1">of {goalsStatus?.config.daily_minutes ?? 30} min goal</div>
            {goalMet && <Chip color="success" variant="flat" size="sm" className="mt-2">✅ Goal reached!</Chip>}
          </CardBody>
        </Card>

        <Card classNames={{ base: `border transition-colors ${status.is_playing ? 'border-success/30 bg-success/5' : 'bg-content2 border-divider'}`, body: 'p-5' }}>
          <CardBody>
            <div className="text-foreground-400 text-xs uppercase tracking-wider mb-3">Live Status</div>
            {status.is_playing ? (
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 bg-success rounded-full pulse-ring" />
                  <span className="text-success font-semibold">Currently Playing</span>
                </div>
                <div className="text-3xl font-bold text-foreground">{formatDuration(status.elapsed_seconds)}</div>
                <div className="text-foreground-500 text-xs mt-1">this session</div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 bg-content4 rounded-full" />
                  <span className="text-foreground-400">Not playing</span>
                </div>
                <div className="text-foreground-500 text-sm mt-2">
                  {status.midi_connected ? 'Piano connected — waiting for notes' : 'No MIDI device detected'}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card classNames={{ base: 'bg-content2 border border-divider', body: 'p-5' }}>
          <CardBody>
            <div className="text-foreground-400 text-xs uppercase tracking-wider mb-3">Practice Streak</div>
            <div className="text-4xl font-bold text-warning">
              {streak.current_streak}<span className="text-2xl ml-1">🔥</span>
            </div>
            <div className="text-foreground-500 text-xs mt-1">days in a row</div>
            <Progress
              value={Math.min(100, (streak.current_streak / Math.max(streak.best_streak, 1)) * 100)}
              color="warning"
              size="sm"
              className="mt-3"
            />
            <div className="mt-1.5 text-xs text-foreground-500">
              Best: <span className="text-foreground-300">{streak.best_streak} days</span>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* In Progress songs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground-300 uppercase tracking-wide">In Progress</h2>
          <NavLink to="/repertoire" className="text-xs text-primary hover:text-primary/80 transition-colors">
            View Repertoire →
          </NavLink>
        </div>
        {inProgressSongs.length === 0 ? (
          <Card classNames={{ base: 'bg-content2 border border-dashed border-divider', body: 'p-6 text-center' }}>
            <CardBody>
              <div className="text-foreground-500 text-sm">No songs in progress yet.</div>
              <NavLink to="/repertoire" className="text-primary text-sm mt-1 hover:underline block">
                Go to Repertoire to add songs →
              </NavLink>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inProgressSongs.map(song => {
              const daysSince = song.last_played_date
                ? Math.floor((Date.parse(today) - Date.parse(song.last_played_date)) / 86400000)
                : null;
              return (
                <NavLink key={song.id} to={`/repertoire?song=${song.id}`}>
                  <Card classNames={{ base: 'bg-content2 border border-divider hover:border-primary/30 transition-colors cursor-pointer', body: 'p-3' }}>
                    <CardBody>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-content3 flex-shrink-0">
                          {song.cover_url
                            ? <Image src={song.cover_url} alt={song.title} className="w-12 h-12 object-cover" removeWrapper />
                            : <div className="w-12 h-12 flex items-center justify-center text-2xl">🎵</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{song.title}</div>
                          <div className="text-xs text-foreground-400 truncate">{song.artist ?? 'Unknown'}</div>
                          <div className="mt-1.5">
                            <MasteryBadge status={song.status} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-foreground-400">{song.session_count ?? 0} sessions</div>
                          {daysSince != null && (
                            <div className={`text-[10px] mt-0.5 ${daysSince === 0 ? 'text-success' : daysSince >= 7 ? 'text-warning' : 'text-foreground-500'}`}>
                              {daysSince === 0 ? 'Today' : `${daysSince}d ago`}
                            </div>
                          )}
                          {song.avg_feeling != null && (
                            <div className="text-base mt-1">{feelingEmoji(Math.round(song.avg_feeling))}</div>
                          )}
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>

      {/* Needs Review nudge — Strava-style "you haven't done X in N days" */}
      {needsReview.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground-300 uppercase tracking-wide">🔔 Time to Revisit</h2>
            <NavLink to="/repertoire" className="text-xs text-primary hover:text-primary/80 transition-colors">
              View Repertoire →
            </NavLink>
          </div>
          <div className="space-y-2">
            {needsReview.map(song => {
              const daysSince = Math.floor((Date.parse(today) - Date.parse(song.last_played_date!)) / 86400000);
              return (
                <NavLink key={song.id} to={`/repertoire?song=${song.id}`}>
                  <Card classNames={{ base: 'bg-warning/5 border border-warning/20 hover:border-warning/40 transition-colors cursor-pointer', body: 'p-3' }}>
                    <CardBody>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-content3 flex-shrink-0">
                          {song.cover_url
                            ? <Image src={song.cover_url} alt={song.title} className="w-10 h-10 object-cover" removeWrapper />
                            : <div className="w-10 h-10 flex items-center justify-center text-xl">🎵</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{song.title}</div>
                          <div className="text-xs text-foreground-400">{song.artist ?? 'Unknown Artist'}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-warning text-xs font-medium">{daysSince} days ago</div>
                          <div className="text-foreground-500 text-[10px]">Don't forget me</div>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </NavLink>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground-300 uppercase tracking-wide">Recent Sessions</h2>
            <NavLink to="/sessions" className="text-xs text-primary hover:text-primary/80 transition-colors">
              View All →
            </NavLink>
          </div>
          <Card classNames={{ base: 'bg-content2 border border-divider', body: 'p-0' }}>
            <CardBody>
              {recentSessions.map((s, i) => (
                <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${i < recentSessions.length - 1 ? 'border-b border-divider' : ''}`}>
                  <div className="text-xl w-8 text-center flex-shrink-0">{feelingEmoji(s.feeling)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">
                      {s.song?.title ?? s.song_name ?? <span className="text-foreground-500 italic">Unnamed session</span>}
                    </div>
                    <div className="text-xs text-foreground-500">{s.date}</div>
                  </div>
                  <Chip color="primary" variant="flat" size="sm" className="flex-shrink-0">{formatDurationLong(s.duration_seconds)}</Chip>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Last 7 days mini chart */}
      {daily.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground-300 uppercase tracking-wide mb-3">Last 7 Days</h2>
          <Card classNames={{ base: 'bg-content2 border border-divider', body: 'p-5' }}>
            <CardBody>
              <div className="flex items-end gap-2 h-20">
                {daily.slice(-7).map((d) => {
                  const pct = dailyGoalSeconds > 0 ? Math.min(100, (d.total_seconds / dailyGoalSeconds) * 100) : 0;
                  const isToday = d.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="text-[9px] text-foreground-500 group-hover:text-foreground-300">
                        {formatDuration(d.total_seconds)}
                      </div>
                      <div className="w-full rounded-sm transition-all" style={{
                        height: `${Math.max(4, pct * 0.6)}px`,
                        backgroundColor: d.total_seconds >= dailyGoalSeconds ? '#22c55e'
                          : isToday ? '#0ea5e9'
                          : d.total_seconds > 0 ? '#0369a1'
                          : 'rgba(255,255,255,0.07)'
                      }} />
                      <div className={`text-[9px] ${isToday ? 'text-primary' : 'text-foreground-500'}`}>
                        {new Date(d.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short' })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
