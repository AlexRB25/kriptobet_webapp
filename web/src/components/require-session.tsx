"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAccount } from "@/lib/account";

/** Shows its children only to signed-in users; everyone else gets a prompt to sign in. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session, loading } = useAccount();
  if (loading) return <p className="text-sm text-muted">Cargando…</p>;
  if (!session) {
    return (
      <div className="card mx-auto flex max-w-sm flex-col items-center gap-3 py-8 text-center">
        <p className="text-4xl">🔒</p>
        <p className="font-semibold">Entra a tu cuenta para ver esta sección.</p>
        <Link href="/entrar" className="btn btn-primary">
          Entrar
        </Link>
      </div>
    );
  }
  return children;
}
