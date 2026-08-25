-- Adds a "reactivated" status so the admin Cancellations tab can reflect a
-- customer resuming their subscription after a cancellation ticket was
-- already resolved — previously the ticket just stayed "cancelled" forever
-- with no way to show it was undone.

ALTER TABLE cancellation_requests DROP CONSTRAINT IF EXISTS cancellation_requests_status_check;

ALTER TABLE cancellation_requests ADD CONSTRAINT cancellation_requests_status_check
  CHECK (status IN ('pending','meeting_scheduled','retained','cancelled','follow_up_required','no_response','reactivated'));
