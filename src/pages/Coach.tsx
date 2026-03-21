import { Card, CardBody, Chip } from '@heroui/react';

interface FeatureCard {
  icon: string;
  title: string;
  description: string;
  tag: string;
  tagColor: 'primary' | 'secondary' | 'warning' | 'success';
}

const upcomingFeatures: FeatureCard[] = [
  {
    icon: '🧠',
    title: 'Forgetting Curve Reminders',
    description: "Based on how long it's been since you last played a song, get notified before you start forgetting it. Like Duolingo streaks, but for your repertoire.",
    tag: 'Smart Reminders',
    tagColor: 'primary',
  },
  {
    icon: '📈',
    title: 'Progress Analysis',
    description: 'AI-powered analysis of your practice sessions — track improvement rate per song, identify pieces where you plateau, and get actionable tips.',
    tag: 'AI Analysis',
    tagColor: 'secondary',
  },
  {
    icon: '🎯',
    title: 'Practice Suggestions',
    description: "Each day, get a personalised practice plan: which songs need attention, what to work on first, how long to spend. Optimise every session.",
    tag: 'Daily Plan',
    tagColor: 'warning',
  },
  {
    icon: '🎼',
    title: 'Exercise Library',
    description: 'Structured exercises — scales, arpeggios, Hanon, sight-reading — with tracking so you can see how your technique is improving over time.',
    tag: 'Exercises',
    tagColor: 'success',
  },
  {
    icon: '🏅',
    title: 'Practice Challenges',
    description: 'Monthly challenges like "Master 3 new pieces", "30 minutes every day for a week", or "Play every key signature". Compete with yourself.',
    tag: 'Challenges',
    tagColor: 'primary',
  },
  {
    icon: '🎹',
    title: 'MIDI Performance Review',
    description: 'Analyse your recordings for timing accuracy, dynamic range, and consistency. See your piano roll visualised with tempo analysis.',
    tag: 'Performance',
    tagColor: 'secondary',
  },
];

export default function Coach() {
  return (
    <div className="p-6 lg:p-8 fade-in max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xl">
            🤖
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Coach</h1>
            <p className="text-foreground-400 text-sm">Your AI-powered piano practice companion</p>
          </div>
          <Chip color="warning" variant="flat" size="sm" className="ml-auto">Coming Soon</Chip>
        </div>

        <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-2xl p-5">
          <p className="text-foreground-300 text-sm leading-relaxed">
            Coach turns Ivory into a real practice partner — not just a tracker, but an intelligent guide
            that knows your repertoire, your patterns, and what you need to improve. Think of it as having
            a personal piano teacher available 24/7.
          </p>
          <p className="text-foreground-500 text-xs mt-3">
            In the meantime, keep logging sessions, tagging songs, and rating your mood — this data will
            power everything Coach does when it launches.
          </p>
        </div>
      </div>

      {/* Feature cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest mb-4">What's Coming</h2>
        {upcomingFeatures.map(f => (
          <Card key={f.title} classNames={{ base: 'bg-content2 border border-divider opacity-80 hover:opacity-100 transition-opacity', body: 'p-4' }}>
            <CardBody>
              <div className="flex items-start gap-4">
                <div className="text-2xl flex-shrink-0 mt-0.5">{f.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground">{f.title}</span>
                    <Chip color={f.tagColor} variant="flat" size="sm" className="h-5 text-[10px]">
                      {f.tag}
                    </Chip>
                  </div>
                  <p className="text-xs text-foreground-400 leading-relaxed">{f.description}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Strava-style motivation */}
      <div className="mt-8 text-center">
        <div className="text-2xl mb-2">🎹</div>
        <p className="text-foreground-500 text-sm">
          Every session you log today is data Coach will use tomorrow.
        </p>
        <p className="text-foreground-600 text-xs mt-1">Keep practicing.</p>
      </div>
    </div>
  );
}
