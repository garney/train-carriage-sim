CREATE TABLE IF NOT EXISTS public.simulation_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('shared', 'personal')),
  line text NOT NULL CHECK (line IN ('T1', 'T4', 'T9')),
  speed real NOT NULL DEFAULT 1 CHECK (speed >= 0.25 AND speed <= 8),
  state jsonb NOT NULL,
  last_ticked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_shared_simulation_timeline
  ON public.simulation_timelines (scope) WHERE scope = 'shared';
CREATE UNIQUE INDEX IF NOT EXISTS one_personal_simulation_timeline_per_user
  ON public.simulation_timelines (owner_id) WHERE scope = 'personal';

ALTER TABLE public.simulation_timelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulation_timelines_read ON public.simulation_timelines;
CREATE POLICY simulation_timelines_read ON public.simulation_timelines FOR SELECT TO authenticated
  USING (scope = 'shared' OR owner_id = auth.uid());
GRANT ALL ON public.simulation_timelines TO postgres, anon, authenticated, service_role;
