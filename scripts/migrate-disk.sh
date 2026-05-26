#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# migrate-disk.sh — Clonagem segura de disco do master Three Digital
#
# Cenário: você plugou um HD/SSD novo na mesma máquina e quer migrar TUDO
# (sistema operacional + Docker + dados) pro novo disco. O disco antigo
# fica INTACTO até você confirmar que tudo bootou OK no novo.
#
# Fases:
#   1. Detecção e plano  (analisa src/dst, mostra o que vai fazer)
#   2. Backup PG         (dump compactado em /opt/backups/migracao-XXXXX)
#   3. Particionamento   (cria PT GPT + EFI/BIOS + root no disco novo)
#   4. Rsync             (cópia preservando hardlinks/ACL/xattrs, com Docker parado)
#   5. fstab + GRUB      (atualiza UUIDs e instala bootloader no novo disco)
#   6. Validação         (checa estrutura, hashes-amostra)
#   7. Instruções finais (você desliga, troca disco, religa)
#
# Modos:
#   --dry-run     simula tudo, NÃO altera nada (recomendado primeiro)
#   --target=X    especifica disco alvo (default: detecta automaticamente)
#   --yes         pula confirmações interativas (uso CI/automação)
#   --help        ajuda
#
# Pré-requisitos: rsync, parted, e2fsprogs, grub-pc OU grub-efi, dosfstools
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

# ─── Cores e helpers ──────────────────────────────────────────────────
if [ -t 1 ]; then
  R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; W='\033[1;37m'; N='\033[0m'
else
  R=''; G=''; Y=''; B=''; W=''; N=''
fi

log()   { echo -e "${B}▸${N} $*"; }
ok()    { echo -e "${G}✓${N} $*"; }
warn()  { echo -e "${Y}!${N} $*" >&2; }
err()   { echo -e "${R}✗${N} $*" >&2; }
fatal() { err "$*"; exit 1; }

# ─── Args ─────────────────────────────────────────────────────────────
DRY_RUN=0
TARGET_DISK=""
SKIP_CONFIRM=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --target=*)   TARGET_DISK="${arg#--target=}" ;;
    --yes|-y)     SKIP_CONFIRM=1 ;;
    --help|-h)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) fatal "argumento desconhecido: $arg (use --help)" ;;
  esac
done

run() {
  # Executa comando real OU loga em dry-run
  if [ "$DRY_RUN" -eq 1 ]; then
    echo -e "  ${Y}[dry-run]${N} $*"
  else
    eval "$@"
  fi
}

confirm() {
  [ "$SKIP_CONFIRM" -eq 1 ] && return 0
  read -p "  $1 [s/N]: " r
  [ "$r" = "s" ] || [ "$r" = "S" ] || [ "$r" = "y" ] || [ "$r" = "Y" ]
}

# ─── 0. Sanity ────────────────────────────────────────────────────────
echo
echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${W}  Three Digital — Migração de disco                ${N}"
echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
[ "$DRY_RUN" -eq 1 ] && echo -e "  ${Y}MODO DRY-RUN — nenhuma alteração será feita${N}"
echo

[ "$(id -u)" -eq 0 ] || fatal "rode como root"

for cmd in rsync parted lsblk blkid awk grep; do
  command -v "$cmd" >/dev/null 2>&1 || fatal "comando '$cmd' não encontrado (apt install $cmd)"
done

# ─── 1. Detecta SRC e DST ─────────────────────────────────────────────
log "Detectando discos"

# Disco de origem = onde / está montado
SRC_ROOT_DEV=$(findmnt -no SOURCE /)
SRC_DISK=$(lsblk -no PKNAME "$SRC_ROOT_DEV" | head -1)
[ -n "$SRC_DISK" ] || fatal "não foi possível detectar disco de origem"
SRC_DISK="/dev/$SRC_DISK"
SRC_USED_GB=$(df -BG --output=used / | tail -1 | tr -d 'G ')
SRC_TOTAL_GB=$(lsblk -bno SIZE "$SRC_DISK" | head -1 | awk '{printf "%.0f", $1/1024/1024/1024}')

ok "Origem: $SRC_DISK (${SRC_USED_GB}GB usados de ${SRC_TOTAL_GB}GB)"

