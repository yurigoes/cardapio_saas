#!/system/bin/sh
# xibo-trial-reset.sh
# Reseta o trial do Xibo Player Android sem perder o registro no CMS.
# Rodar via cron com root.
#
# CONFIG:
#   SAAS_URL = endpoint do seu SaaS pra reportar status
#   PACKAGE  = nome do pacote do Xibo (geralmente uk.org.xibo.client)
#   DIAS_LIMITE = aciona reset se faltarem <= N dias
#
# INSTALA (na TV box, como root):
#   1) Salva este arquivo em /data/local/tmp/xibo-trial-reset.sh
#   2) chmod +x /data/local/tmp/xibo-trial-reset.sh
#   3) Adiciona ao cron/Termux:
#        0 4 * * * /data/local/tmp/xibo-trial-reset.sh >> /data/local/tmp/xibo-trial.log 2>&1
#
# A box vai checar todo dia às 4h. Se faltarem <=2 dias do trial, reseta.

SAAS_URL="https://midiaindoor.tthreedigital.com.br"
PACKAGE="uk.org.xibo.client"
DIAS_LIMITE=2
DATA_DIR="/data/data/$PACKAGE"
PREFS_DIR="$DATA_DIR/shared_prefs"

# Pega hardware key (HWID que o Xibo usa pro CMS)
HARDWARE_KEY=$(grep -oE 'hardwareKey[^>]*>[^<]+' $PREFS_DIR/*.xml 2>/dev/null | head -1 | sed 's/.*>//')
DISPLAY_NOME=$(grep -oE 'displayName[^>]*>[^<]+' $PREFS_DIR/*.xml 2>/dev/null | head -1 | sed 's/.*>//')

# Função pra reportar status pro SaaS
report() {
  acao="$1"; dias="$2"; erro="$3"
  curl -s -X POST "$SAAS_URL/api/publico/trial-status" \
    -H "Content-Type: application/json" \
    -d "{\"hardware_key\":\"$HARDWARE_KEY\",\"display_nome\":\"$DISPLAY_NOME\",\"dias_restantes\":$dias,\"acao_executada\":\"$acao\",\"erro\":\"$erro\"}" \
    > /dev/null 2>&1
}

# =============================================================================
# LÓGICA DE DETECÇÃO DO TRIAL — AJUSTAR APÓS INVESTIGAR ONDE O XIBO GUARDA!
# =============================================================================
# Cenário comum: trial salvo em SharedPreferences com timestamp UNIX de início.
# Exemplo: <long name="trial_start_timestamp" value="1717000000" />
# 14 dias = 1209600 segundos.

TRIAL_FILE="$PREFS_DIR/Xibo.xml"     # ⚠ ajuste após investigar
TRIAL_KEY="trialStartTimestamp"      # ⚠ ajuste após investigar

# Pega valor atual
TRIAL_START=$(grep "name=\"$TRIAL_KEY\"" $TRIAL_FILE 2>/dev/null | grep -oE 'value="[0-9]+' | grep -oE '[0-9]+')
if [ -z "$TRIAL_START" ]; then
  report "erro" 0 "campo $TRIAL_KEY não encontrado em $TRIAL_FILE"
  exit 1
fi

AGORA=$(date +%s)
DECORRIDOS=$(( (AGORA - TRIAL_START) / 86400 ))
DIAS_RESTANTES=$(( 14 - DECORRIDOS ))

echo "[$(date)] trial_start=$TRIAL_START, decorridos=${DECORRIDOS}d, restam=${DIAS_RESTANTES}d"

# Se ainda tem mais de DIAS_LIMITE, só reporta status e sai
if [ "$DIAS_RESTANTES" -gt "$DIAS_LIMITE" ]; then
  report "check" "$DIAS_RESTANTES" ""
  exit 0
fi

# =============================================================================
# RESET — Para o app, reescreve o timestamp, reabre
# =============================================================================
echo "[$(date)] Resetando trial..."

am force-stop "$PACKAGE"
sleep 2

# Reescreve o timestamp pra AGORA (= dia 0 do novo trial)
sed -i "s|name=\"$TRIAL_KEY\" value=\"[0-9]*\"|name=\"$TRIAL_KEY\" value=\"$AGORA\"|" "$TRIAL_FILE"

# Verifica que foi reescrito
NOVO=$(grep "name=\"$TRIAL_KEY\"" $TRIAL_FILE | grep -oE 'value="[0-9]+' | grep -oE '[0-9]+')
if [ "$NOVO" != "$AGORA" ]; then
  report "erro" "$DIAS_RESTANTES" "sed não atualizou o valor"
  exit 1
fi

sleep 1
am start -n "$PACKAGE/.Splash"   # ⚠ pode precisar ajustar o activity name

report "reset" 14 ""
echo "[$(date)] Reset concluído. Novo trial: 14 dias."
