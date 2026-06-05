-- 0030_user_favorites.sql — per-user starred tools (REGISTERED users only).
--
-- Favourites are an account feature: anonymous visitors don't get them (the
-- /api/favorites route 401s and the /tools UI hides the star for them). One
-- row per (user, tool). Composite PK on (user_id, tool_id) makes the toggle
-- idempotent (INSERT ... ON DUPLICATE KEY UPDATE is a no-op when already
-- starred) and the per-user list query (WHERE user_id = ?) is covered by the
-- PK's leading column, so no extra index is needed.
--
-- Additive + safe: new table only, no ALTER on existing tables. FK cascades on
-- user delete so favourites are cleaned up with the account (mirrors the files
-- table's onDelete: cascade). user_id varchar(255) matches users.id.
CREATE TABLE IF NOT EXISTS `user_favorites` (
  `user_id` varchar(255) NOT NULL,
  `tool_id` varchar(64) NOT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `tool_id`),
  CONSTRAINT `user_favorites_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
