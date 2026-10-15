'use client';

import { useEffect, useState } from 'react';
import { WidgetContainer } from '@/components/widgets/WidgetContainer';
import { CalmeWidget } from '../calme';
import type { WidgetViewProps } from '../types';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/i18n/I18nProvider';

interface Snapshot {
  online: boolean;
  server?: string;
  counters?: Record<string, number | undefined>;
  stats?: Record<string, number | undefined>;
  range?: string;
  error?: string;
}

const rows = [
  ['totalQueries', 'widget.technitium.queries'],
  ['totalNoError', 'widget.technitium.noError'],
  ['totalNxDomain', 'widget.technitium.nxDomain'],
  ['totalBlocked', 'widget.technitium.blocked'],
  ['totalClients', 'widget.technitium.clients'],
] as const;

export default function TechnitiumView({ instance, editMode }: WidgetViewProps) {
  const { t } = useI18n();
  const { config } = useConfig();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const range = typeof instance.settings.technitiumStatsRange === 'string'
    ? instance.settings.technitiumStatsRange
    : typeof config?.settings?.technitiumStatsRange === 'string' ? config.settings.technitiumStatsRange : 'hour';
  const node = typeof instance.settings.technitiumStatsNode === 'string'
    ? instance.settings.technitiumStatsNode
    : typeof config?.settings?.technitiumStatsNode === 'string' ? config.settings.technitiumStatsNode : 'cluster';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const query = new URLSearchParams({ range });
        if (node) query.set('node', node);
        const response = await fetch(`/api/technitium?${query.toString()}`, { cache: 'no-store' });
        const data = await response.json() as Snapshot;
        if (!cancelled) setSnapshot(response.ok ? data : { online: false, error: data.error });
      } catch (error) {
        if (!cancelled) setSnapshot({ online: false, error: error instanceof Error ? error.message : 'Request failed' });
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [range, node]);

  if (!snapshot && !editMode) return null;
  const counters = snapshot?.stats ?? snapshot?.counters ?? {};
  const state = snapshot ? (snapshot.online ? 'online' : 'offline') : 'waiting';
  const rangeLabels: Record<string, string> = {
    hour: 'widget.technitium.rangeHour',
    day: 'widget.technitium.rangeDay',
    week: 'widget.technitium.rangeWeek',
    month: 'widget.technitium.rangeMonth',
    year: 'widget.technitium.rangeYear',
    all: 'widget.technitium.rangeAll',
  };
  const rangeLabel = t(rangeLabels[range] ?? rangeLabels.hour);
  const scopeName = node === 'cluster'
    ? t('widget.technitium.cluster')
    : snapshot?.server || node;
  const widgetName = `${t('widget.technitium.name')} · ${scopeName}`;
  const status = state === 'online' ? t('widget.technitium.online') : state === 'offline' ? t('widget.technitium.offline') : t('widget.technitium.loading');
  const statusNode = <span className={`ndc-dot ndc-dev-state--${state}`} title={status} aria-label={status} />;

  return (
    <WidgetContainer>
      <CalmeWidget title={widgetName} editMode={editMode}>
        <div className={`ndc-dev ${state === 'offline' ? 'is-offline' : ''}`}>
          <div className="ndc-dev-head">
            <span className="ndc-dev-icon" aria-hidden="true">🧭</span>
            <span className="ndc-dev-id">
              <span className="ndc-dev-name">{widgetName}</span>
              <span className="ndc-dev-sub">{t('widget.technitium.statsRange')}: {rangeLabel}</span>
            </span>
            {statusNode}
          </div>
          {snapshot?.error ? <div className="ndc-dev-error" role="status">{snapshot.error}</div> : (
            <dl className="ndc-metric-list ndc-metric-list--value ndc-technitium-stats">
              {rows.map(([key, label]) => (
                <div key={key} className="ndc-m ndc-m--value">
                  <div className="ndc-m-head">
                    <dt className="ndc-m-label">{t(label)}</dt>
                    <dd className="ndc-m-value">
                      {typeof counters[key] === 'number' ? counters[key]?.toLocaleString() : '—'}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          )}
        </div>
      </CalmeWidget>
    </WidgetContainer>
  );
}
