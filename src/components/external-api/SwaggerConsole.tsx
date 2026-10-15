'use client';

import { useEffect, useRef } from 'react';
import SwaggerUI from 'swagger-ui-dist/swagger-ui-es-bundle.js';
import { externalOpenApiDocument } from '@/lib/externalOpenApi';
import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';

export function SwaggerConsole() {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    SwaggerUI({
      domNode: container.current,
      spec: externalOpenApiDocument,
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: false,
      tryItOutEnabled: true,
      requestInterceptor: request => {
        // External API requests must never rely on the dashboard cookie.
        request.credentials = 'omit';
        return request;
      },
    });
    return () => {
      if (container.current) container.current.replaceChildren();
    };
  }, []);

  return (
    <main className="nd-swagger-page">
      <header className="nd-swagger-header">
        <div>
          <p className="nd-swagger-eyebrow">NasDash</p>
          <h1>{t('swagger.title')}</h1>
          <p>{t('swagger.instructions')}</p>
        </div>
        <Link className="nd-btn" href="/">{t('swagger.back')}</Link>
      </header>
      <div ref={container} />
    </main>
  );
}
