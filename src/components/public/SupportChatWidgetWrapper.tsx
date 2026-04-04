'use client';

import { SupportChatWidget } from '@/engine/components/SupportChatWidget';
import { useBlankTranslations } from '@/lib/translations';
import { clientEnv } from '@/lib/env-client';
import { supportChatConfig } from '@/config/support-chat';
import { accountRoutes } from '@/config/routes';

export function SupportChatWidgetWrapper() {
  const __ = useBlankTranslations();

  if (!clientEnv.NEXT_PUBLIC_SUPPORT_CHAT_ENABLED) return null;

  return (
    <SupportChatWidget
      __={__}
      welcomeMessage={supportChatConfig.welcomeMessage}
      placeholder={supportChatConfig.placeholder}
      supportUrl={accountRoutes.supportDetail}
    />
  );
}
