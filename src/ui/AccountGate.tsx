import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { App } from '../App.tsx';
import {
  AccountPersistence,
  PROGRESS_SPACES,
  type ProgressSpace,
} from '../state/accountPersistence.ts';
import { progressSession, setProgressSession } from '../state/sessionProgress.ts';
import { createAccountClient, progressBackend } from '../state/supabase.ts';

const configured = Boolean(import.meta.env.VITE_SUPABASE_URL);
const clientPromise = createAccountClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  import.meta.env.MODE === 'account-test',
);
type Mode = 'login' | 'register' | 'forgot' | 'reset';

function AccountForm({
  client,
  mode,
  onMode,
  onVisitor,
}: {
  client: SupabaseClient;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onVisitor: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const redirect = new URL(import.meta.env.BASE_URL, location.href);
      redirect.search = '';
      redirect.hash = '';
      if (mode === 'forgot') {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: redirect.href,
        });
        if (error) throw error;
        setMessage(
          'Si un compte correspond à cette adresse, une demande de récupération a été envoyée.',
        );
      } else if (mode === 'reset') {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        location.reload();
      } else if (mode === 'register') {
        const { error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirect.href },
        });
        if (error) throw error;
        setMessage('Vérifiez votre messagerie pour confirmer votre adresse.');
        onMode('login');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.reload();
      }
    } catch {
      setMessage('Cette opération n’a pas pu aboutir. Vérifiez vos informations et réessayez.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-screen">
      <p className="intro__kanji" lang="ja" aria-hidden="true">
        囲碁
      </p>
      <h1>Goban Dojo</h1>
      <h2>
        {mode === 'register'
          ? 'Créer mon compte'
          : mode === 'forgot'
            ? 'Récupérer mon compte'
            : mode === 'reset'
              ? 'Nouveau mot de passe'
              : 'Retrouver ma progression'}
      </h2>
      <form onSubmit={(e) => void submit(e)}>
        {mode !== 'reset' && (
          <label>
            Adresse e-mail
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </label>
        )}
        {mode !== 'forgot' && (
          <label>
            Mot de passe
            <input
              type="password"
              required
              minLength={mode === 'login' ? 1 : 12}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
        )}
        <button className="chip chip--accent" disabled={busy} type="submit">
          {mode === 'login'
            ? 'Se connecter'
            : mode === 'register'
              ? 'Créer mon compte'
              : mode === 'forgot'
                ? 'Envoyer le lien'
                : 'Modifier le mot de passe'}
        </button>
      </form>
      <p role="status">{message}</p>
      {mode !== 'reset' && (
        <div className="account-actions">
          {mode !== 'login' && (
            <button className="chip" onClick={() => onMode('login')}>
              Se connecter
            </button>
          )}
          {mode !== 'register' && (
            <button className="chip" onClick={() => onMode('register')}>
              Créer un compte
            </button>
          )}
          {mode !== 'forgot' && (
            <button className="chip" onClick={() => onMode('forgot')}>
              Mot de passe oublié ?
            </button>
          )}
          <button className="chip" onClick={onVisitor}>
            Continuer en visiteur
          </button>
          <p>Sans compte, les parties et la progression ne sont pas sauvegardées.</p>
        </div>
      )}
    </main>
  );
}

function DojoSession({ account, onLeave }: { account: boolean; onLeave: () => Promise<void> }) {
  const session = progressSession();
  const status = useSyncExternalStore(session.subscribe, () => session.status);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (status !== 'pending' && status !== 'error') return;
    const warn = (event: BeforeUnloadEvent) => {
      if (session.status !== 'pending' && session.status !== 'error') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session, status]);
  return (
    <>
      <aside className="account-indicator" aria-label="Compte et sauvegarde">
        <span aria-live="polite">
          {status === 'visitor'
            ? 'Visiteur · aucune sauvegarde'
            : status === 'pending'
              ? 'Synchronisation…'
              : status === 'error'
                ? 'Synchronisation interrompue'
                : 'Progression synchronisée'}
        </span>
        {status === 'error' && (
          <>
            <button className="chip" onClick={() => void session.flush()}>
              Réessayer
            </button>
            <button
              className="chip"
              onClick={() => {
                if (!window.confirm('Quitter sans enregistrer les modifications en attente ?'))
                  return;
                session.discard();
                location.reload();
              }}
            >
              Recharger sans les modifications en attente
            </button>
            <button
              className="chip"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(session.pendingSnapshot(), null, 2)], {
                    type: 'application/json',
                  }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'goban-dojo-en-attente.json';
                link.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Exporter les modifications en attente
            </button>
          </>
        )}
        {configured && (
          <button
            className="chip"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onLeave().finally(() => setBusy(false));
            }}
          >
            {account ? 'Se déconnecter' : 'Se connecter'}
          </button>
        )}
      </aside>
      <App />
    </>
  );
}