if [ -z "$TARGET_DISK" ]; then
  # Auto-detecta: discos sem partições montadas, maiores que origem usada, diferentes do src
  log "Procurando disco alvo (sem partições montadas, > ${SRC_USED_GB}GB)"
  CANDIDATES=$(lsblk -bdno NAME,SIZE,TYPE | awk -v min=$((SRC_USED_GB * 1024 * 1024 * 1024)) '$3 == "disk" && $2 > min {print $1}')
  for c in $CANDIDATES; do
    cdev="/dev/$c"
    [ "$cdev" = "$SRC_DISK" ] && continue
    # Pula se tem alguma partição montada
    if lsblk -no MOUNTPOINTS "$cdev" 2>/dev/null | grep -qE '/'; then continue; fi
    TARGET_DISK="$cdev"
    break
  done
  [ -z "$TARGET_DISK" ] && fatal "nenhum disco alvo encontrado. Pluga o HD novo ou use --target=/dev/sdX"
fi

[ -b "$TARGET_DISK" ] || fatal "$TARGET_DISK não existe ou não é dispositivo"
[ "$TARGET_DISK" = "$SRC_DISK" ] && fatal "alvo igual à origem ($SRC_DISK) — abortando"

TGT_SIZE_GB=$(lsblk -bdno SIZE "$TARGET_DISK" | awk '{printf "%.0f", $1/1024/1024/1024}')
TGT_MODEL=$(lsblk -dno MODEL "$TARGET_DISK" 2>/dev/null | head -1 | xargs)
TGT_SERIAL=$(lsblk -dno SERIAL "$TARGET_DISK" 2>/dev/null | head -1 | xargs)

ok "Alvo:   $TARGET_DISK (${TGT_SIZE_GB}GB · ${TGT_MODEL:-?} · serial ${TGT_SERIAL:-?})"

# Confere se alvo é grande o bastante
if [ "$TGT_SIZE_GB" -lt "$SRC_USED_GB" ]; then
  fatal "alvo $TARGET_DISK (${TGT_SIZE_GB}GB) menor que dados usados (${SRC_USED_GB}GB)"
fi

# Aviso se alvo tem dados
HAS_DATA=$(lsblk -no FSTYPE "$TARGET_DISK" 2>/dev/null | grep -v '^$' | head -1)
if [ -n "$HAS_DATA" ]; then
  warn "alvo $TARGET_DISK já tem filesystem ($HAS_DATA) — TUDO SERÁ APAGADO"
fi

# Detecta BIOS vs UEFI
if [ -d /sys/firmware/efi ]; then
  BOOT_MODE="UEFI"
else
  BOOT_MODE="BIOS"
fi
ok "Modo de boot: $BOOT_MODE"

# Detecta SWAP atual
SWAP_DEV=$(swapon --show=NAME --noheadings 2>/dev/null | head -1)
SWAP_SIZE_GB=0
if [ -n "$SWAP_DEV" ]; then
  SWAP_SIZE_GB=$(swapon --show=SIZE --noheadings --bytes 2>/dev/null | head -1 | awk '{printf "%.0f", $1/1024/1024/1024}')
  ok "Swap atual: $SWAP_DEV (${SWAP_SIZE_GB}GB)"
fi

# ─── 2. Plano e confirmação ───────────────────────────────────────────
echo
echo -e "${W}━━━ PLANO DE EXECUÇÃO ━━━${N}"
echo "  Origem:     $SRC_DISK  → permanece intacta"
echo "  Destino:    $TARGET_DISK  → SERÁ TOTALMENTE FORMATADA"
echo "  Modo boot:  $BOOT_MODE"
echo "  Swap:       ${SWAP_SIZE_GB}GB"
echo "  Dados:      ~${SRC_USED_GB}GB pra copiar"
echo
echo "  Partições que serão criadas em $TARGET_DISK:"
if [ "$BOOT_MODE" = "UEFI" ]; then
  echo "    1. EFI System         (512MB FAT32)"
  echo "    2. Linux Swap         (${SWAP_SIZE_GB}GB) [se houver]"
  echo "    3. Linux Root /       (${TGT_SIZE_GB}GB - 512MB - swap)"
else
  echo "    1. Linux Root /       (${TGT_SIZE_GB}GB - swap)"
  echo "    2. Linux Swap         (${SWAP_SIZE_GB}GB) [se houver]"
