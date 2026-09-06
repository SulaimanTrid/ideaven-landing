"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/auth/auth-provider";
import { authApi } from "@/lib/api";
import { Avatar } from "@/components/profile/avatar";
import { FormAlert, SubmitButton } from "@/components/auth/form-alert";
import { FormField, TextInput } from "@/components/auth/form-field";
import { ApiError } from "@/types/auth";

/**
 * Edits the session user's profile. All four editable fields are sent as one
 * replacement; the server re-validates everything and owns username
 * uniqueness. On success the shared auth context is refreshed so the header
 * and every page see the new values without a reload.
 */
export function ProfileForm() {
  const { user, refresh } = useAuth();
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!user) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setFormError(null);
    setFieldErrors({});
    try {
      await authApi.updateProfile({
        username: username.trim(),
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim(),
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.details) {
          setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        }
      } else {
        setFormError("Something went wrong. Try again shortly.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {formError ? <FormAlert tone="error">{formError}</FormAlert> : null}
      {saved ? (
        <FormAlert tone="success">Profile saved. Your changes are live everywhere.</FormAlert>
      ) : null}

      <div className="flex items-center gap-4">
        <Avatar displayName={displayName || username} avatarUrl={avatarUrl} size="md" />
        <p className="text-[13px] leading-5 text-mist">
          Avatar preview. Paste any http(s) image URL below — direct uploads
          arrive with the editor phase.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField label="Username" error={fieldErrors.username} hint="3–32 characters: letters, numbers, - and _.">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              name="username"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              describedBy={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>

        <FormField label="Display name" error={fieldErrors.displayName} hint="Optional — defaults to your username.">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              describedBy={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>
      </div>

      <FormField label="Bio" error={fieldErrors.bio} hint={`${bio.length}/280 characters.`}>
        {({ id, describedBy, invalid }) => (
          <textarea
            id={id}
            name="bio"
            rows={3}
            maxLength={280}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            placeholder="Tell the community what you build."
            className="w-full resize-y rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
        )}
      </FormField>

      <FormField label="Avatar image URL" error={fieldErrors.avatarUrl} hint="Optional https:// link to an image.">
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            name="avatarUrl"
            type="url"
            inputMode="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder="https://…"
          />
        )}
      </FormField>

      <SubmitButton pending={pending} pendingLabel="Saving…" className="w-full sm:w-auto sm:self-start">
        Save changes
      </SubmitButton>
    </form>
  );
}