export function AccountGate() {
  const [view, setView] = useState<
    'loading' | 'auth' | 'visitor' | 'account' | 'migration' | 'error'
  >(configured ? 'loading' : 'visitor');
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [legacy, setLegacy] = useState<Partial<Record<ProgressSpace, string>>>({});
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState(false);
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    let recovery = false;
    let userId: string | null = null;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const client = await clientPromise;
        if (!alive) return;
        if (!client) {
          setView('error');
          return;
        }
        setClient(client);
        const {
          data: { subscription },
        } = client.auth.onAuthStateChange((event, session) => {
          if (!alive) return;
          if (event === 'PASSWORD_RECOVERY') {
            recovery = true;
            setMode('reset');
            setView('auth');
          }
          if (userId && (event === 'SIGNED_OUT' || (session && session.user.id !== userId)))
            location.reload();
        });
        unsubscribe = () => subscription.unsubscribe();
        const {
          data: { session },
          error,
        } = await client.auth.getSession();
        if (!alive || recovery) return;
        if (error || !session) {
          setView('auth');
          return;
        }
        const {
          data: { user },
          error: userError,
        } = await client.auth.getUser();
        if (!alive || recovery) return;
        if (userError || !user || user.is_anonymous) {
          setView('auth');
          return;
        }
        userId = user.id;
        const progress = await AccountPersistence.connected(progressBackend(client, user.id));
        if (!alive || recovery) return;
        setProgressSession(progress);
        try {
          const { legacyProgress } = await import('../state/legacyProgress.ts');
          if (!alive) return;
          const old = legacyProgress(localStorage);
          const transferable = Object.fromEntries(
            PROGRESS_SPACES.flatMap((space) =>
              old[space] && !progress.read(space) ? [[space, old[space]]] : [],
            ),
          );
          if (Object.keys(transferable).length) {
            setLegacy(transferable);
            setView('migration');
            return;
          }
        } catch {
          /* Storage can be disabled; online progress is still available. */
        }
        setView('account');
      } catch {
        if (alive && !recovery) setView('error');
      }
    })();
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);
  if (view === 'loading')
    return (
      <main className="account-screen" role="status">
        Chargement du compte…
      </main>
    );
  if (view === 'error')
    return (
      <main className="account-screen">
        <p role="alert">Impossible de récupérer votre progression.</p>
        <button className="chip" onClick={() => location.reload()}>
          Réessayer
        </button>
      </main>
    );
  if (view === 'migration')
    return (
      <main className="account-screen">
        <h1>Récupérer votre ancienne progression ?</h1>
        <p>
          Ce navigateur contient des sauvegardes locales. Vous pouvez les associer à ce compte dans
          les espaces encore vides, ou les laisser intactes.
        </p>
        <p>{Object.keys(legacy).length} espace(s) à transférer.</p>
        {migrationError && (
          <p role="alert">
            Transfert incomplet. Les anciennes sauvegardes n’ont pas été effacées. Réessayez.
          </p>
        )}
        <button
          className="chip"
          disabled={migrating}
          onClick={() => {
            void (async () => {
              setMigrating(true);
              const progress = progressSession();
              for (const space of PROGRESS_SPACES) {
                const value = legacy[space];
                if (value && !progress.read(space)) progress.write(space, value);
              }
              await progress.flush();
              setMigrating(false);
              if (progress.status === 'error') {
                setMigrationError(true);
                return;
              }
              setView('account');
            })();
          }}
        >
          Transférer mes anciennes sauvegardes
        </button>
        <button
          className="chip"
          disabled={migrating || migrationError}
          onClick={() => setView('account')}
        >
          Continuer sans transférer
        </button>
      </main>
    );
  if (view === 'auth' && client)
    return (
      <AccountForm
        client={client}
        mode={mode}
        onMode={setMode}
        onVisitor={() => {
          setProgressSession(AccountPersistence.visitor());
          setView('visitor');
        }}
      />
    );
  return (
    <DojoSession
      account={view === 'account'}
      onLeave={async () => {
        if (view === 'account') {
          if (!(await progressSession().close())) return;
          const result = await client?.auth.signOut({ scope: 'local' });
          if (result?.error) {
            location.reload();
            return;
          }
          location.reload();
        } else {
          await progressSession().close();
          location.reload();
        }
      }}
    />
  );
}
