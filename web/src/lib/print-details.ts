import type { PassEntity } from '@/core/domain/entities/pass.entity';

interface PackedPrintDetails {
  passes: (PassEntity & { authoritySignatureIndex?: number })[];
  authoritySignatures: string[];
}

export function packPrintDetails(passes: PassEntity[]): PackedPrintDetails {
  const signatures = new Map<string, number>();
  const records = passes.map(({ authority_signature_url, ...pass }) => {
    if (!authority_signature_url) return pass;
    if (!signatures.has(authority_signature_url)) signatures.set(authority_signature_url, signatures.size);
    return { ...pass, authoritySignatureIndex: signatures.get(authority_signature_url) };
  });
  return { passes: records, authoritySignatures: [...signatures.keys()] };
}

export function unpackPrintDetails({ passes, authoritySignatures }: PackedPrintDetails): PassEntity[] {
  return passes.map(({ authoritySignatureIndex, ...pass }) => authoritySignatureIndex === undefined
    ? pass
    : { ...pass, authority_signature_url: authoritySignatures[authoritySignatureIndex] });
}

async function fetchChunk(ids: string[], signal?: AbortSignal): Promise<PassEntity[]> {
  const response = await fetch('/api/passes/print-details', {
    method: 'POST', signal, cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (response.status === 413 && ids.length > 1) {
    const middle = Math.ceil(ids.length / 2);
    return [...await fetchChunk(ids.slice(0, middle), signal), ...await fetchChunk(ids.slice(middle), signal)];
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || 'Could not load the selected passes.');
  }
  return unpackPrintDetails(await response.json());
}

export async function fetchPrintDetails(ids: string[], signal?: AbortSignal): Promise<PassEntity[]> {
  const passes: PassEntity[] = [];
  for (let offset = 0; offset < ids.length; offset += 8) {
    passes.push(...await fetchChunk(ids.slice(offset, offset + 8), signal));
  }
  return passes;
}
