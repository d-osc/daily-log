import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  NOTE_TYPES,
  NOTE_STATUSES,
  NOTE_ENVIRONMENTS,
  isTauri,
  getNoteStore,
  typeColors,
} from "../lib/notes";
import {
  backupToDrive,
  BUILT_IN_GOOGLE,
  connectGoogle,
  disconnectGoogle,
  isConnected,
  restoreFromDrive,
} from "../lib/google";
import { loadGoogleConfig, saveGoogleConfig } from "../lib/settings";
import { t, setLang, useLang } from "../lib/i18n";

interface SectionCardProps {
  icon: string;
  title: string;
  children: React.ReactNode;
}

function SectionCard({ icon, title, children }: SectionCardProps) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <span className="settings-icon">
          <i className={`fa-solid ${icon}`} aria-hidden="true" />
        </span>
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function LanguageSection() {
  const lang = useLang();
  return (
    <SectionCard icon="fa-language" title={t("language")}>
      <p className="settings-hint">{t("languageHint")}</p>
      <div className="lang-toggle" role="group" aria-label={t("language")}>
        <button
          type="button"
          className={lang === "en" ? "lang-btn active" : "lang-btn"}
          onClick={() => setLang("en")}
        >
          English
        </button>
        <button
          type="button"
          className={lang === "th" ? "lang-btn active" : "lang-btn"}
          onClick={() => setLang("th")}
        >
          ไทย
        </button>
      </div>
    </SectionCard>
  );
}

interface ListSectionProps {
  icon: string;
  title: string;
  hint: string;
  placeholder: string;
  builtin: readonly string[];
  custom: string[];
  /** When given, items render as colored badges (used for note types). */
  colorFor?: (item: string) => { bg: string; fg: string; dot: string };
  onAdd(value: string): void;
  onRemove(value: string): void;
}

