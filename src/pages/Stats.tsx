import { useState } from 'react';
import { Tabs, Tab } from '@heroui/react';
import Goals from './Goals';
import Charts from './Charts';
import Heatmap from './Heatmap';
import Insights from './Insights';

export default function Stats() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="flex flex-col h-full overflow-hidden fade-in">
      <div className="flex-shrink-0 px-6 pt-6 pb-0 border-b border-divider">
        <h1 className="text-2xl font-semibold text-foreground mb-4">Stats</h1>
        <Tabs
          selectedKey={tab}
          onSelectionChange={k => setTab(String(k))}
          variant="underlined"
          size="sm"
          classNames={{ tabList: 'gap-4 p-0', tab: 'px-0 h-9' }}
        >
          <Tab key="overview"  title="📈 Overview" />
          <Tab key="charts"    title="📊 Charts" />
          <Tab key="heatmap"   title="🗓️ Heatmap" />
          <Tab key="insights"  title="💡 Insights" />
        </Tabs>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview'  && <Goals />}
        {tab === 'charts'    && <Charts />}
        {tab === 'heatmap'   && <Heatmap />}
        {tab === 'insights'  && <Insights />}
      </div>
    </div>
  );
}