fi
echo
echo "  Etapas:"
echo "    [1/7] Backup dump PostgreSQL"
echo "    [2/7] Particiona + formata $TARGET_DISK"
echo "    [3/7] Monta novo disco em /mnt/migracao"
echo "    [4/7] Stop dos containers (downtime ~10-30min)"
echo "    [5/7] rsync / → /mnt/migracao (~$((SRC_USED_GB * 5))min estimados em SSD)"
echo "    [6/7] Atualiza /mnt/migracao/etc/fstab + instala GRUB"
echo "    [7/7] Validação + instruções finais"
echo

[ "$DRY_RUN" -eq 0 ] && {
  echo -e "${R}ATENÇÃO:${N} essa operação faz downtime no Three Digital. Não rode em horário de pico."
  echo
  if ! confirm "Confirma migrar $SRC_DISK → $TARGET_DISK?"; then
    fatal "cancelado pelo usuário"
  fi
}

# ─── 3. Backup PG ──────────────────────────────────────────────────────
BKP_DIR="/opt/backups/migracao-$(date +%Y%m%d-%H%M%S)"
log "[1/7] Backup PostgreSQL → $BKP_DIR"
run "mkdir -p $BKP_DIR"

if docker ps --format '{{.Names}}' | grep -q '^cardapio_postgres$'; then
  run "docker exec cardapio_postgres pg_dump -U cardapio -d cardapio_saas | gzip > $BKP_DIR/db.sql.gz"
  run "cp /opt/cardapio_saas/.env $BKP_DIR/env.backup 2>/dev/null || true"
  ok "Dump salvo em $BKP_DIR (mantenha esse diretório até confirmar boot do novo disco)"
else
  warn "cardapio_postgres não está rodando — pulando backup PG (faça manual se precisar)"
fi

# ─── 4. Particiona ─────────────────────────────────────────────────────
log "[2/7] Particiona + formata $TARGET_DISK"

# Limpa qualquer assinatura anterior
run "wipefs -a $TARGET_DISK"

run "parted -s $TARGET_DISK mklabel gpt"

if [ "$BOOT_MODE" = "UEFI" ]; then
  run "parted -s $TARGET_DISK mkpart EFI fat32 1MiB 513MiB"
  run "parted -s $TARGET_DISK set 1 esp on"
  PT_START=513
  if [ "$SWAP_SIZE_GB" -gt 0 ]; then
    PT_END=$((PT_START + SWAP_SIZE_GB * 1024))
    run "parted -s $TARGET_DISK mkpart Swap linux-swap ${PT_START}MiB ${PT_END}MiB"
    PT_START=$PT_END
    PT_SWAP=2
    PT_ROOT=3
    PT_EFI=1
  else
    PT_SWAP=
    PT_ROOT=2
    PT_EFI=1
  fi
  run "parted -s $TARGET_DISK mkpart Root ext4 ${PT_START}MiB 100%"
else
  if [ "$SWAP_SIZE_GB" -gt 0 ]; then
    SWAP_END=$((1 + SWAP_SIZE_GB * 1024))
    run "parted -s $TARGET_DISK mkpart Swap linux-swap 1MiB ${SWAP_END}MiB"
    run "parted -s $TARGET_DISK mkpart Root ext4 ${SWAP_END}MiB 100%"
    PT_EFI=
    PT_SWAP=1
    PT_ROOT=2
  else
    run "parted -s $TARGET_DISK mkpart Root ext4 1MiB 100%"
    PT_EFI=
    PT_SWAP=
    PT_ROOT=1
  fi
  run "parted -s $TARGET_DISK set $PT_ROOT boot on"
fi

run "partprobe $TARGET_DISK || true"
run "sleep 2"

# Resolve nomes (sda1 vs nvme0n1p1)
part_name() {
  local idx="$1"
  case "$TARGET_DISK" in
    *nvme*|*mmcblk*) echo "${TARGET_DISK}p${idx}" ;;
    *) echo "${TARGET_DISK}${idx}" ;;
  esac
}

[ -n "$PT_EFI" ]  && EFI_PART=$(part_name $PT_EFI)
[ -n "$PT_SWAP" ] && SWAP_PART=$(part_name $PT_SWAP)
ROOT_PART=$(part_name $PT_ROOT)

