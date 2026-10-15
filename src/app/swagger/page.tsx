import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import 'swagger-ui-dist/swagger-ui.css';
import { SwaggerConsole } from '@/components/external-api/SwaggerConsole';
import { getSessionFromRequest } from '@/lib/auth';
import { messages } from '@/i18n/messages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: messages.en['swagger.metaTitle'],
  robots: { index: false, follow: false },
};

export default async function SwaggerPage() {
  const cookieStore = await cookies();
  const session = getSessionFromRequest({ cookies: cookieStore });
  if (session?.role !== 'admin') redirect('/login');
  return <SwaggerConsole />;
}
