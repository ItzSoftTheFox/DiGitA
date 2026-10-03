import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type CreatedInvitation,
  type Invitation,
  type Member,
  type Team,
} from "../lib/api";
import { dateLocale, t, useTranslation } from "../i18n";
import { errorMessage, useRetryDelay } from "../hooks/requestFeedback";
import { RequestProgress, RetryDelay } from "./RequestFeedback";
import { ProfileAvatar } from "./ProfileEditor";

export function TeamAdministration({
  team,
  token,
  accountId,
  revision,
  busy,
  setBusy,
  submitting,
  uncertain,
  onUncertain,
  onAcknowledge,
  onRefresh,
  onExpired,
  onDeleted,
}: {
  team: Team & { role: Member["role"] };
  token: string;
  accountId: string;
  revision: number;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  submitting: { current: boolean };
  uncertain: boolean;
  onUncertain: () => void;
  onAcknowledge: () => void;
  onRefresh: () => void;
  onExpired: () => void;
  onDeleted?: (teamId: string) => void;
}) {
  useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const [copyError, setCopyError] = useState("");
  const invitationCode = useRef<HTMLInputElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<unknown>(null);
  const [checked, setChecked] = useState(false);
  const [available, setAvailable] = useState(true);
  const cooldown = useRetryDelay(failure);
  const mounted = useRef(true);
  const generation = useRef(0);
  const accessNotified = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [team.id, token]);
  const role =
    members.find((member) => member.user_id === accountId)?.role ?? team.role;
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setChecked(false);
    void api<Member[]>(`/teams/${team.id}/members`, token)
      .then(async (roster) => {
        const self = roster.find((member) => member.user_id === accountId);
        if (!self)
          throw new ApiError(
            404,
            "This team or room is no longer available to your account. Refresh your rooms.",
          );
        const active =
          self.role === "member"
            ? []
            : await api<Invitation[]>(`/teams/${team.id}/invitations`, token);
        if (generation.current !== current || !mounted.current) return;
        setMembers(roster);
        setInvitations(active);
        setAvailable(true);
        accessNotified.current = false;
        setCreated((previous) =>
          previous && active.some((invitation) => invitation.id === previous.id)
            ? previous
            : null,
        );
        setChecked(true);
      })
      .catch((cause) => {
        if (generation.current !== current || !mounted.current) return;
        setFailure(cause);
        setError(errorMessage(cause));
        if (
          cause instanceof ApiError &&
          [401, 403, 404].includes(cause.status)
        ) {
          setMembers([]);
          setInvitations([]);
          setCreated(null);
          setAvailable(false);
          if (cause.status === 401) onExpired();
          else if (!accessNotified.current) {
            accessNotified.current = true;
            onRefresh();
          }
        }
      })
      .finally(() => {
        if (generation.current === current && mounted.current)
          setLoading(false);
      });
    return () => {
      if (generation.current === current) generation.current++;
    };
  }, [team.id, team.role, token, accountId, attempt, revision]);
  async function mutate(
    path: string,
    method: string,
    body?: unknown,
    create = false,
  ) {
    if (
      submitting.current ||
      loading ||
      uncertain ||
      cooldown > 0 ||
      !available
    )
      return;
    const current = generation.current;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<CreatedInvitation>(path, token, method, body);
      if (method === "DELETE" && path === `/teams/${team.id}`) {
        onDeleted?.(team.id);
        onRefresh();
        return;
      }
      if (!mounted.current || generation.current !== current) return;
      if (create) {
        if (
          !result ||
          typeof result.id !== "string" ||
          typeof result.code !== "string" ||
          result.code.length !== 43 ||
          !Number.isFinite(Date.parse(result.expires_at))
        ) {
          throw new ApiError(
            0,
            "Could not confirm the invitation. Refresh the active invitations before creating another code.",
            0,
            true,
          );
        }
        setCreated(result);
        setCopyNotice("");
        setCopyError("");
      }
      if (
        method === "DELETE" &&
        created &&
        path.endsWith(`/invitations/${created.id}`)
      )
        setCreated(null);
      setAttempt((value) => value + 1);
      onRefresh();
    } catch (cause) {
      if (!mounted.current || generation.current !== current) {
        if (cause instanceof ApiError && cause.outcomeUnknown) onUncertain();
        return;
      }
      setFailure(cause);
      setError(errorMessage(cause));
      if (cause instanceof ApiError) {
        if (cause.status === 401) onExpired();
        if ([403, 404].includes(cause.status)) {
          setAvailable(false);
          setMembers([]);
          setInvitations([]);
          setCreated(null);
        }
        if ([403, 404, 409].includes(cause.status)) {
          setAttempt((value) => value + 1);
          onRefresh();
        }
        if (cause.outcomeUnknown) {
          setChecked(false);
          onUncertain();
        }
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function copyInvitation() {
    if (!created) return;
    const code = created.code;
    const current = generation.current;
    setCopyNotice("");
    setCopyError("");
    try {
      await navigator.clipboard.writeText(code);
      if (
        mounted.current &&
        generation.current === current &&
        invitationCode.current?.value === code
      ) {
        setCopyNotice("Invitation code copied.");
      }
    } catch {
      if (
        mounted.current &&
        generation.current === current &&
        invitationCode.current?.value === code
      ) {
        setCopyError(
          "Could not copy the invitation code. Select and copy it manually.",
        );
        invitationCode.current.focus();
        invitationCode.current.select();
      }
    }
  }
  const disabled = busy || loading || uncertain || cooldown > 0 || !available;
  return (
    <section
      className="action-panel team-administration"
      id={`team-admin-${team.id}`}
      aria-label={t("Team administration")}
    >
      <div className="team-admin-heading">
        <h3>
          {t("Team administration")} · {team.name}
        </h3>
        <button
          className="button"
          disabled={busy || loading || cooldown > 0}
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
            onRefresh();
          }}
        >
          {t("Refresh team")}
        </button>
      </div>
      <RequestProgress pending={loading} label="Loading team…" />
      <RequestProgress pending={busy} label="Saving…" />
      <RetryDelay seconds={cooldown} />
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
      {uncertain && (
        <section role="alert">
          <p>
            {t(
              "The request may have succeeded. Refresh the team and check members and invitations before sending another request. Invitation codes are shown once and cannot be recovered.",
            )}
          </p>
          <button
            className="button"
            disabled={!checked || loading || busy || cooldown > 0}
            onClick={onAcknowledge}
          >
            {t("I checked — allow a new request")}
          </button>
        </section>
      )}
      {available && (
        <>
          {role === "owner" && (
            <div className="delete-team">
              <p>
                {t(
                  "Deleting this team permanently removes its rooms, memberships and invitations.",
                )}
              </p>
              <button
                className="button danger"
                disabled={disabled}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        "Delete team {name}? Its rooms, memberships and invitations will be permanently removed.",
                        { name: team.name },
                      ),
                    )
                  )
                    void mutate(`/teams/${team.id}`, "DELETE");
                }}
              >
                {t("Delete team")}
              </button>
            </div>
          )}
          <h4>{t("Members")}</h4>
          <ul className="team-member-list">
            {members.map((member) => (
              <li key={member.user_id}>
                <div className="team-member-identity">
                  <ProfileAvatar profile={member} small />
                  <div>
                    <strong>
                      {member.display_name}
                      {member.user_id === accountId ? t(" (you)") : ""}
                    </strong>
                    <p>
                      {t(
                        member.role === "owner"
                          ? "OWNER"
                          : member.role === "admin"
                            ? "ADMIN"
                            : "MEMBER",
                      )}
                    </p>
                    {member.custom_status && (
                      <p>
                        {t("Custom status")}: {member.custom_status}
                      </p>
                    )}
                  </div>
                </div>
                {role === "owner" && member.role !== "owner" && (
                  <div className="team-member-actions">
                    <label>
                      {t("Role for {name}", { name: member.display_name })}
                      <select
                        value={member.role}
                        disabled={disabled}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (
                            window.confirm(
                              t("Change the role for {name}?", {
                                name: member.display_name,
                              }),
                            )
                          )
                            void mutate(
                              `/teams/${team.id}/members/${member.user_id}`,
                              "PATCH",
                              { role: next },
                            );
                        }}
                      >
                        <option value="member">{t("MEMBER")}</option>
                        <option value="admin">{t("ADMIN")}</option>
                      </select>
                    </label>
                    <button
                      className="button"
                      disabled={disabled}
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "Remove {name} from this team? They will lose access to its rooms.",
                              { name: member.display_name },
                            ),
                          )
                        )
                          void mutate(
                            `/teams/${team.id}/members/${member.user_id}`,
                            "DELETE",
                          );
                      }}
                    >
                      {t("Remove {name}", { name: member.display_name })}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {role !== "member" && (
            <>
              <h4>{t("Active invitations")}</h4>
              <p>
                {t(
                  "Codes are single-use and shown only when created. The list contains expiry dates, never codes.",
                )}
              </p>
              {invitations.length ? (
                <ul className="team-invitation-list">
                  {invitations.map((invitation) => (
                    <li key={invitation.id}>
                      <span>
                        {t("Expires")}:{" "}
                        {new Date(invitation.expires_at).toLocaleString(
                          dateLocale(),
                        )}
                      </span>
                      <button
                        className="button"
                        aria-label={t("Revoke invitation {id}", {
                          id: invitation.id,
                        })}
                        disabled={disabled}
                        onClick={() => {
                          if (
                            window.confirm(
                              t(
                                "Revoke this invitation? Its code will stop working.",
                              ),
                            )
                          )
                            void mutate(
                              `/teams/${team.id}/invitations/${invitation.id}`,
                              "DELETE",
                            );
                        }}
                      >
                        {t("Revoke invitation")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                !loading && <p>{t("No active invitations.")}</p>
              )}
              <button
                className="button"
                disabled={disabled}
                onClick={() =>
                  void mutate(
                    `/teams/${team.id}/invitations`,
                    "POST",
                    undefined,
                    true,
                  )
                }
              >
                {t("Invite member")}
              </button>
            </>
          )}
          {role !== "owner" && (
            <button
              className="button leave-team"
              disabled={disabled}
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "Leave {name}? You will lose access to its rooms and need a new invitation to return.",
                      { name: team.name },
                    ),
                  )
                )
                  void mutate(
                    `/teams/${team.id}/members/${accountId}`,
                    "DELETE",
                  );
              }}
            >
              {t("Leave team")}
            </button>
          )}
          {role === "owner" && (
            <p>
              {t("The owner cannot leave the team or change their own role.")}
            </p>
          )}
        </>
      )}
      {created && role !== "member" && (
        <section className="created-invitation">
          <h4>{t("Your invitation is ready")}</h4>
          <p>
            {t("Share this single-use code with a teammate. Expires")}{" "}
            {new Date(created.expires_at).toLocaleString(dateLocale())}.
          </p>
          <input
            ref={invitationCode}
            aria-label={t("Created invitation code")}
            readOnly
            value={created.code}
            onFocus={(event) => event.target.select()}
          />
          <button className="button" onClick={() => void copyInvitation()}>
            {t("Copy invitation code")}
          </button>
          {copyNotice && <p role="status">{t(copyNotice)}</p>}
          {copyError && (
            <p role="alert" className="form-error">
              {t(copyError)}
            </p>
          )}
          <button className="text-button" onClick={() => setCreated(null)}>
            {t("Close invitation")}
          </button>
        </section>
      )}
    </section>
  );
}
