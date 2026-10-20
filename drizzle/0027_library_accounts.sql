CREATE TABLE library_accounts (
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL,
  secret text NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, provider)
);
