import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAccess } from "@/lib/admin.functions";
import { useAuth } from "@/lib/useAuth";

/** Gate dashboard queries: server fns require an admin role, so only fetch once confirmed. */
export function useAdmin() {
  const { session } = useAuth();
  const accessFn = useServerFn(getAccess);
  const access = useQuery({
    queryKey: ["access", session?.user.id],
    queryFn: () => accessFn({ data: undefined as never }),
    enabled: Boolean(session),
  });
  return { session, isAdmin: Boolean(access.data?.isAdmin), ready: access.isSuccess };
}
