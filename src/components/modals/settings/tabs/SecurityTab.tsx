'use client';

import React, { useState, useEffect } from 'react';
import { useConfig } from '@/hooks/useConfig';
import { User, Plus, Trash2, Eye, EyeOff, Pencil, X, KeyRound, Copy, ExternalLink } from 'lucide-react';
import { WIDGET_CATALOG } from '@/lib/widgets/catalog';
import { permissionSelection, savedPermissions } from '@/lib/permissions';

/** Widgets a viewer can be allowed individually: those whose definition names a permission. */
const PERMISSION_WIDGETS = [...new Map(WIDGET_CATALOG.flatMap(entry => entry.access && 'permission' in entry.access
  ? [{ id: entry.access.permission, icon: entry.icon, nameKey: entry.access.permission === 'devices' ? 'Appareils' : entry.nameKey }]
  : []).map(entry => [entry.id, entry])).values()];
import ConfirmModal from '@/components/modals/ConfirmModal';
import { CalmeHeading, CalmeRow, CalmeSegmented } from '../shared/CalmeControls';
import { Emoji } from '../../../shared/Emoji';
import { useI18n } from '@/i18n/I18nProvider';
import { usePages } from '@/providers/PagesProvider';

interface LocalUser {
  username: string;
  role: 'admin' | 'viewer';
  allowedTabs?: string[];
  allowedWidgets?: string[];
}

interface CustomTabOption {
  id: string;
  name: string;
}

const API_SCOPES = ['read:health', 'read:services', 'read:devices', 'read:metrics'] as const;

interface ExternalApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const DEFAULT_TABS = [
  { id: 'dashboard', name: 'Home' },
  { id: 'docker', name: 'Docker' },
  { id: 'networks', name: 'Réseaux' },
  { id: 'widgets', name: 'Widgets' },
];

