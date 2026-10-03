import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Cat, Leaf, Bot } from "lucide-react";
import { t, useTranslation } from "../i18n";
import {
  api,
  ApiError,
  avatars,
  avatarColors,
  profileOf,
  validatedProfile,
  type Profile,
  type User,
} from "../lib/api";
import { errorMessage, useRetryDelay } from "../hooks/requestFeedback";
import { RequestProgress, RetryDelay } from "./RequestFeedback";
import { useSettingsDraft } from "./LanguageSettings";

const avatarLabels = {
  initials: "Initials",
  fox: "Fox",
  cat: "Cat",
  robot: "Robot",
  leaf: "Leaf",
};
const colorLabels = {
  slate: "Slate",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  rose: "Rose",
};
export function ProfileAvatar({
  profile,
  small = false,
}: {
  profile: Partial<Profile>;
  small?: boolean;
}) {
  const current = profileOf(profile);
  const Icon =
    current.avatar === "cat"
      ? Cat
      : current.avatar === "robot"
        ? Bot
        : current.avatar === "leaf"
          ? Leaf
          : null;
  return (
    <span
      className={`profile-avatar avatar-${current.avatar_color}${small ? " avatar-small" : ""}`}
      aria-hidden="true"
    >
      {current.avatar === "fox" ? (
        <svg
          width={small ? 20 : 32}
          height={small ? 20 : 32}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        >
          <path d="M3 3 9 7h6l6-4-1 12-8 6-8-6Z" />
          <path d="m4 11 8 7 8-7M8 10h1m6 0h1M10 17h4" />
        </svg>
      ) : Icon ? (
        <Icon size={small ? 20 : 32} />
      ) : (
        current.display_name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}

export function ProfileEditor({
  user,
  token,
  onSaved,
  onExpired,
}: {
  user: User;
  token: string;
  onSaved: (user: User) => void;
  onExpired: () => void;
}) {
  useTranslation();
  const [draft, setDraft] = useState(() => profileOf(user));
  const [baseline, setBaseline] = useState(() => profileOf(user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [checked, setChecked] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const cooldown = useRetryDelay(failure);
  const mounted = useRef(true);
  const lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [token, user.id]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const discard = useCallback(() => {
    setDraft(baseline);
    setNotice("");
    setError("");
  }, [baseline]);
  useSettingsDraft(dirty, busy, discard);
  function edit(update: Partial<Profile>) {
    setDraft((previous) => ({ ...previous, ...update }));
    setNotice("");
  }
  async function request(save: boolean) {
    if (lock.current || cooldown > 0 || (save && uncertain)) return;
    const payload = {
      ...draft,
      display_name: draft.display_name.trim(),
      custom_status: draft.custom_status.trim(),
    };
    if (
      save &&
      (!payload.display_name ||
        payload.display_name.length > 80 ||
        payload.custom_status.length > 120)
    ) {
      setError(
        "Enter a display name of 1–80 characters and a custom status of up to 120 characters.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = save
        ? await api<unknown>("/auth/me", token, "PATCH", payload)
        : await api<unknown>("/auth/me", token);
      if (!mounted.current) return;
      const account = validatedProfile(response, user.id);
      setBaseline(profileOf(account));
      onSaved(account);
      if (save) {
        setDraft(profileOf(account));
        setUncertain(false);
        setNotice("Profile saved.");
      } else {
        setChecked(true);
        setNotice("Profile refreshed. Review your draft before saving again.");
      }
    } catch (cause) {
      if (!mounted.current) return;
      setFailure(cause);
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      if (save && cause instanceof ApiError && cause.outcomeUnknown) {
        setUncertain(true);
        setChecked(false);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <form
      className="profile-editor"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void request(true);
      }}
    >
      <article className="profile-preview" aria-label={t("Profile preview")}>
        <ProfileAvatar profile={draft} />
        <h3>{draft.display_name || t("Display name")}</h3>
        <p>{user.email}</p>
        {draft.custom_status && (
          <p>
            {t("Custom status")}: {draft.custom_status}
          </p>
        )}
      </article>
      <fieldset className="profile-fields" disabled={busy}>
        <label>
          {t("Avatar")}
          <select
            value={draft.avatar}
            onChange={(event) =>
              edit({ avatar: event.target.value as Profile["avatar"] })
            }
          >
            {avatars.map((avatar) => (
              <option key={avatar} value={avatar}>
                {t(avatarLabels[avatar])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Avatar color")}
          <select
            value={draft.avatar_color}
            onChange={(event) =>
              edit({
                avatar_color: event.target.value as Profile["avatar_color"],
              })
            }
          >
            {avatarColors.map((color) => (
              <option key={color} value={color}>
                {t(colorLabels[color])}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() => edit({ avatar: "initials", avatar_color: "slate" })}
        >
          {t("Reset avatar")}
        </button>
        <label>
          {t("Display name")}
          <input
            value={draft.display_name}
            maxLength={80}
            required
            autoComplete="nickname"
            onChange={(event) => edit({ display_name: event.target.value })}
          />
        </label>
        <label>
          {t("Custom status")}
          <input
            value={draft.custom_status}
            maxLength={120}
            onChange={(event) => edit({ custom_status: event.target.value })}
            aria-describedby="custom-status-help"
          />
        </label>
        <p id="custom-status-help">
          {t(
            "Custom status is your own text, separate from your online presence.",
          )}
        </p>
        <button
          type="button"
          className="text-button"
          onClick={() => edit({ custom_status: "" })}
        >
          {t("Clear status")}
        </button>
        <p>
          {t(
            "Teammates see your display name, avatar and custom status in every team. Your email stays private.",
          )}
        </p>
        <button
          className="button"
          disabled={!dirty || uncertain || cooldown > 0}
        >
          {t("Save profile")}
        </button>
      </fieldset>
      <RequestProgress pending={busy} label="Saving…" />
      <RetryDelay seconds={cooldown} />
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
      {notice && <p role="status">{t(notice)}</p>}
      {uncertain && (
        <section role="alert" className="profile-uncertain">
          <p>
            {t(
              "The save may have succeeded. Refresh your profile and review the result before saving again. Your draft is kept.",
            )}
          </p>
          <button
            type="button"
            className="button"
            disabled={busy || cooldown > 0}
            onClick={() => void request(false)}
          >
            {t("Refresh profile")}
          </button>
          <button
            type="button"
            className="button"
            disabled={!checked || busy || cooldown > 0}
            onClick={() => setUncertain(false)}
          >
            {t("I checked — allow a new request")}
          </button>
        </section>
      )}
    </form>
  );
}
