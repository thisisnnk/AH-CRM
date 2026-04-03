-- Enable realtime for tables that need live updates in the UI.
-- activity_logs was already added in 20260308000000_enable_realtime_activity_logs.sql.
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
