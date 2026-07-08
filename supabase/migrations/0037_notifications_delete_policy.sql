-- ============================================================================
-- Notifications: allow users to delete their own notifications (Clear all)
-- ============================================================================

DROP POLICY IF EXISTS "Delete own notifications" ON notifications;
CREATE POLICY "Delete own notifications" ON notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
