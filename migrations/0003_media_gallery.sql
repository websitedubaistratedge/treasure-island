-- Photos and videos for programmes and boutique products.
--
-- Images stay in media.bytes as before. A video is too big for one row, so its
-- bytes live in media_parts (512 KB each) and are streamed back in order, with
-- byte-range support so browsers can seek. media_links holds the gallery: any
-- number of photos and videos per programme or product, in a chosen order.

ALTER TABLE media ADD COLUMN kind TEXT NOT NULL DEFAULT 'image';
ALTER TABLE media ADD COLUMN status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE media ADD COLUMN duration REAL;
ALTER TABLE media ADD COLUMN poster_id TEXT REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE media ADD COLUMN title TEXT;

CREATE TABLE media_parts (
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  idx      INTEGER NOT NULL,
  bytes    BLOB NOT NULL,
  size     INTEGER NOT NULL,
  PRIMARY KEY (media_id, idx)
);

CREATE TABLE media_links (
  id         INTEGER PRIMARY KEY,
  entity     TEXT NOT NULL CHECK (entity IN ('offering','product')),
  entity_id  INTEGER NOT NULL,
  media_id   TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (entity, entity_id, media_id)
);

CREATE INDEX media_links_entity ON media_links(entity, entity_id, sort);
CREATE INDEX media_kind ON media(kind, created_at);
