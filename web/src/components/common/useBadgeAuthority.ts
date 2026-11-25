'use client';

import { useEffect, useState } from 'react';
import type { PassEntity } from '@/core/domain/entities/pass.entity';
import type { OfficeId } from '@/core/domain/offices';
import type { AuthoritySignatureConfig } from '@/core/interfaces/config-repository.interface';

type BadgeAuthority = Pick<PassEntity, 'authority_signature_url' | 'authority_name' | 'authority_title'>;

export function useBadgeAuthority(enabled: boolean, officeId: OfficeId | null): BadgeAuthority {
  const [loaded, setLoaded] = useState<{ officeId: OfficeId | null; config: AuthoritySignatureConfig } | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoaded(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/config/authority-signature?officeId=${officeId ?? 'unassigned'}`, {
      cache: 'no-cache',
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) return;
      const config: AuthoritySignatureConfig = await response.json();
      if (!controller.signal.aborted) setLoaded({ officeId, config });
    }).catch(() => {
      if (!controller.signal.aborted) setLoaded(null);
    });
    return () => controller.abort();
  }, [enabled, officeId]);

  if (!enabled || loaded?.officeId !== officeId) return {};
  return {
    authority_signature_url: loaded.config.signatureUrl,
    authority_name: loaded.config.name,
    authority_title: loaded.config.title,
  };
}