export function SecurityTab() {
  const { t } = useI18n();
  const { config, updateConfig, user: currentUser, logout } = useConfig();
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  // Pages created by admins can be allowed like the official ones (same ids).
  const { pages } = usePages();
  const customTabs: CustomTabOption[] = pages.filter(page => !DEFAULT_TABS.some(tab => tab.id === page.id)).map(page => ({ id: page.id, name: page.name }));
  
  // Formulaire d'ajout / modification
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const [selectedTabs, setSelectedTabs] = useState<string[]>([]);
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([]);
  
  const [showPassword, setShowPassword] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ExternalApiKey[]>([]);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyScopes, setApiKeyScopes] = useState<string[]>([...API_SCOPES]);
  const [apiKeyExpiryDays, setApiKeyExpiryDays] = useState('90');
  const [generatedApiToken, setGeneratedApiToken] = useState<string | null>(null);
  const [creatingApiKey, setCreatingApiKey] = useState(false);

  // Modal de confirmation de suppression
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<string | null>(null);


  // Charger les utilisateurs et les onglets personnalisés au montage
  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error("User loading failed:", e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/auth/api-keys', { cache: 'no-store' });
      if (response.ok) setApiKeys(await response.json());
    } catch (error) {
      console.error('API key loading failed:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchApiKeys();
  }, []);

  const createApiKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!apiKeyName.trim() || apiKeyScopes.length === 0) return;
    setCreatingApiKey(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const expiresAt = apiKeyExpiryDays === 'never'
        ? undefined
        : new Date(Date.now() + Number(apiKeyExpiryDays) * 86_400_000).toISOString();
      const response = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: apiKeyName.trim(), scopes: apiKeyScopes, expiresAt }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t('externalApi.createFailed'));
      setGeneratedApiToken(result.token);
      setApiKeyName('');
      setActionSuccess(t('externalApi.created'));
      await fetchApiKeys();
    } catch (error) {
      setActionError(getErrorMessage(error, t('externalApi.createFailed')));
    } finally {
      setCreatingApiKey(false);
    }
  };

  const revokeApiKey = async (id: string) => {
    setActionError(null);
    const response = await fetch(`/api/auth/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) setActionError(result.error || t('externalApi.revokeFailed'));
    else await fetchApiKeys();
  };

  const securityMode = config?.settings?.securityMode || 'public';
  const demoMode = config?.demoMode === true;

  const handleModeChange = async (mode: 'public' | 'private') => {
    try {
      setActionSuccess(null);
      setActionError(null);
      if (!await updateConfig({ securityMode: mode })) throw new Error(t('Impossible d’enregistrer la configuration.'));
      setActionSuccess(`Mode de sécurité mis à jour : ${mode === 'private' ? 'Privé strict' : 'Public'}`);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, 'Erreur lors du changement de mode.'));
    }
  };

  const handleSwitchToViewer = async () => {
    try {
      setActionError(null);
      setActionSuccess(null);
      const res = await fetch('/api/auth/switch-to-viewer', { method: 'POST' });
      if (res.ok) {
        // A full reload clears every admin-only client cache after the role switch.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/');
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors du basculement');
      }
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, 'Erreur de basculement.'));
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = users.some(u => u.username.toLowerCase() === username.toLowerCase());
    const changesCurrentPassword = isEdit
      && password.length > 0
      && currentUser?.username.toLowerCase() === username.toLowerCase();
    
    if (!username || (!password && !isEdit)) {
      setActionError('Le nom d\'utilisateur et le mot de passe sont obligatoires.');
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setAddingUser(true);

    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          password: password || undefined, 
          role,
          allowedTabs: savedPermissions(selectedTabs),
          allowedWidgets: savedPermissions(selectedWidgets)
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la configuration de l\'utilisateur');
      }

      if (changesCurrentPassword) {
        await logout({ reason: 'password-changed' });
        return;
      }

      setActionSuccess(`Utilisateur ${username} enregistré avec succès.`);
      setUsername('');
      setPassword('');
      setRole('viewer');
      setSelectedTabs([]);
      setSelectedWidgets([]);
      setEditorOpen(false);
      fetchUsers();
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, 'Une erreur est survenue.'));
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = (userToDelete: string) => {
    setDeleteConfirmUser(userToDelete);
  };

  const confirmDeleteUser = async (userToDelete: string) => {
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/auth/users?username=${encodeURIComponent(userToDelete)}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression');
      }

      setActionSuccess(`Utilisateur ${userToDelete} supprimé.`);
      fetchUsers();
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, 'Une erreur est survenue.'));
    }
  };

  const allSelectableTabs = [...DEFAULT_TABS, ...customTabs.map(t => ({ id: t.id, name: t.name }))];
  const isDefaultAccount = username.toLowerCase() === 'admin' || username.toLowerCase() === 'viewer';

  const toggleTabSelect = (tabId: string) => {
    if (selectedTabs.includes(tabId)) {
      setSelectedTabs(selectedTabs.filter(id => id !== tabId));
    } else {
      setSelectedTabs([...selectedTabs, tabId]);
    }
  };

  const toggleWidgetSelect = (widgetId: string) => {
    if (selectedWidgets.includes(widgetId)) {
      setSelectedWidgets(selectedWidgets.filter(id => id !== widgetId));
    } else {
      setSelectedWidgets([...selectedWidgets, widgetId]);
    }
  };

  const selectAllTabs = () => {
    setSelectedTabs(allSelectableTabs.map(t => t.id));
  };

  const clearAllTabs = () => {
    setSelectedTabs([]);
  };

  const selectAllWidgets = () => {
    setSelectedWidgets(PERMISSION_WIDGETS.map(w => w.id));
  };

  const clearAllWidgets = () => {
    setSelectedWidgets([]);
  };

  const resetForm = () => {
    setUsername(''); setPassword(''); setRole('viewer'); setSelectedTabs([]); setSelectedWidgets([]);
    setActionError(null); setActionSuccess(null);
  };
  const deleteDialog = (
    <ConfirmModal
      isOpen={deleteConfirmUser !== null}
      onClose={() => setDeleteConfirmUser(null)}
      onConfirm={() => { if (deleteConfirmUser) confirmDeleteUser(deleteConfirmUser); }}
      title={t("Supprimer l'utilisateur")}
      description={t('confirm.userDelete', { name: deleteConfirmUser || '' })}
    />
  );
  const editing = users.some(u => u.username.toLowerCase() === username.toLowerCase()) && !!username;
  const tabIcon = (id: string) => ({ dashboard: '🏠', docker: '🐳', networks: '📶', widgets: '🧩' } as Record<string, string>)[id] ?? (config?.settings?.tabIcons?.[id] || '📄');
  return (
    <div className="ndc-set-page">
      <section className="ndc-set-block">
        <CalmeHeading info={demoMode ? t("Les changements de mode ci-dessous sont simulés dans votre session temporaire. Ils ne verrouillent pas cette démo publique et ne modifient aucun compte réel.") : undefined}>{t('settings.calme.access')}</CalmeHeading>
        <CalmeRow label={t("Mode de sécurité global")} info={[t("Le tableau de bord est ouvert à tout le réseau en lecture seule. Les actions Docker et la modification de configuration nécessitent une session d’administration."), t("Rien ne s’affiche sans connexion préalable. Tout visiteur non authentifié est immédiatement redirigé vers l’écran de connexion.")].join(" / ")}>
          <CalmeSegmented
            label={t("Mode de sécurité global")}
            value={securityMode === 'private' ? 'private' : 'public'}
            options={[{ value: 'public', label: t('settings.calme.public') }, { value: 'private', label: t('settings.calme.private') }]}
            onChange={value => handleModeChange(value)}
          />
        </CalmeRow>
      </section>

      {(actionError || actionSuccess) && (
        <div role="status" className={`ndc-set-note ${actionError ? 'is-error' : 'is-ok'}`}>{actionError || actionSuccess}</div>
      )}

      <section className="ndc-set-block">
        <CalmeHeading
          info={demoMode ? t("Une installation NasDash complète permet de créer des administrateurs et observateurs, puis de limiter leurs onglets et widgets. La création de comptes, les mots de passe, la suppression et le test d&apos;une session viewer sont désactivés ici afin de ne jamais recueillir de véritables identifiants.") : undefined}
          action={!demoMode && !editorOpen && (
            <button type="button" className="ndc-text-button" onClick={() => { resetForm(); setEditorOpen(true); }}><Plus size={12} /> {t('settings.calme.addUser')}</button>
          )}
        >{t('settings.calme.users')}</CalmeHeading>
        {!demoMode && (loadingUsers ? <div className="ndc-set-empty">{t("Chargement…")}</div> : users.map(u => {
          const isCurrent = currentUser?.username.toLowerCase() === u.username.toLowerCase();
          const isSystemUser = u.username.toLowerCase() === 'admin' || u.username.toLowerCase() === 'viewer';
          return (
            <div key={u.username} className="ndc-lib-row ndc-lib-row--actions">
              <span className="ndc-lib-icon"><User size={15} /></span>
              <span className="ndc-lib-name" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{u.username}{isCurrent && <span className="ndc-tag" style={{ marginLeft: 8 }}>{t('settings.calme.you')}</span>}</span>
                <span className="ndc-set-list-sub">{u.role === 'admin' ? t('settings.calme.admin') : t('settings.calme.viewer')}</span>
              </span>
              {u.username.toLowerCase() === 'viewer' && currentUser?.role === 'admin' ? (
                <button type="button" className="nd-btn" onClick={handleSwitchToViewer} title={t("Se connecter en tant que spectateur")}>{t("Tester")}</button>
              ) : <span />}
              <span style={{ display: 'flex', gap: 2 }}>
                <button
                  type="button"
                  className="ndc-icon-button"
                  title={t('security.editUserPermissions', { name: u.username })}
                  aria-label={t('security.editUserPermissions', { name: u.username })}
                  onClick={() => { setUsername(u.username); setRole(u.role); setPassword(''); setSelectedTabs(permissionSelection(u.allowedTabs, allSelectableTabs.map(tab => tab.id))); setSelectedWidgets(permissionSelection(u.allowedWidgets, PERMISSION_WIDGETS.map(widget => widget.id))); setActionError(null); setActionSuccess(null); setEditorOpen(true); }}
                ><Pencil size={13} /></button>
                <button type="button" className="ndc-icon-button" disabled={isCurrent || isSystemUser} onClick={() => handleDeleteUser(u.username)} title={t("Supprimer l'utilisateur")} aria-label={t("Supprimer l'utilisateur")}><Trash2 size={13} /></button>
              </span>
            </div>
          );
        }))}
      </section>

      {!demoMode && editorOpen && (
        <form className="ndc-set-block" onSubmit={async event => { await handleAddUser(event); }}>
          <CalmeHeading action={<button type="button" className="ndc-icon-button" aria-label={t("Annuler")} onClick={() => { resetForm(); setEditorOpen(false); }}><X size={14} /></button>}>
            {editing ? t('security.editAccess', { name: username }).replace(/^[^\p{L}]+/u, '') : t('settings.calme.newUser')}
          </CalmeHeading>
          <CalmeRow label={t("Nom d'utilisateur")}>
            <input id="security-username" aria-label={t("Nom d'utilisateur")} type="text" className="nd-input" style={{ width: 240 }} value={username} disabled={isDefaultAccount} onChange={e => setUsername(e.target.value)} placeholder={t("Ex: lucas")} />
          </CalmeRow>
          <CalmeRow label={t("Mot de passe")} info={isDefaultAccount || editing ? t("Laisser vide si inchangé") : undefined}>
            <span className="ndc-password" style={{ width: 240 }}>
              <input id="security-password" aria-label={t("Mot de passe")} type={showPassword ? 'text' : 'password'} className="nd-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              <button type="button" className="ndc-icon-button" onClick={() => setShowPassword(!showPassword)} aria-label={t("settings.calme.showPassword")}>{showPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            </span>
          </CalmeRow>
          <CalmeRow label={t("Rôle")}>
            <CalmeSegmented
              label={t("Rôle")}
              value={role}
              options={[{ value: 'viewer', label: t('settings.calme.viewer') }, { value: 'admin', label: t('settings.calme.admin') }]}
              onChange={value => { if (!isDefaultAccount) setRole(value); }}
            />
          </CalmeRow>
          {role === 'viewer' && (
            <>
              <CalmeHeading action={<span className="ndc-chip-actions"><button type="button" className="ndc-text-button" onClick={selectAllTabs}>{t('settings.calme.all')}</button><button type="button" className="ndc-text-button" onClick={clearAllTabs}>{t('settings.calme.none')}</button></span>}>{t("Onglets autorisés")}</CalmeHeading>
              <div className="ndc-chips">
                {allSelectableTabs.map(tab => (
                  <button key={tab.id} type="button" className="ndc-chip" aria-pressed={selectedTabs.includes(tab.id)} onClick={() => toggleTabSelect(tab.id)}>
                    <Emoji emoji={tabIcon(tab.id)} /> {t(tab.name)}
                  </button>
                ))}
              </div>
              <CalmeHeading action={<span className="ndc-chip-actions"><button type="button" className="ndc-text-button" onClick={selectAllWidgets}>{t('settings.calme.all')}</button><button type="button" className="ndc-text-button" onClick={clearAllWidgets}>{t('settings.calme.none')}</button></span>}>{t("Widgets autorisés")}</CalmeHeading>
              <div className="ndc-chips">
                {PERMISSION_WIDGETS.map(w => (
                  <button key={w.id} type="button" className="ndc-chip" aria-pressed={selectedWidgets.includes(w.id)} onClick={() => toggleWidgetSelect(w.id)}>
                    <Emoji emoji={w.icon} /> {t(w.nameKey)}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="ndc-form-actions">
            <button type="button" className="nd-btn" onClick={() => { resetForm(); setEditorOpen(false); }}>{t("Annuler")}</button>
            <button type="submit" className="nd-btn nd-btn-accent" disabled={addingUser}>{addingUser ? '…' : t("Sauvegarder")}</button>
          </div>
        </form>
      )}

      {!demoMode && (
        <section className="ndc-set-block">
          <CalmeHeading info={t('externalApi.description')}>{t('externalApi.title')}</CalmeHeading>
          <a className="nd-btn" href="/swagger" target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
            <ExternalLink size={14} /> {t('externalApi.swagger')}
          </a>
          {generatedApiToken && (
            <div className="ndc-set-note is-ok">
              <strong>{t('externalApi.copyNow')}</strong>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input className="nd-input" style={{ flex: 1 }} readOnly value={generatedApiToken} aria-label={t('externalApi.generatedKey')} />
                <button type="button" className="ndc-icon-button" aria-label={t('externalApi.copy')} onClick={() => navigator.clipboard.writeText(generatedApiToken)}><Copy size={14} /></button>
                <button type="button" className="nd-btn" onClick={() => setGeneratedApiToken(null)}>{t('externalApi.done')}</button>
              </div>
            </div>
          )}
          {apiKeys.map(key => (
            <div key={key.id} className="ndc-lib-row ndc-lib-row--actions">
              <span className="ndc-lib-icon"><KeyRound size={15} /></span>
              <span className="ndc-lib-name" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{key.name} <span className="ndc-tag">{key.prefix}…</span></span>
                <span className="ndc-set-list-sub">{key.scopes.join(', ')} · {key.revokedAt ? t('externalApi.revoked') : key.expiresAt ? t('externalApi.expires', { date: new Date(key.expiresAt).toLocaleDateString() }) : t('externalApi.neverExpires')}</span>
              </span>
              <button type="button" className="ndc-icon-button" disabled={Boolean(key.revokedAt)} onClick={() => revokeApiKey(key.id)} title={t('externalApi.revoke')} aria-label={t('externalApi.revoke')}><Trash2 size={13} /></button>
            </div>
          ))}
          <form onSubmit={createApiKey} style={{ marginTop: 12 }}>
            <CalmeRow label={t('externalApi.name')}>
              <input className="nd-input" style={{ width: 240 }} value={apiKeyName} maxLength={100} onChange={event => setApiKeyName(event.target.value)} placeholder={t('externalApi.namePlaceholder')} />
            </CalmeRow>
            <CalmeRow label={t('externalApi.expiry')}>
              <select className="nd-input" style={{ width: 240 }} value={apiKeyExpiryDays} onChange={event => setApiKeyExpiryDays(event.target.value)}>
                <option value="30">{t('externalApi.days', { count: 30 })}</option>
                <option value="90">{t('externalApi.days', { count: 90 })}</option>
                <option value="365">{t('externalApi.days', { count: 365 })}</option>
                <option value="never">{t('externalApi.neverExpires')}</option>
              </select>
            </CalmeRow>
            <CalmeHeading>{t('externalApi.scopes')}</CalmeHeading>
            <div className="ndc-chips">
              {API_SCOPES.map(scope => (
                <button key={scope} type="button" className="ndc-chip" aria-pressed={apiKeyScopes.includes(scope)} onClick={() => setApiKeyScopes(current => current.includes(scope) ? current.filter(item => item !== scope) : [...current, scope])}>{scope}</button>
              ))}
            </div>
            <div className="ndc-form-actions">
              <button type="submit" className="nd-btn nd-btn-accent" disabled={creatingApiKey || !apiKeyName.trim() || apiKeyScopes.length === 0}>{creatingApiKey ? '…' : t('externalApi.create')}</button>
            </div>
          </form>
        </section>
      )}
      {deleteDialog}
    </div>
  );
}
