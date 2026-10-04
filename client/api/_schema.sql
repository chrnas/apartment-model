-- Run this once in your Neon database (SQL editor or psql).
-- Stores anonymous reviews. No names, emails, or IPs are collected.
-- author_token is a random, client-generated UUID stored in the visitor's
-- browser localStorage; it is NOT personal data.

CREATE TABLE IF NOT EXISTS reviews (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT     NOT NULL DEFAULT '',
  author_token UUID     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One review per browser token. Remove this if you want to allow multiple.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_author_token_key
  ON reviews (author_token);
