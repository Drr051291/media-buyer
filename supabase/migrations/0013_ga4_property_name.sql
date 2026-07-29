-- Etapa 2 / Onda 2.1 — GA4: exibir a propriedade conectada no painel.
--
-- Ate aqui so persistiamos `ga4_property_id` ('properties/123456'), um id
-- opaco. Para o usuario reconhecer QUAL propriedade esta conectada (a tela de
-- integracoes so mostrava "Conectado"), guardamos tambem o nome amigavel que
-- o Google devolve no Admin API (displayName), capturado no wizard.
--
-- So metadado de exibicao — nada sensivel, nada que entre em calculo. NULL em
-- conexoes antigas (pre-migration) ate a proxima reautorizacao/edicao.
alter table connections add column if not exists ga4_property_name text;
