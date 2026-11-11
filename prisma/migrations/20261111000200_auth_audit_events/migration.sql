-- Eventos de autenticação (login e falha de login; RF-AUD-01) não pertencem a uma organização.
-- O runtime pode apenas INSERIR esses eventos com organization_id nulo; a leitura continua restrita ao Superadmin.
CREATE POLICY auth_events_insert ON "audit_logs" FOR INSERT
  WITH CHECK (organization_id IS NULL AND action LIKE 'auth.%' AND actor_type IN ('user', 'system'));
