import { sendToBackground } from '@/services/messaging';
import { getSettings } from '@/storage';
import type { ProposalTone } from '@/types/proposal';
import { useCallback } from 'react';
import { usePopupStore } from '../store';

export function useAnalyze(): () => Promise<void> {
  const { jd, setAnalysis, setStep, setError } = usePopupStore();
  return useCallback(async () => {
    if (!jd) return;
    setStep('analyzing');
    setError(null);
    const result = await sendToBackground({ type: 'BG_ANALYZE_JD', payload: { jd } });
    if (!result.ok) setError(result.error);
    else setAnalysis(result.data);
    setStep('idle');
  }, [jd, setAnalysis, setStep, setError]);
}

export function useGenerateResume(): () => Promise<void> {
  const { jd, analysis, setResume, setStep, setError } = usePopupStore();
  return useCallback(async () => {
    if (!jd || !analysis) return;
    setStep('generating-resume');
    setError(null);
    const { defaultTemplateId } = await getSettings();
    const result = await sendToBackground({
      type: 'BG_GENERATE_RESUME',
      payload: { jd, analysis, templateId: defaultTemplateId },
    });
    if (!result.ok) setError(result.error);
    else setResume(result.data);
    setStep('idle');
  }, [jd, analysis, setResume, setStep, setError]);
}

export function useGenerateProposal(): (tone?: ProposalTone) => Promise<void> {
  const { jd, analysis, setProposal, setStep, setError } = usePopupStore();
  return useCallback(
    async (toneOverride) => {
      if (!jd || !analysis) return;
      setStep('generating-proposal');
      setError(null);
      const { defaultProposalTone } = await getSettings();
      const tone: ProposalTone = toneOverride ?? defaultProposalTone;
      const result = await sendToBackground({
        type: 'BG_GENERATE_PROPOSAL',
        payload: { jd, analysis, tone },
      });
      if (!result.ok) setError(result.error);
      else setProposal(result.data);
      setStep('idle');
    },
    [jd, analysis, setProposal, setStep, setError],
  );
}
