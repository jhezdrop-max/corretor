# QA Checklist - Bye Trader

## Cadastro e perfil
- [ ] Cadastro exige nome, e-mail, CPF (11 dígitos), chave Pix e endereço residencial.
- [ ] Login bloqueia após múltiplas tentativas inválidas.
- [ ] Edição de perfil atualiza nome no header.

## Depósito
- [ ] Geração de cobrança Pix cria transação `DEPOSIT_CREATED` no extrato.
- [ ] Confirmação de pagamento credita saldo e gera `DEPOSIT_CREDITED`.

## Trade
- [ ] Ordem abre com `openPrice` do ticker ao vivo.
- [ ] Resultado no vencimento compara `closePrice` vs `openPrice` (sem aleatoriedade).
- [ ] CALL ganha quando `closePrice >= openPrice`; PUT ganha quando `closePrice <= openPrice`.
- [ ] Extrato registra `TRADE_OPENED` e `TRADE_WIN` ou `TRADE_LOSS`.

## Saque cliente
- [ ] Solicitar saque desconta saldo e cria `WITHDRAW_REQUESTED`.
- [ ] Tela do cliente mostra status PENDING/PROCESSING/PAID/REJECTED.
- [ ] Rejeição mostra motivo.

## Saque admin
- [ ] Admin move PENDING para PROCESSING.
- [ ] Admin marca PROCESSING como PAID.
- [ ] Admin pode rejeitar (PENDING/PROCESSING) com motivo.
- [ ] Rejeição estorna saldo e gera `WITHDRAW_REJECTED_REFUND`.

## Extrato e filtros
- [ ] Cliente filtra extrato por categoria/status/busca.
- [ ] Admin filtra transações por cliente/categoria/status.

## Observabilidade
- [ ] `/api/health` retorna status OK.
- [ ] `/api/metrics` retorna total de requests e erros 4xx/5xx.

## Segurança básica
- [ ] Chave Pix não está em arquivos de frontend.
- [ ] `.env` não versionado.
