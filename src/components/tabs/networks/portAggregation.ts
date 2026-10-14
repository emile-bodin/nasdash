export interface ActivePortItem {
  port: number;
  serviceName: string;
  ip: string;
  source: string;
  type: string;
  status?: string;
}

const isDockerSource = (source: string) => source.startsWith('Conteneur Docker');

/**
 * Add a port while collapsing the same endpoint from NasDash services and
 * Docker discovery. Independent services and containers remain separate.
 */
export function addPortItemToList(list: ActivePortItem[], item: ActivePortItem): void {
  const existingIndex = list.findIndex(x => {
    const sameEndpoint = x.port === item.port && x.type === item.type;
    const crossSource = isDockerSource(x.source) !== isDockerSource(item.source);
    const compatibleIp =
      x.ip === item.ip ||
      x.ip === 'localhost' ||
      item.ip === 'localhost' ||
      x.ip === '0.0.0.0' ||
      x.ip === '::' ||
      item.ip === '0.0.0.0' ||
      item.ip === '::';
    return sameEndpoint && crossSource && compatibleIp;
  });

  if (existingIndex >= 0) {
    const existing = list[existingIndex];
    // Prefer the curated NasDash service over the Docker discovery row,
    // while retaining the most specific IP when both are available.
    if (isDockerSource(existing.source) && !isDockerSource(item.source)) {
      list[existingIndex] = item;
      return;
    }

    const existingIsWildcard = existing.ip === '::' || existing.ip === '0.0.0.0' || existing.ip === 'localhost';
    const itemIsSpecific = item.ip !== '::' && item.ip !== '0.0.0.0' && item.ip !== 'localhost';
    if (existingIsWildcard && itemIsSpecific) {
      list[existingIndex].ip = item.ip;
    }
    return;
  }

  list.push(item);
}
