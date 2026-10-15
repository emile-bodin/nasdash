import React, { useEffect, useState } from 'react';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/i18n/I18nProvider';
import { usePages } from '@/providers/PagesProvider';
import { WidgetPlacementNote } from '../../shared/WidgetPlacementNote';
import { CalmeHeading, CalmeRow, CalmeSegmented } from '../../shared/CalmeControls';

const RANGE_OPTIONS = [
  { value: 'hour', labelKey: 'widget.technitium.rangeHour' },
  { value: 'day', labelKey: 'widget.technitium.rangeDay' },
  { value: 'week', labelKey: 'widget.technitium.rangeWeek' },
  { value: 'month', labelKey: 'widget.technitium.rangeMonth' },
  { value: 'year', labelKey: 'widget.technitium.rangeYear' },
  { value: 'all', labelKey: 'widget.technitium.rangeAll' },
] as const;

export function TechnitiumWidgetTab() {
  const { t } = useI18n();
  const { config, updateConfig, settingsModal } = useConfig();
  const { getPage, updateWidgetSettings } = usePages();
  const targetWidget = settingsModal.targetPageId && settingsModal.targetWidgetId
    ? getPage(settingsModal.targetPageId)?.widgets.find(widget => widget.id === settingsModal.targetWidgetId)
    : undefined;
  const value = typeof targetWidget?.settings.technitiumStatsRange === 'string'
    ? targetWidget.settings.technitiumStatsRange
    : config?.settings?.technitiumStatsRange ?? 'hour';
  const node = typeof targetWidget?.settings.technitiumStatsNode === 'string'
    ? targetWidget.settings.technitiumStatsNode
    : config?.settings?.technitiumStatsNode ?? 'cluster';
  const [nodes, setNodes] = useState<{ name: string }[]>([]);
  const [clusterInitialized, setClusterInitialized] = useState(false);
  const [currentNode, setCurrentNode] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/technitium/nodes', { cache: 'no-store' }).then(response => response.json()).then(data => {
      if (cancelled) return;
      setNodes(Array.isArray(data.nodes) ? data.nodes : []);
      setClusterInitialized(data.clusterInitialized === true);
      setCurrentNode(typeof data.currentNode === 'string' ? data.currentNode : '');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const nodeOptions = [
    ...(clusterInitialized ? [{ value: 'cluster', label: t('widget.technitium.cluster') }] : []),
    ...nodes.map(item => ({ value: item.name, label: item.name })),
    ...(!clusterInitialized && currentNode ? [{ value: currentNode, label: currentNode }] : []),
  ];

  const updateWidgetOrGlobal = async (settings: Record<string, string>) => {
    if (settingsModal.targetPageId && settingsModal.targetWidgetId) {
      updateWidgetSettings(settingsModal.targetPageId, settingsModal.targetWidgetId, settings);
    } else {
      await updateConfig(settings);
    }
  };

  return (
    <div className="ndc-set-page">
      <WidgetPlacementNote type="technitium" />
      <section className="ndc-set-block">
        <CalmeHeading>{t('widget.technitium.statsRange')}</CalmeHeading>
        <CalmeRow label={t('widget.technitium.statsRange')} info={t('widget.technitium.statsRangeInfo')}>
          <CalmeSegmented
            label={t('widget.technitium.statsRange')}
            value={typeof value === 'string' ? value : 'hour'}
            options={RANGE_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))}
            onChange={async range => { await updateWidgetOrGlobal({ technitiumStatsRange: range }); }}
          />
        </CalmeRow>
      </section>
      {nodeOptions.length > 0 && <section className="ndc-set-block">
        <CalmeHeading>{t('widget.technitium.scope')}</CalmeHeading>
        <CalmeRow label={t('widget.technitium.scope')} info={t('widget.technitium.scopeInfo')}>
          <CalmeSegmented
            label={t('widget.technitium.scope')}
            value={nodeOptions.some(option => option.value === node) ? node : nodeOptions[0].value}
            options={nodeOptions}
            onChange={async selected => { await updateWidgetOrGlobal({ technitiumStatsNode: selected }); }}
          />
        </CalmeRow>
      </section>}
    </div>
  );
}
