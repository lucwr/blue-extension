import { sendToBackground } from '@/services/messaging';
import { getSettings } from '@/storage';
import type { ProposalTone } from '@/types/proposal';
import { useCallback } from 'react';
import { usePopupStore } from '../store';

export function useGenerateResume(): () => Promise<void> {
  const { jd, setResume, setStep, setError } = usePopupStore();
  return useCallback(async () => {
    if (!jd) return;
    setStep('generating-resume');
    setError(null);
    const { defaultTemplateId } = await getSettings();
    const result = await sendToBackground({
      type: 'BG_GENERATE_RESUME',
      payload: { jd, templateId: defaultTemplateId },
    });
    if (!result.ok) setError(result.error);
    else setResume(result.data);
    setStep('idle');
  }, [jd, setResume, setStep, setError]);
}

export function useGenerateProposal(): (tone?: ProposalTone) => Promise<void> {
  const { jd, setProposal, setStep, setError } = usePopupStore();
  return useCallback(
    async (toneOverride) => {
      if (!jd) return;
      setStep('generating-proposal');
      setError(null);
      const { defaultProposalTone } = await getSettings();
      const tone: ProposalTone = toneOverride ?? defaultProposalTone;
      const result = await sendToBackground({
        type: 'BG_GENERATE_PROPOSAL',
        payload: { jd, tone },
      });
      if (!result.ok) setError(result.error);
      else setProposal(result.data);
      setStep('idle');
    },
    [jd, setProposal, setStep, setError],
  );
}
