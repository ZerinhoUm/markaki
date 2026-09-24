# Markaki — Status do Projeto

**Automação de solicitação de serviço extra (RAS Voluntário) no CPROEIS — PMERJ**
Sistema alvo: https://proeis.rj.gov.br
Última atualização: 24/09/2026

---

## ✅ Status: COMPLETO E OPERACIONAL

Teste end-to-end final executado da VPS em 24/09/2026 com sucesso:
login automático (1ª tentativa), navegação até inscrições, filtro com captcha resolvido de primeira.

---

## Como funciona

1. **Painel web (celular)**: http://179.198.117.127:3100 — PIN `1234`
   - Até **3 datas** em ordem de prioridade (se a 1ª não tiver vaga, tenta a 2ª, depois a 3ª)
   - Turno fixo: **06h–18h** ou **07h–19h**
   - Lista de agendados com opção de remover
2. **Cron na VPS**: toda **quinta-feira às 06:00** (America/Sao_Paulo) roda `src/robot.js`
3. **Robô**: login (2Captcha) → Escala → Nova Inscrição → filtra convênio+data →
   acha o evento pelo horário → clica **Participar** → salva prints em `logs/`
4. Solicitações enviadas com sucesso saem da fila; as que falharem ficam para a semana seguinte.

## Infraestrutura

| Item | Onde |
|---|---|
| VPS | Hostinger — `root@179.198.117.127` (Ubuntu 24.04, chave `~/.ssh/vps-db-179`) |
| Projeto na VPS | `/root/markaki` |
| Credenciais | `/root/markaki/.env` (não versionado) |
| Painel | porta **3100**, serviço systemd `markaki-painel` (restart automático) |
| Cron | `0 6 * * 4` → `node src/robot.js` (log em `logs/cron.log`) |
| Repositório | https://github.com/ZerinhoUm/markaki (`origin`, push via token) |

## Configuração (.env)

```
PROEIS_TIPO=ID            # login por ID Funcional (alternativa: CPF)
PROEIS_LOGIN=********     # ID Funcional
PROEIS_SENHA=********     # senha CPROEIS (máx 8 chars)
CAPTCHA_API_KEY=********  # 2Captcha (https://2captcha.com)
PANEL_PIN=1234            # PIN do painel web
PROEIS_CONVENIO=42        # 42 = 40 BPM - RAS
```

## Detalhes técnicos do CPROEIS (mapeamento)

- ASP.NET WebForms. Login: `ddlTipoAcesso` → postback → `txtLogin` / `txtSenha` / `TextCaptcha` / `btnEntrar`
- Captcha = PNG inline (base64) no `background` de um `<div>` — **extrair pelo seletor do div, nunca pelo primeiro base64 do HTML** (o `__VIEWSTATE` embute a imagem velha após postbacks — esse bug custou várias tentativas de login)
- Fluxo: `FrmMenuVoluntario.aspx` → `#btnEscala` → `FrmVoluntarioInscricoesConsultar.aspx` → `#btnNovaInscricao` → `FrmEventoAssociar.aspx`
- Filtros: `#ddlConvenios` (42 = 40 BPM - RAS), `#ddlDataEvento` (labels ISO `YYYY-MM-DD`, só a semana aberta), `#ddlCPAS` (opcional, 15 = 40º BPM - 2º CPA)
- `btnConsultar` (Filtrar) é **async postback** (UpdatePanel); o filtro tem **captcha próprio**
- Assinaturas de resposta do filtro:
  - `lblAvisoEventos` vazio → captcha recusado → tentar de novo
  - "Sem Evento disponível para o filtro aplicado." → captcha aceito, sem vaga → próxima data
  - `.btnParticipar` presentes → grid com vagas → clicar no botão da linha com o horário desejado
- Custos 2Captcha: ~R$0,005 por captcha (alguns por execução; $3 duram meses)

## Pendências / observações

- [ ] **Validar o clique no "Participar" com vaga real** — o grid só aparece quando há vagas (quinta 06:00). O robô tira print de cada etapa; se falhar, conferir `logs/` e ajustar o seletor da linha
- [ ] Apagar repo antigo: https://github.com/simplixTI/markaki/settings → Danger Zone
- [ ] Revogar token do GitHub usado no push (https://github.com/settings/tokens) — ele fica salvo em `.git/config` local para pushes futuros
- [ ] Sessão do CPROEIS expira rápido ("Tempo Sessão") — o robô executa tudo em sequência sem pausas longas por isso

## Comandos úteis

```bash
# Logs da última execução
ssh -i ~/.ssh/vps-db-179 root@179.198.117.127 "tail -50 /root/markaki/logs/cron.log"

# Rodar o robô manualmente (teste)
ssh -i ~/.ssh/vps-db-179 root@179.198.117.127 "cd /root/markaki && node src/robot.js"

# Reiniciar o painel
ssh -i ~/.ssh/vps-db-179 root@179.198.117.127 "systemctl restart markaki-painel"

# Atualizar código na VPS após mudanças locais
cd markaki && git push origin main
ssh -i ~/.ssh/vps-db-179 root@179.198.117.127 "cd /root/markaki && git pull && npm install && systemctl restart markaki-painel"
```
