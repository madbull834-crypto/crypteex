import { useCallback, useEffect, useState } from "react";
import { useWeb3 } from "../context/Web3Context";

const PACKAGE_IDS = [1, 2, 3];

export function useSubscriptions() {
  const { ecosystemRead, account } = useWeb3();
  const [subscriptions, setSubscriptions] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!ecosystemRead || !account) {
      setSubscriptions({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(PACKAGE_IDS.map((id) => ecosystemRead.subscriptions(account, id)))
      .then((values) => {
        if (!cancelled) {
          setSubscriptions(Object.fromEntries(PACKAGE_IDS.map((id, index) => [id, Boolean(values[index])])));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ecosystemRead, account, tick]);

  return { subscriptions, loading, refetch };
}
