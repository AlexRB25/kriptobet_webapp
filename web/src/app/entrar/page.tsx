"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/header";
import { useAccount } from "@/lib/account";
import { authErrorMessage, supabase, supabaseConfigured } from "@/lib/supabase";

function SignInForm() {
  const router = useRouter();
  const { session } = useAccount();
  const [isRegister, setIsRegister] = useState(useSearchParams().get("modo") === "registro");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Also covers arriving here while already signed in.
  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!supabaseConfigured) return setError("Falta configurar Supabase en .env.local.");
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;

    setBusy(true);
    const { data, error } = isRegister
      ? await supabase().auth.signUp({ email: form.email, password: form.password, options: { data: { name: form.name.trim() } } })
      : await supabase().auth.signInWithPassword({ email: form.email, password: form.password });
    setBusy(false);

    if (error) setError(authErrorMessage(error));
    else if (!data.session && data.user?.identities?.length === 0) setError("Ya existe una cuenta con ese correo.");
    else if (!data.session) {
      setNotice("Te enviamos un correo. Confirma tu cuenta y luego entra aquí.");
      setIsRegister(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-6 flex w-full max-w-sm flex-col gap-4">
      <div className="self-center">
        <Logo />
      </div>
      <h1 className="text-center text-xl">{isRegister ? "Crea tu cuenta" : "Entra a tu cuenta"}</h1>
      <p className="-mt-2 text-center text-sm text-muted">La misma cuenta funciona en la web y en la app.</p>
      {isRegister && (
        <label className="label">
          Nombre
          <input name="name" className="input" autoComplete="name" required minLength={2} maxLength={40} />
        </label>
      )}
      <label className="label">
        Correo
        <input name="email" type="email" className="input" autoComplete="email" required />
      </label>
      <label className="label">
        Contraseña
        <input
          name="password"
          type="password"
          className="input"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 8 : 1}
          maxLength={72}
        />
      </label>
      {isRegister && (
        <label className="flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" required className="mt-0.5 accent-brand" />
          Confirmo que soy mayor de 18 años y que apostar en línea es legal donde vivo.
        </label>
      )}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <button className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? "Un momento…" : isRegister ? "Crear cuenta" : "Entrar"}
      </button>
      <button
        type="button"
        className="cursor-pointer text-sm text-muted underline"
        onClick={() => {
          setIsRegister(!isRegister);
          setError("");
        }}>
        {isRegister ? "Ya tengo cuenta" : "Crear una cuenta"}
      </button>
    </form>
  );
}

export default function SignInPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