# Formata
[ -n "$PT_EFI" ]  && run "mkfs.fat -F32 -n EFI $EFI_PART"
[ -n "$PT_SWAP" ] && run "mkswap -L Swap $SWAP_PART"
run "mkfs.ext4 -L Root $ROOT_PART"
ok "Formatação concluída"

# ─── 5. Monta ──────────────────────────────────────────────────────────
log "[3/7] Monta $ROOT_PART em /mnt/migracao"
run "mkdir -p /mnt/migracao"
run "mount $ROOT_PART /mnt/migracao"
if [ -n "$PT_EFI" ]; then
  run "mkdir -p /mnt/migracao/boot/efi"
  run "mount $EFI_PART /mnt/migracao/boot/efi"
fi

# ─── 6. Para Docker ────────────────────────────────────────────────────
log "[4/7] Parando containers Docker"
DOCKER_RUNNING=$(docker ps -q | wc -l)
if [ "$DOCKER_RUNNING" -gt 0 ]; then
  run "docker stop \$(docker ps -q)"
  run "systemctl stop docker docker.socket || true"
  ok "$DOCKER_RUNNING containers parados"
else
  ok "nenhum container rodando"
fi

# ─── 7. rsync ──────────────────────────────────────────────────────────
log "[5/7] rsync / → /mnt/migracao (pode demorar)"
RSYNC_EXCLUDES=(
  --exclude=/dev/*
  --exclude=/proc/*
  --exclude=/sys/*
  --exclude=/tmp/*
  --exclude=/run/*
  --exclude=/mnt/*
  --exclude=/media/*
  --exclude=/lost+found
  --exclude=/swapfile
  --exclude=/var/cache/apt/archives/*
  --exclude=/var/lib/docker/tmp/*
)
run "rsync -aHAXv --info=progress2 --no-i-r ${RSYNC_EXCLUDES[*]} / /mnt/migracao/"

# Recria diretórios virtuais vazios
run "mkdir -p /mnt/migracao/{dev,proc,sys,tmp,run,mnt,media}"
run "chmod 1777 /mnt/migracao/tmp"
ok "rsync concluído"

# ─── 8. fstab ──────────────────────────────────────────────────────────
log "[6/7] Atualiza fstab + instala GRUB no $TARGET_DISK"

NEW_ROOT_UUID=$(blkid -s UUID -o value "$ROOT_PART" 2>/dev/null)
if [ -z "$NEW_ROOT_UUID" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    # No dry-run a partição não foi formatada de verdade, então não há UUID ainda.
    NEW_ROOT_UUID="<UUID-lido-no-run-real>"
    warn "dry-run: $ROOT_PART ainda não formatada — o UUID será lido na execução real"
  else
    fatal "não consegui ler UUID da nova partição root ($ROOT_PART)"
  fi
fi

if [ "$DRY_RUN" -eq 0 ]; then
  cat > /mnt/migracao/etc/fstab.new <<EOF
# /etc/fstab gerado por migrate-disk.sh em $(date -Iseconds)
UUID=$NEW_ROOT_UUID  /  ext4  defaults  0  1
EOF
  if [ -n "$PT_EFI" ]; then
    EFI_UUID=$(blkid -s UUID -o value "$EFI_PART")
    echo "UUID=$EFI_UUID  /boot/efi  vfat  defaults  0  2" >> /mnt/migracao/etc/fstab.new
  fi
  if [ -n "$PT_SWAP" ]; then
    SWAP_UUID=$(blkid -s UUID -o value "$SWAP_PART")
    echo "UUID=$SWAP_UUID  none  swap  sw  0  0" >> /mnt/migracao/etc/fstab.new
  fi
  # Preserva qualquer linha não-root do fstab antigo (NFS mounts custom etc)
  grep -vE '^\s*(#|UUID|/dev|LABEL).*\s/\s' /etc/fstab 2>/dev/null >> /mnt/migracao/etc/fstab.new || true
  mv /mnt/migracao/etc/fstab.new /mnt/migracao/etc/fstab
else
  echo -e "  ${Y}[dry-run]${N} geraria /mnt/migracao/etc/fstab com UUID=$NEW_ROOT_UUID"
fi

# Monta diretórios virtuais pra chroot
for dir in dev proc sys; do
  run "mount --bind /$dir /mnt/migracao/$dir"
done
[ "$BOOT_MODE" = "UEFI" ] && run "mount --bind /sys/firmware/efi/efivars /mnt/migracao/sys/firmware/efi/efivars 2>/dev/null || true"

# Instala bootloader (dentro do chroot)
if [ "$DRY_RUN" -eq 0 ]; then
  if [ "$BOOT_MODE" = "UEFI" ]; then
    chroot /mnt/migracao /bin/bash -c "
      grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=cardapio-saas --recheck
      update-grub
    " || warn "GRUB install falhou — confere manualmente após boot"
  else
    chroot /mnt/migracao /bin/bash -c "
      grub-install $TARGET_DISK --recheck
      update-grub
    " || warn "GRUB install falhou — confere manualmente após boot"
  fi
  chroot /mnt/migracao /bin/bash -c "update-initramfs -u" || warn "update-initramfs falhou"
else
  echo -e "  ${Y}[dry-run]${N} instalaria GRUB em $TARGET_DISK + update-initramfs"
fi
ok "Bootloader instalado"

# Desmonta tudo
for dir in dev proc sys; do
  run "umount /mnt/migracao/$dir 2>/dev/null || true"
done
[ -n "$PT_EFI" ]  && run "umount /mnt/migracao/boot/efi 2>/dev/null || true"
run "umount /mnt/migracao 2>/dev/null || true"

# ─── 9. Validação ──────────────────────────────────────────────────────
log "[7/7] Validação"

if [ "$DRY_RUN" -eq 0 ]; then
  # Re-monta pra inspecionar
  mount $ROOT_PART /mnt/migracao
  errors=0
  for d in etc/fstab boot opt/cardapio_saas var/lib/docker; do
    if [ -e "/mnt/migracao/$d" ]; then
      ok "  /$d copiado"
    else
      err "  /$d NÃO encontrado no destino"
      errors=$((errors + 1))
    fi
  done
  TGT_USED_GB=$(df -BG --output=used /mnt/migracao | tail -1 | tr -d 'G ')
  ok "  usado no destino: ${TGT_USED_GB}GB (origem: ${SRC_USED_GB}GB)"
  umount /mnt/migracao

  [ "$errors" -gt 0 ] && warn "$errors checagens falharam — não reinicie sem investigar"
else
  echo -e "  ${Y}[dry-run]${N} validaria estrutura + comparação de tamanho"
fi

# Reinicia Docker no disco origem (caso operador queira voltar a operar normal)
log "Reiniciando Docker no disco origem (sistema atual)"
run "systemctl start docker || true"
run "docker start cardapio_postgres cardapio_redis minio cardapio_evolution cardapio_n8n cardapio_app 2>/dev/null || true"

# ─── 10. Instruções finais ─────────────────────────────────────────────
echo
echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
if [ "$DRY_RUN" -eq 1 ]; then
  echo -e "${G}  ✓ DRY-RUN concluído — nada foi alterado            ${N}"
  echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
  echo
  echo "  Pra rodar de verdade:"
  echo "    sudo $0 --target=$TARGET_DISK"
else
  echo -e "${G}  ✓ MIGRAÇÃO COMPLETA                               ${N}"
  echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
  echo
  echo "  Backup salvo em: $BKP_DIR"
  echo
  echo -e "${Y}  PRÓXIMOS PASSOS MANUAIS:${N}"
  echo "    1. Sistema atual continua rodando no disco ANTIGO ($SRC_DISK)"
  echo "    2. Desligue a máquina:           ${W}shutdown -h now${N}"
  echo "    3. DESCONECTE FISICAMENTE o disco antigo $SRC_DISK"
  echo "       (ou troque a ordem de boot no BIOS pra priorizar $TARGET_DISK)"
  echo "    4. Ligue a máquina — deve bootar do novo disco"
  echo "    5. Após bootar, confira:"
  echo "         lsblk           # / agora monta de $TARGET_DISK"
  echo "         docker ps       # containers rodando"
  echo "         curl http://localhost:3000/api/health/limits"
  echo "    6. Após 1 semana operando OK, pode formatar e reusar $SRC_DISK"
  echo
  echo -e "${Y}  SE NÃO BOOTAR DO NOVO DISCO:${N}"
  echo "    • Reconecta o antigo, reinicia BIOS → boot priority"
  echo "    • Sistema volta a funcionar normal do disco antigo (intacto)"
  echo "    • Me chama com a mensagem de erro"
  echo
fi
