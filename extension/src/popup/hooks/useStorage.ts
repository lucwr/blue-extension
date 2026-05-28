import { getMasterProfile, setMasterProfile } from '@/storage';
import type { MasterProfile } from '@/types/resume';
import { useCallback, useEffect, useState } from 'react';

export function useMasterProfile(): {
  profile: MasterProfile | null;
  saving: boolean;
  save: (next: MasterProfile) => Promise<void>;
  loading: boolean;
} {
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getMasterProfile().then((p) => {
      if (!mounted) return;
      setProfile(p ?? null);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const save = useCallback(async (next: MasterProfile) => {
    setSaving(true);
    try {
      await setMasterProfile(next);
      setProfile(next);
    } finally {
      setSaving(false);
    }
  }, []);

  return { profile, saving, save, loading };
}
