-- Fase 3 (cont.): motivo da rejeição (memória do agente, PROJECT.md 6.4 item 4
-- — "recomendações rejeitadas pelo usuário e o motivo").
alter table actions add column if not exists decision_note text;
