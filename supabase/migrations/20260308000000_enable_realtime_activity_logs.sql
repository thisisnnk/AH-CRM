-- Enable realtime for activity_logs so the LeadsActivityPage
-- receives live INSERT events via postgres_changes subscription.
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