function ListSection({
  icon,
  title,
  hint,
  placeholder,
  builtin,
  custom,
  colorFor,
  onAdd,
  onRemove,
}: ListSectionProps) {
  const [value, setValue] = useState("");
  const all = [...builtin, ...custom];
  const canAdd = value.trim().length > 0 && !all.includes(value.trim());

  const add = () => {
    if (!canAdd) return;
    onAdd(value.trim());
    setValue("");
  };

  return (
    <SectionCard icon={icon} title={title}>
      <p className="settings-hint">{hint}</p>
      <div className="type-list">
        {all.map((item) => {
          const isBuiltin = builtin.includes(item);
          const color = colorFor?.(item);
          return (
            <div key={item} className="type-row">
              {color ? (
                <span className="badge" style={{ background: color.bg, color: color.fg }}>
                  <span className="type-dot" style={{ background: color.dot }} />
                  {item}
                </span>
              ) : (
                <span className="list-code">{item}</span>
              )}
              <span className="grow" />
              {isBuiltin ? (
                <span className="builtin-chip">{t("builtin")}</span>
              ) : (
                <button
                  className="btn icon danger row-remove"
                  title={t("removeItem", { name: item })}
                  onClick={() => onRemove(item)}
                >
                  <i className="fa-solid fa-trash-can" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="add-type-form">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder={placeholder}
        />
        <button className="btn primary" onClick={add} disabled={!canAdd}>
          <i className="fa-solid fa-plus" aria-hidden="true" /> {t("add")}
        </button>
      </div>
    </SectionCard>
  );
}

interface SettingsViewProps {
  customTypes: string[];
  onAddType(value: string): void;
  onRemoveType(value: string): void;
  customStatuses: string[];
  onAddStatus(value: string): void;
  onRemoveStatus(value: string): void;
  customEnvironments: string[];
  onAddEnvironment(value: string): void;
  onRemoveEnvironment(value: string): void;
  notesFolder: string | null;
  onChangeNotesFolder(folder: string | null): void;
  onAfterRestore(): Promise<void>;
  onBack(): void;
}

function FolderSection({
  notesFolder,
  onChange,
}: {
  notesFolder: string | null;
  onChange(folder: string | null): void;
}) {
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    if (!isTauri || busy) return;
    setBusy(true);
    try {
      const dir = await open({ directory: true, title: t("chooseFolderTitle") });
      if (typeof dir === "string" && dir.trim()) onChange(dir);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard icon="fa-folder-open" title={t("storage")}>
      <p className="settings-hint">{t("storageHint")}</p>
      <div className="folder-row">
        <span className="folder-path" title={notesFolder ?? ""}>
          <i className="fa-solid fa-hard-drive" aria-hidden="true" style={{ marginRight: 6 }} />
          {notesFolder ?? t("defaultFolder")}
        </span>
        <span className="grow" />
        <button className="btn" onClick={pick} disabled={!isTauri || busy}>
          <i className="fa-solid fa-folder-open" aria-hidden="true" /> {t("chooseFolder")}
        </button>
        {notesFolder && (
          <button className="btn ghost" onClick={() => onChange(null)} disabled={busy}>
            <i className="fa-solid fa-rotate-left" aria-hidden="true" /> {t("restoreDefault")}
          </button>
        )}
      </div>
    </SectionCard>
  );
}

function GoogleSection({ onAfterRestore }: { onAfterRestore(): Promise<void> }) {
  const hasBuiltIn = !!BUILT_IN_GOOGLE.clientId && !!BUILT_IN_GOOGLE.clientSecret;
  const [clientId, setClientId] = useState(() => loadGoogleConfig().clientId);
  const [clientSecret, setClientSecret] = useState(() => loadGoogleConfig().clientSecret);
  const [connected, setConnected] = useState(() => isConnected());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const saveConfig = () => {
    saveGoogleConfig({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    setMessage({ ok: true, text: t("savedCreds") });
  };

  const connect = async () => {
    if (!hasBuiltIn) {
      saveGoogleConfig({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    }
    setBusy(true);
    setMessage(null);
    try {
      const email = await connectGoogle();
      setConnected(true);
      setMessage({ ok: true, text: email ? t("connectedEmail", { email }) : t("connected") });
    } catch (e) {
      setMessage({ ok: false, text: String(e).slice(0, 300) });
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const notes = await getNoteStore().list();
      const n = await backupToDrive(notes);
      setMessage({ ok: true, text: t("backedUp", { n }) });
    } catch (e) {
      setMessage({ ok: false, text: String(e).slice(0, 300) });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const n = await restoreFromDrive();
      await onAfterRestore();
      setMessage({ ok: true, text: t("restoredDrive", { n }) });
    } catch (e) {
      setMessage({ ok: false, text: String(e).slice(0, 300) });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    disconnectGoogle();
    setConnected(false);
    setMessage({ ok: true, text: t("disconnected") });
  };

  return (
    <SectionCard icon="fa-brands fa-google" title={t("google")}>
      <div className="info-callout">
        <i className="fa-solid fa-circle-info" aria-hidden="true" />
        <span>
          {hasBuiltIn ? (
            <>{t("googleBuiltInHint")}</>
          ) : (
            <>{t("googleSetupHint")}</>
          )}
        </span>
      </div>
      {!hasBuiltIn && (
        <div className="google-form">
          <label className="field">
            <span>{t("clientId")}</span>
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" />
          </label>
          <label className="field">
            <span>{t("clientSecret")}</span>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="GOCSPX-..."
            />
          </label>
        </div>
      )}
      <div className="google-actions">
        {!hasBuiltIn && (
          <button className="btn" onClick={saveConfig} disabled={busy}>
            <i className="fa-solid fa-floppy-disk" aria-hidden="true" /> {t("saveCreds")}
          </button>
        )}
        {connected ? (
          <>
            <button className="btn primary" onClick={backup} disabled={busy}>
              <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /> {t("backupDrive")}
            </button>
            <button className="btn" onClick={restore} disabled={busy}>
              <i className="fa-solid fa-cloud-arrow-down" aria-hidden="true" /> {t("restoreDrive")}
            </button>
            <button className="btn ghost" onClick={disconnect} disabled={busy}>
              <i className="fa-solid fa-link-slash" aria-hidden="true" /> {t("disconnect")}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={connect} disabled={busy}>
            <i className="fa-brands fa-google" aria-hidden="true" /> {busy ? t("connecting") : t("connectGoogle")}
          </button>
        )}
      </div>
      {message && <p className={`google-message ${message.ok ? "ok" : "err"}`}>{message.text}</p>}
    </SectionCard>
  );
}

export default function SettingsView({
  customTypes,
  onAddType,
  onRemoveType,
  customStatuses,
  onAddStatus,
  onRemoveStatus,
  customEnvironments,
  onAddEnvironment,
  onRemoveEnvironment,
  notesFolder,
  onChangeNotesFolder,
  onAfterRestore,
  onBack,
}: SettingsViewProps) {
  return (
    <div className="settings-view">
      <header className="view-header">
        <button className="btn ghost" onClick={onBack}>
          <i className="fa-solid fa-arrow-left" aria-hidden="true" /> {t("back")}
        </button>
      </header>

      <div className="settings-page-head">
        <h2>{t("settingsTitle")}</h2>
        <p>{t("settingsSub")}</p>
      </div>

      <div className="settings-sheet">
        <LanguageSection />

        <FolderSection notesFolder={notesFolder} onChange={onChangeNotesFolder} />

        <GoogleSection onAfterRestore={onAfterRestore} />

        <ListSection
          icon="fa-layer-group"
          title={t("typeSection")}
hint={t("typeHint")}
placeholder={t("typePlaceholder")}
          builtin={NOTE_TYPES}
          custom={customTypes}
          colorFor={typeColors}
          onAdd={onAddType}
          onRemove={onRemoveType}
        />

        <ListSection
          icon="fa-list-check"
          title={t("statusSection")}
hint={t("statusHint")}
placeholder={t("statusPlaceholder")}
          builtin={NOTE_STATUSES}
          custom={customStatuses}
          onAdd={onAddStatus}
          onRemove={onRemoveStatus}
        />

        <ListSection
          icon="fa-server"
          title={t("envSection")}
hint={t("envHint")}
placeholder={t("envPlaceholder")}
          builtin={NOTE_ENVIRONMENTS}
          custom={customEnvironments}
          onAdd={onAddEnvironment}
          onRemove={onRemoveEnvironment}
        />
      </div>
    </div>
  );
}
