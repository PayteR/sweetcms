'use client';

import { ChatWidget } from '@/engine/components/ChatWidget';
import { useBlankTranslations } from '@/lib/translations';
import { clientEnv } from '@/lib/env-client';
import { chatConfig } from '@/config/chat';
import { accountRoutes } from '@/config/routes';

export function ChatWidgetWrapper() {
  const __ = useBlankTranslations();

  if (!clientEnv.NEXT_PUBLIC_SUPPORT_CHAT_ENABLED) return null;

  return (
    <ChatWidget
      __={__}
      welcomeMessage={chatConfig.welcomeMessage}
      placeholder={chatConfig.placeholder}
      supportUrl={accountRoutes.supportDetail}
    />
  );
}
